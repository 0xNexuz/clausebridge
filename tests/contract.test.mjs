import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeContractText, splitClauses, clauseMarker } from '../lib/contract/clauses.ts';
import { findQuote, findDates, findAmounts, findRelativeTiming, findRecurrence, addTiming, anchoredToStart, parseMoneyInput, formatMoney } from '../lib/contract/terms.ts';

const sample = name => normalizeContractText(readFileSync(new URL(`../data/samples/${name}.txt`, import.meta.url), 'utf8'));

test('splits the sample contract into numbered clauses with exact offsets', () => {
  const text = sample('website-redesign');
  const clauses = splitClauses(text);
  const refs = clauses.map(clause => clause.ref);
  assert.equal(refs[0], 'Preamble');
  for (const ref of ['1', '1.1', '2.1', '2.5', '3.2', '3.4', '5.1', '8.1', 'Schedule A']) assert.ok(refs.includes(ref), `missing ${ref}`);
  const c32 = clauses.find(clause => clause.ref === '3.2');
  assert.equal(c32.label, 'Clause 3.2');
  assert.match(text.slice(c32.start, c32.end), /^3\.2 The Client shall pay a deposit of USD 4,500/);
  const heading = clauses.find(clause => clause.ref === '3');
  assert.equal(heading.heading, 'Fees and Payment');
  for (let i = 1; i < clauses.length; i++) assert.ok(clauses[i].start > clauses[i - 1].start);
});

test('does not mistake a date or amount at the start of a line for a clause number', () => {
  assert.equal(clauseMarker('15 March 2026 is the start date.'), null);
  assert.equal(clauseMarker('Clause 7: Termination').ref, '7');
  assert.equal(clauseMarker('Schedule B Pricing').ref, 'Schedule B');
  assert.equal(clauseMarker('12. Notices').ref, '12');
});

test('re-joins lines a PDF wrapped mid-sentence and drops page numbers', () => {
  const raw = '1. Payment\n1.1 The Client shall pay the\ndeposit within seven days\nof signing.\n2\n1.2 Next clause.';
  assert.equal(normalizeContractText(raw), '1. Payment\n1.1 The Client shall pay the deposit within seven days of signing.\n1.2 Next clause.');
});

test('finds a quote despite curly quotes, case and spacing, preferring the hinted clause', () => {
  const text = 'The Agency shall deliver the “Mockups”  by 11 December 2026.\nThe Agency shall deliver the "mockups" again.';
  const hit = findQuote(text, 'the agency shall deliver the "Mockups" by 11 December 2026');
  assert.deepEqual(hit, { start: 0, end: text.indexOf('2026') + 4 });
  assert.equal(findQuote(text, 'The Agency shall deliver ... 2026'), null, 'elided quotes are rejected');
  assert.equal(findQuote(text, 'deliver the logo by Friday'), null);
});

test('reads calendar dates in the common written forms', () => {
  const found = findDates('by 20 November 2026, or March 31, 2027, or 2027-01-29, or 31st day of December 2026, or 05/02/2027');
  assert.deepEqual(found.map(date => date.iso), ['2026-11-20', '2027-03-31', '2027-01-29', '2026-12-31', '2027-02-05']);
  assert.equal(found[4].ambiguous, true, '05/02/2027 could be either order');
  assert.equal(findDates('on 31/02/2026').length, 0, 'impossible dates are ignored');
});

test('reads money only when a currency is written', () => {
  assert.deepEqual(findAmounts('a deposit of USD 4,500 within seven (7) days').map(a => [a.cents, a.currency]), [[450000, 'USD']]);
  assert.deepEqual(findAmounts('NGN 1,250,000 and ₦2,000.50 and $1.2 million and 300 euros').map(a => [a.cents, a.currency]),
    [[125000000, 'NGN'], [200050, 'NGN'], [120000000, 'USD'], [30000, 'EUR']]);
  assert.equal(findAmounts('within 14 days of 3 November 2026').length, 0);
  assert.equal(formatMoney(450000, 'USD'), 'USD 4,500.00');
  assert.equal(parseMoneyInput('4,500.5'), 450050);
  assert.equal(parseMoneyInput('12abc'), null);
});

test('reads relative timing and resolves it from the effective date', () => {
  const timing = findRelativeTiming('pay a deposit of USD 4,500 within seven (7) days of the Effective Date');
  assert.deepEqual({ ...timing, text: undefined }, { amount: 7, unit: 'day', direction: 'after', anchor: 'the Effective Date', text: undefined });
  assert.ok(anchoredToStart(timing.anchor));
  assert.equal(addTiming('2026-11-03', timing), '2026-11-10');
  const business = findRelativeTiming('notify the Client within five (5) business days of the Effective Date');
  assert.equal(addTiming('2026-11-03', business), '2026-11-10', 'Tue + 5 business days = next Tue');
  const before = findRelativeTiming('no later than thirty (30) days before the end of the Term');
  assert.equal(before.direction, 'before');
  assert.equal(anchoredToStart(before.anchor), false);
  assert.equal(findRecurrence('a written status report on the first business day of each month'), 'on the first business day of each month');
  assert.equal(addTiming('2027-01-31', { amount: 1, unit: 'month', direction: 'after' }), '2027-02-28');
});

test('an amount is read only when its number ends there, so other number formats are never misread', () => {
  assert.deepEqual(findAmounts('a fee of EUR 1.234,56'), [], 'European format is left for a person, not read as EUR 1.23');
  assert.deepEqual(findAmounts('USD 4,500.555 and $1,2345'), [], 'not read as USD 4,500.55 or $1,234');
  assert.deepEqual(findAmounts('pay USD 4,500. Then $2.5k, then ₦3m.').map(a => [a.cents, a.currency]), [[450000, 'USD'], [250000, 'USD'], [300000000, 'NGN']]);
});

test('a JSON number means the same as typed text, not cents', () => {
  assert.equal(parseMoneyInput(4500), 450000);
  assert.equal(parseMoneyInput(4500.5), 450050);
  assert.equal(parseMoneyInput('4500'), parseMoneyInput(4500));
  assert.equal(parseMoneyInput(0.1 + 0.2), null, 'more than two decimals is refused');
  assert.equal(parseMoneyInput(-5), null);
  assert.equal(parseMoneyInput(Number.NaN), null);
});

test('control characters are removed from contract text', () => {
  const text = normalizeContractText('1. Payment\n1.1 The Client shall pay USD 4,500 within seven (7) days.\x1aLate fees apply.\f\n\x0c2\n1.2 Next\x0bclause.');
  assert.equal(text, '1. Payment\n1.1 The Client shall pay USD 4,500 within seven (7) days. Late fees apply.\n1.2 Next clause.');
});
