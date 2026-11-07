/**
 * ClauseBridge's own readers for contract terms. Every date and amount on a suggestion comes from these
 * functions applied to the quoted contract text, never from the model's output.
 */

// ---------- quotes ----------

const QUOTE_EQUIVALENTS: [RegExp, string][] = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐-―−]/g, '-'],
  [/…/g, '...'],
];

/** Lower-cased, punctuation-unified, whitespace-collapsed copy of `text` plus a map back to original offsets. */
function foldWithMap(text: string) {
  let folded = '';
  const map: number[] = [];
  let lastWasSpace = false;
  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    for (const [pattern, replacement] of QUOTE_EQUIVALENTS) { pattern.lastIndex = 0; if (pattern.test(ch)) { ch = replacement; break; } }
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      ch = ' ';
      lastWasSpace = true;
    } else lastWasSpace = false;
    for (const part of ch.toLowerCase()) { folded += part; map.push(i); }
  }
  return { folded, map };
}

export const MIN_QUOTE_CHARS = 12;
export const MAX_QUOTE_CHARS = 400;

/**
 * Finds `quote` in `text` (ignoring case, curly quotes, dash styles and spacing), preferring a match inside
 * [rangeStart, rangeEnd). Returns original-text offsets, or null when the quote is not in the contract.
 */
export function findQuote(text: string, quote: string, rangeStart = 0, rangeEnd = text.length): { start: number; end: number } | null {
  const trimmed = quote.trim().replace(/^["'“‘]+|["'”’]+$/g, '').replace(/[.;,]+$/, '').trim();
  if (trimmed.length < MIN_QUOTE_CHARS || trimmed.length > MAX_QUOTE_CHARS) return null;
  if (/\.\.\.|…|\[\s*\.\.\.\s*\]/.test(trimmed)) return null; // an elided quote is not a contiguous citation
  const { folded, map } = foldWithMap(text);
  const needle = foldWithMap(trimmed).folded.trim();
  const toOriginal = (index: number) => ({ start: map[index], end: map[index + needle.length - 1] + 1 });
  let from = 0;
  let fallback: { start: number; end: number } | null = null;
  while (true) {
    const index = folded.indexOf(needle, from);
    if (index < 0) break;
    const hit = toOriginal(index);
    if (hit.start >= rangeStart && hit.end <= rangeEnd) return hit;
    fallback ??= hit;
    from = index + 1;
  }
  return fallback;
}

// ---------- dates ----------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';

export type FoundDate = { iso: string; text: string; start: number; end: number; ambiguous?: boolean };

export function isoDate(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return isoDate(y, m, d) === value;
}

/** Calendar dates written in `text`: "31 March 2026", "March 31, 2026", "2026-03-31", "31/03/2026", "31-Mar-2026". */
export function findDates(text: string): FoundDate[] {
  const found: FoundDate[] = [];
  const push = (iso: string | null, match: RegExpExecArray, ambiguous = false) => {
    if (!iso) return;
    const start = match.index;
    const end = start + match[0].length;
    if (found.some(item => start < item.end && end > item.start)) return;
    found.push({ iso, text: match[0], start, end, ...(ambiguous ? { ambiguous } : {}) });
  };
  const patterns: [RegExp, (m: RegExpExecArray) => void][] = [
    [/\b(\d{4})-(\d{2})-(\d{2})\b/g, m => push(isoDate(+m[1], +m[2], +m[3]), m)],
    [new RegExp(`\\b${DAY}(?:\\s+day\\s+of)?\\s+${MONTH},?\\s+(\\d{4})\\b`, 'gi'), m => push(isoDate(+m[3], MONTHS[m[2].toLowerCase().replace('.', '')], +m[1]), m)],
    [new RegExp(`\\b${MONTH}\\s+${DAY},?\\s+(\\d{4})\\b`, 'gi'), m => push(isoDate(+m[3], MONTHS[m[1].toLowerCase().replace('.', '')], +m[2]), m)],
    [new RegExp(`\\b(\\d{1,2})-${MONTH}-(\\d{4})\\b`, 'gi'), m => push(isoDate(+m[3], MONTHS[m[2].toLowerCase().replace('.', '')], +m[1]), m)],
    // Numeric day/month/year. Read as day first (the convention in most of the world); flagged when either order is valid.
    [/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/g, m => {
      const a = +m[1], b = +m[2], year = +m[3];
      const dayFirst = isoDate(year, b, a);
      const monthFirst = isoDate(year, a, b);
      if (dayFirst) push(dayFirst, m, Boolean(monthFirst && monthFirst !== dayFirst));
      else push(monthFirst, m);
    }],
  ];
  for (const [pattern, handle] of patterns) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) handle(match);
  }
  return found.sort((a, b) => a.start - b.start);
}

