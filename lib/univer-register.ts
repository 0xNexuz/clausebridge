'use client';
// Univer Sheets for ClauseBridge: the obligations register (a Univer Sheets table) and the payment schedule,
// whose totals are Univer formulas that ClauseBridge re-checks to the cent. Loaded lazily.
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import { UniverSheetsTablePreset } from '@univerjs/preset-sheets-table';
import UniverPresetSheetsTableEnUS from '@univerjs/preset-sheets-table/locales/en-US';
import { createUniver, LocaleType, mergeLocales, type ICellData, type IStyleData, type IWorkbookData } from '@univerjs/presets';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-table/lib/index.css';
import { formatDate } from './contract/terms.ts';
import { KIND_LABEL, STATUS_LABEL, type Obligation } from './types.ts';

export const REGISTER_SHEET = 'register';
export const PAYMENTS_SHEET = 'payments';
const PAYMENT_FIRST_ROW = 4; // row index of the first payment (row 5 in the sheet)

const STYLES: Record<string, IStyleData> = {
  head: { bl: 1, bg: { rgb: '#E9EEE8' }, cl: { rgb: '#1B1F24' } },
  title: { bl: 1, fs: 14 },
  muted: { cl: { rgb: '#5E6672' }, it: 1 },
  date: { n: { pattern: 'yyyy-mm-dd' } },
  money: { n: { pattern: '#,##0.00' } },
  moneyEdit: { n: { pattern: '#,##0.00' }, bg: { rgb: '#FFF8DC' } },
  dateEdit: { n: { pattern: 'yyyy-mm-dd' }, bg: { rgb: '#FFF8DC' } },
  total: { bl: 1, n: { pattern: '#,##0.00' }, bg: { rgb: '#F3F5F1' } },
  totalLabel: { bl: 1, bg: { rgb: '#F3F5F1' } },
};

/** Days since 1899-12-30, the spreadsheet date serial. */
export function dateSerial(iso: string) {
  return Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000) + 25569;
}
export function serialToIso(serial: number) {
  return new Date((Math.round(serial) - 25569) * 86_400_000).toISOString().slice(0, 10);
}
const col = (index: number) => String.fromCharCode(65 + index);

export type PaymentRow = { id: string; ref: string; version: number; currency: string; amountCents: number; row: number };
export type PaymentLayout = { rows: PaymentRow[]; currencies: string[]; totalsRow: number; lastRow: number };

export function paymentLayout(obligations: Obligation[]): PaymentLayout {
  const payments = obligations.filter(ob => ob.kind === 'payment' && ob.amountCents !== null && ob.currency)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.ref.localeCompare(b.ref));
  const rows = payments.map((ob, index) => ({ id: ob.id, ref: ob.ref, version: ob.version, currency: ob.currency!, amountCents: ob.amountCents!, row: PAYMENT_FIRST_ROW + index }));
  const lastRow = PAYMENT_FIRST_ROW + Math.max(rows.length, 1) - 1;
  return { rows, currencies: [...new Set(rows.map(row => row.currency))].sort(), totalsRow: lastRow + 3, lastRow };
}

