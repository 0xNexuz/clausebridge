import { addTiming, anchoredToStart, formatDate } from './contract/terms.ts';
import type { Check, Suggestion } from './types.ts';

/**
 * Re-resolves a pending suggestion's due date from the contract's effective date, for timing written as
 * "within N days of the Effective Date". Used when the effective date is set after the extraction ran.
 */
export function withEffectiveDate(suggestion: Suggestion, effectiveDate: string | null): Suggestion {
  const relative = suggestion.due.relative;
  if (suggestion.status !== 'pending' || !relative || !anchoredToStart(relative.anchor) || suggestion.due.source === 'contract') return suggestion;
  const date = effectiveDate ? addTiming(effectiveDate, relative) : null;
  const unit = `${relative.unit.replace('_', ' ')}${relative.amount === 1 ? '' : 's'}`;
  const check: Check = date
    ? { id: 'date', ok: true, text: `Due ${formatDate(date)}: ${relative.amount} ${unit} ${relative.direction} the effective date (${formatDate(effectiveDate!)})` }
    : { id: 'date', ok: false, text: `Timing is relative (“${relative.text}”). Set the contract’s effective date or enter the date.` };
  const checks = [...suggestion.checks.filter(item => item.id !== 'date'), check];
  return { ...suggestion, due: { ...suggestion.due, date, source: date ? 'computed' : null }, checks, confidence: checks.every(item => item.ok) ? 'high' : 'low' };
}