// ---------- timing words ----------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  'twenty-one': 21, 'twenty-eight': 28, thirty: 30, 'thirty-one': 31, forty: 40, 'forty-five': 45, sixty: 60, ninety: 90,
};

export type RelativeTiming = {
  amount: number;
  unit: 'day' | 'business_day' | 'week' | 'month';
  direction: 'after' | 'before';
  anchor: string;
  text: string;
};

/** "within fourteen (14) days of signing", "no later than 30 days after the Effective Date", "net 30". */
export function findRelativeTiming(text: string): RelativeTiming | null {
  const pattern = /\b(within|no later than|not later than|at least|no less than|not less than)\s+([a-z-]+|\d{1,3})(?:\s*\((\d{1,3})\))?\s+(business\s+|working\s+|calendar\s+)?(days?|weeks?|months?)\s+(of|after|from|following|before|prior to)\s+([^,.;]{3,80})/i;
  const match = pattern.exec(text);
  if (match) {
    const amount = match[3] ? Number(match[3]) : /^\d+$/.test(match[2]) ? Number(match[2]) : NUMBER_WORDS[match[2].toLowerCase()];
    if (amount && amount <= 730) {
      const unitWord = match[5].toLowerCase().replace(/s$/, '');
      const business = /business|working/i.test(match[4] ?? '');
      const unit = unitWord === 'day' ? (business ? 'business_day' : 'day') : unitWord === 'week' ? 'week' : 'month';
      const before = /before|prior|at least|no less|not less/i.test(`${match[1]} ${match[6]}`) && /before|prior/i.test(match[6]);
      return { amount, unit, direction: before ? 'before' : 'after', anchor: match[7].trim(), text: match[0].trim() };
    }
  }
  const net = /\bnet\s+(\d{1,3})\b/i.exec(text);
  if (net) return { amount: Number(net[1]), unit: 'day', direction: 'after', anchor: 'invoice', text: net[0] };
  return null;
}

export function findRecurrence(text: string): string | null {
  const match = /\b(?:(?:on|by)\s+)?(?:the\s+)?(?:(?:\d{1,2}(?:st|nd|rd|th)?|first|second|third|last)\s+(?:business\s+|working\s+|calendar\s+)?day\s+of\s+)?(?:each|every)\s+(?:calendar\s+)?(?:week|month|quarter|year)\b|\b(?:weekly|monthly|quarterly|annually|yearly)\b/i.exec(text);
  return match ? match[0].trim() : null;
}

/** Adds a relative timing to an ISO anchor date (business days skip Saturday and Sunday). */
export function addTiming(anchorIso: string, timing: Pick<RelativeTiming, 'amount' | 'unit' | 'direction'>): string | null {
  if (!isValidIsoDate(anchorIso)) return null;
  const sign = timing.direction === 'before' ? -1 : 1;
  const date = new Date(`${anchorIso}T00:00:00Z`);
  if (timing.unit === 'day') date.setUTCDate(date.getUTCDate() + sign * timing.amount);
  else if (timing.unit === 'week') date.setUTCDate(date.getUTCDate() + sign * timing.amount * 7);
  else if (timing.unit === 'month') {
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + sign * timing.amount);
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, last));
  } else {
    let left = timing.amount;
    while (left > 0) {
      date.setUTCDate(date.getUTCDate() + sign);
      const weekday = date.getUTCDay();
      if (weekday !== 0 && weekday !== 6) left--;
    }
  }
  return date.toISOString().slice(0, 10);
}

/** True when a timing's anchor refers to the contract start, so the effective date can resolve it. */
export function anchoredToStart(anchor: string) {
  return /\b(effective date|commencement( date)?|signing|signature|execution|the date of this agreement|date hereof|start date)\b/i.test(anchor);
}