/** Builds the two-sheet workbook. Paid and Paid on are the only cells ClauseBridge reads back. */
export function registerWorkbook(obligations: Obligation[], today: string): { data: Partial<IWorkbookData>; layout: PaymentLayout } {
  const register: Record<number, Record<number, ICellData>> = {};
  const headers = ['Ref', 'Contract', 'Clause', 'Type', 'Obligation', 'Responsible party', 'Owner', 'Due', 'Status', 'Evidence'];
  register[0] = Object.fromEntries(headers.map((h, c) => [c, { v: h, s: 'head' }]));
  obligations.forEach((ob, index) => {
    register[index + 1] = {
      0: { v: ob.ref }, 1: { v: ob.contractTitle }, 2: { v: ob.clauseLabel }, 3: { v: KIND_LABEL[ob.kind] }, 4: { v: ob.title },
      5: { v: ob.party }, 6: { v: ob.ownerName ?? '' }, 7: ob.dueDate ? { v: dateSerial(ob.dueDate), s: 'date' } : { v: '' },
      8: { v: STATUS_LABEL[ob.status] }, 9: { v: ob.evidenceCount },
    };
  });

  const layout = paymentLayout(obligations);
  const byId = new Map(obligations.map(ob => [ob.id, ob]));
  const payments: Record<number, Record<number, ICellData>> = {
    0: { 0: { v: 'Payment schedule', s: 'title' } },
    1: { 0: { v: 'As of' }, 1: { v: dateSerial(today), s: 'date' }, 3: { v: 'Edit the yellow cells (Paid, Paid on), then choose “Save payments”. Totals are Univer formulas, re-checked by ClauseBridge.', s: 'muted' } },
    3: Object.fromEntries(['Ref', 'Contract', 'Clause', 'Payable by', 'Due', 'Currency', 'Amount', 'Paid', 'Outstanding', 'Paid on', 'Status'].map((h, c) => [c, { v: h, s: 'head' }])),
  };
  for (const row of layout.rows) {
    const ob = byId.get(row.id)!;
    const r = row.row + 1;
    payments[row.row] = {
      0: { v: ob.ref }, 1: { v: ob.contractTitle }, 2: { v: ob.clauseLabel }, 3: { v: ob.party },
      4: ob.dueDate ? { v: dateSerial(ob.dueDate), s: 'date' } : { v: '' }, 5: { v: ob.currency! },
      6: { v: ob.amountCents! / 100, s: 'money' }, 7: { v: ob.paidCents / 100, s: 'moneyEdit' },
      8: { f: `=G${r}-H${r}`, s: 'money' }, 9: ob.paidDate ? { v: dateSerial(ob.paidDate), s: 'dateEdit' } : { v: '', s: 'dateEdit' },
      10: { v: STATUS_LABEL[ob.status] },
    };
  }
  if (!layout.rows.length) payments[PAYMENT_FIRST_ROW] = { 0: { v: 'No confirmed payments yet. Confirm a payment term on a contract to schedule it here.', s: 'muted' } };
  const first = PAYMENT_FIRST_ROW + 1;
  const last = layout.lastRow + 1;
  payments[layout.totalsRow] = Object.fromEntries(['Currency', 'Scheduled', 'Paid', 'Outstanding', 'Overdue'].map((h, c) => [c, { v: h, s: 'head' }]));
  layout.currencies.forEach((currency, index) => {
    const range = (letter: string) => `$${letter}$${first}:$${letter}$${last}`;
    payments[layout.totalsRow + 1 + index] = {
      0: { v: currency, s: 'totalLabel' },
      1: { f: `=SUMIFS(${range('G')},${range('F')},"${currency}")`, s: 'total' },
      2: { f: `=SUMIFS(${range('H')},${range('F')},"${currency}")`, s: 'total' },
      3: { f: `=SUMIFS(${range('I')},${range('F')},"${currency}")`, s: 'total' },
      4: { f: `=SUMIFS(${range('I')},${range('F')},"${currency}",${range('E')},"<"&$B$2)`, s: 'total' },
    };
  });

  const widths = (list: number[]) => Object.fromEntries(list.map((w, i) => [i, { w }]));
  return {
    layout,
    data: {
      id: 'clausebridge-register',
      name: 'ClauseBridge register',
      sheetOrder: [REGISTER_SHEET, PAYMENTS_SHEET],
      styles: STYLES,
      sheets: {
        [REGISTER_SHEET]: { id: REGISTER_SHEET, name: 'Obligations', cellData: register, rowCount: Math.max(obligations.length + 20, 40), columnCount: 12,
          columnData: widths([70, 210, 90, 100, 300, 170, 100, 96, 100, 70]), freeze: { xSplit: 0, ySplit: 1, startRow: 1, startColumn: 0 } },
        [PAYMENTS_SHEET]: { id: PAYMENTS_SHEET, name: 'Payments', cellData: payments, rowCount: layout.totalsRow + layout.currencies.length + 20, columnCount: 12,
          columnData: widths([70, 210, 90, 170, 96, 70, 110, 110, 110, 96, 100]) },
      },
    },
  };
}

export type SheetTotals = { currency: string; scheduledCents: number; paidCents: number; outstandingCents: number; overdueCents: number };
export type EditedPayment = { id: string; ref: string; version: number; paid: string; paidDate: string | null; problem: string | null };

/** Reads a sheet number (Univer may hand back a formatted string such as "15,000.00") as integer cents. */
const toCents = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value === 'string' && /^-?[\d,]+(\.\d+)?$/.test(value.trim())) return Math.round(Number(value.replace(/,/g, '')) * 100);
  return null;
};

export type RegisterView = {
  ready: Promise<void>;
  readPayments: () => EditedPayment[];
  readTotals: () => Promise<SheetTotals[]>;
  onEdit: (callback: () => void) => void;
  dispose: () => void;
};

