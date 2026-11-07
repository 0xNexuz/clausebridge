/**
 * iCalendar (RFC 5545) feed of obligation due dates, so reminders arrive in Google, Apple or Outlook
 * calendars without an email service. Each event is an all-day event with an alert the day before.
 */
import { formatMoney } from './contract/terms.ts';
import { STATUS_LABEL, type Obligation } from './types.ts';

function escapeText(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds content lines at 75 octets as the standard requires. */
function fold(line: string) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > (parts.length ? 74 : 75)) { parts.push(current); current = ''; }
    current += char;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compact = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

export function obligationsCalendar(obligations: (Obligation & { workspaceName?: string })[], appUrl: string, stamp = new Date()) {
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ClauseBridge//Obligations//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:ClauseBridge obligations', 'X-PUBLISHED-TTL:PT6H'];
  for (const ob of obligations) {
    if (!ob.dueDate) continue;
    const money = ob.kind === 'payment' && ob.amountCents !== null && ob.currency ? ` (${formatMoney(ob.amountCents - ob.paidCents, ob.currency)} outstanding)` : '';
    const summary = `${ob.status === 'done' ? '✓ ' : ''}${ob.ref} ${ob.title}${money}`;
    const description = [`${ob.contractTitle}, ${ob.clauseLabel}`, `“${ob.quote}”`, `Status: ${STATUS_LABEL[ob.status]}`,
      ob.ownerName ? `Owner: ${ob.ownerName}` : 'No owner yet', ob.workspaceName ? `Workspace: ${ob.workspaceName}` : '',
      `${appUrl}/app?obligation=${ob.id}`].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${ob.id}@clausebridge`, `DTSTAMP:${dtstamp}`, `DTSTART;VALUE=DATE:${compact(ob.dueDate)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(ob.dueDate))}`, `SUMMARY:${escapeText(summary)}`, `DESCRIPTION:${escapeText(description)}`,
      `URL:${appUrl}/app?obligation=${ob.id}`, 'TRANSP:TRANSPARENT');
    if (ob.status !== 'done') {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(`Due tomorrow: ${ob.ref} ${ob.title}`)}`, 'TRIGGER:-PT15H', 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