// ---------- money ----------

export const CURRENCIES: Record<string, string> = {
  '$': 'USD', 'us$': 'USD', usd: 'USD', '€': 'EUR', eur: 'EUR', '£': 'GBP', gbp: 'GBP', '₦': 'NGN', ngn: 'NGN',
  naira: 'NGN', cad: 'CAD', 'c$': 'CAD', aud: 'AUD', 'a$': 'AUD', kes: 'KES', ksh: 'KES', zar: 'ZAR',
  ghs: 'GHS', 'gh₵': 'GHS', '₵': 'GHS', inr: 'INR', '₹': 'INR', jpy: 'JPY', '¥': 'JPY', chf: 'CHF',
  dollars: 'USD', euros: 'EUR', pounds: 'GBP',
};
const SYMBOL = '(US\\$|C\\$|A\\$|GH₵|[$€£₦₵₹¥]|\\b(?:USD|EUR|GBP|NGN|CAD|AUD|KES|KSh|ZAR|GHS|INR|JPY|CHF)\\b)';
// The number must end there: "EUR 1.234,56" or "USD 4,500.555" is not read at all rather than read as 1.23 or 4,500.55.
const AMOUNT = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)(?!\\d|[.,]\\d)';
const SCALE = '(?:\\s*(million|thousand|m|k)\\b)?';
const WORD_CURRENCY = '\\s+(dollars|euros|pounds|naira)\\b';

export type FoundAmount = { cents: number; currency: string; text: string; start: number; end: number };

function toCents(amount: string, scale: string | undefined): number | null {
  const plain = amount.replace(/,/g, '');
  const [whole, fraction = ''] = plain.split('.');
  let cents = Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
  const multiplier = !scale ? 1 : /^(million|m)$/i.test(scale) ? 1_000_000 : 1_000;
  if (multiplier > 1) {
    // "1.25 million": scale the exact decimal, keeping integer cents.
    const digits = fraction.length;
    cents = Math.round(Number(whole + fraction) * multiplier * 100 / 10 ** digits);
  }
  return Number.isSafeInteger(cents) && cents > 0 && cents < 1e15 ? cents : null;
}

/** Money written in `text` with an explicit currency: "USD 4,500", "$4,500.00", "₦1,250,000", "4,500 dollars". */
export function findAmounts(text: string): FoundAmount[] {
  const found: FoundAmount[] = [];
  const push = (cents: number | null, currencyText: string, match: RegExpExecArray) => {
    const currency = CURRENCIES[currencyText.toLowerCase()];
    if (!cents || !currency) return;
    const start = match.index;
    const end = start + match[0].length;
    if (found.some(item => start < item.end && end > item.start)) return;
    found.push({ cents, currency, text: match[0].trim(), start, end });
  };
  const before = new RegExp(`${SYMBOL}\\s?${AMOUNT}${SCALE}`, 'gi');
  for (let m = before.exec(text); m; m = before.exec(text)) push(toCents(m[2], m[3]), m[1], m);
  const after = new RegExp(`(?<![\\d.,])${AMOUNT}${SCALE}\\s?${SYMBOL}`, 'gi');
  for (let m = after.exec(text); m; m = after.exec(text)) push(toCents(m[1], m[2]), m[3], m);
  const words = new RegExp(`(?<![\\d.,])${AMOUNT}${SCALE}${WORD_CURRENCY}`, 'gi');
  for (let m = words.exec(text); m; m = words.exec(text)) push(toCents(m[1], m[2]), m[3], m);
  return found.sort((a, b) => a.start - b.start);
}

export function formatMoney(cents: number, currency: string) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}${currency} ${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** Parses a person-entered amount such as "4,500" or "4500.50" into integer cents. */
export function parseMoneyInput(value: unknown): number | null {
  // A JSON number means the same as the string a person types (4500 is 4,500.00), never cents.
  if (typeof value === 'number') value = Number.isFinite(value) ? String(value) : '';
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/,/g, '');
  if (!/^\d{1,13}(?:\.\d{1,2})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2));
}

export function formatDate(iso: string) {
  if (!isValidIsoDate(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}