export function mountRegister(container: HTMLElement, obligations: Obligation[], today: string, startSheet: 'register' | 'payments'): RegisterView {
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: { [LocaleType.EN_US]: mergeLocales(UniverPresetSheetsCoreEnUS, UniverPresetSheetsTableEnUS) },
    presets: [UniverSheetsCorePreset({ container, footer: { sheetBar: true, statisticBar: true, menus: false, zoomSlider: false } }), UniverSheetsTablePreset()],
  });
  const { data, layout } = registerWorkbook(obligations, today);
  const workbook = univerAPI.createWorkbook(data);
  const listeners: (() => void)[] = [];
  const ready = (async () => {
    const sheet = workbook.getSheetBySheetId(REGISTER_SHEET);
    if (sheet && obligations.length) {
      // The register is a real Univer table: sortable, filterable columns over the confirmed obligations.
      const added = await sheet.addTable('ObligationRegister', { startRow: 0, startColumn: 0, endRow: obligations.length, endColumn: 9 }, 'obligations');
      if (!added) console.warn('ClauseBridge: the Univer table could not be added to the register');
    }
    if (startSheet === 'payments') workbook.getSheetBySheetId(PAYMENTS_SHEET)?.activate();
  })();
  // Only a person's edit of Paid or Paid on counts as an unsaved change (formula results don't).
  const subscription = univerAPI.addEvent(univerAPI.Event.SheetEditEnded, ({ worksheet, row, column }) => {
    if (worksheet.getSheetId() === PAYMENTS_SHEET && (column === 7 || column === 9) && row >= PAYMENT_FIRST_ROW && row <= layout.lastRow) {
      // Let Univer apply the value and recalculate before ClauseBridge re-checks it.
      setTimeout(() => listeners.forEach(fn => fn()), 50);
    }
  });

  const paymentsSheet = () => workbook.getSheetBySheetId(PAYMENTS_SHEET)!;
  return {
    ready,
    onEdit: callback => { listeners.push(callback); },
    readPayments() {
      const sheet = paymentsSheet();
      return layout.rows.map(row => {
        const paidValue = sheet.getRange(row.row, 7).getValue();
        const dateValue = sheet.getRange(row.row, 9).getValue();
        let problem: string | null = null;
        let paid = '';
        if (paidValue === null || paidValue === '' || paidValue === undefined) paid = '0';
        else if (typeof paidValue === 'number' && Number.isFinite(paidValue) && paidValue >= 0) paid = paidValue.toFixed(2);
        else if (typeof paidValue === 'string' && /^\s*[\d,]+(\.\d{1,2})?\s*$/.test(paidValue)) paid = paidValue.trim();
        else problem = `${row.ref}: Paid must be a number`;
        let paidDate: string | null = null;
        if (typeof dateValue === 'number' && dateValue > 20000 && dateValue < 80000) paidDate = serialToIso(dateValue);
        else if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) paidDate = dateValue.trim();
        else if (dateValue !== null && dateValue !== '' && dateValue !== undefined) problem = `${row.ref}: Paid on must be a date (YYYY-MM-DD)`;
        return { id: row.id, ref: row.ref, version: row.version, paid, paidDate, problem };
      });
    },
    async readTotals() {
      const sheet = paymentsSheet();
      const read = () => layout.currencies.map((_c, index) => [1, 2, 3, 4].map(c => toCents(sheet.getRange(layout.totalsRow + 1 + index, c).getValue())));
      // Formula results arrive asynchronously after the workbook loads or a cell changes; wait for them.
      for (let attempt = 0; attempt < 30 && read().some(row => row.some(v => v === null)); attempt++) await new Promise(r => setTimeout(r, 200));
      const rows = read();
      return layout.currencies.map((currency, index) => {
        const values = rows[index].map(value => value ?? NaN);
        return { currency, scheduledCents: values[0], paidCents: values[1], outstandingCents: values[2], overdueCents: values[3] };
      });
    },
    dispose() { subscription.dispose(); univer.dispose(); },
  };
}

/** ClauseBridge's own cent-exact totals for the values currently in the sheet. */
export function expectedTotals(obligations: Obligation[], edits: EditedPayment[], today: string) {
  const byId = new Map(edits.map(edit => [edit.id, edit]));
  const totals = new Map<string, SheetTotals>();
  for (const ob of obligations) {
    if (ob.kind !== 'payment' || ob.amountCents === null || !ob.currency) continue;
    const edit = byId.get(ob.id);
    const paid = edit && !edit.problem ? Math.round(Number(edit.paid.replace(/,/g, '')) * 100) : ob.paidCents;
    const t = totals.get(ob.currency) ?? { currency: ob.currency, scheduledCents: 0, paidCents: 0, outstandingCents: 0, overdueCents: 0 };
    t.scheduledCents += ob.amountCents;
    t.paidCents += paid;
    t.outstandingCents += ob.amountCents - paid;
    if (ob.dueDate && ob.dueDate < today) t.overdueCents += ob.amountCents - paid;
    totals.set(ob.currency, t);
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export const describeDue = (iso: string | null) => iso ? formatDate(iso) : 'No date';
