'use client';

import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { formatMoney } from '@/lib/contract/terms';
import type { RegisterView, SheetTotals } from '@/lib/univer-register';
import type { AppContext } from './App';
import PixelLoader from './art/PixelLoader';

type Comparison = { currency: string; ok: boolean; rows: { label: string; sheet: number; check: number }[] };

export default function Register({ ctx, tab }: { ctx: AppContext; tab: 'register' | 'payments' }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<RegisterView | null>(null);
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: '' | 'warn' | 'bad'; text: string } | null>(null);
  const [comparison, setComparison] = useState<Comparison[]>([]);
  const { obligations, today } = ctx.data;
  const dataKey = obligations.map(ob => `${ob.id}:${ob.version}`).join(',');

  const compare = async () => {
    const mod = await import('@/lib/univer-register');
    const current = view.current;
    if (!current) return;
    const sheet = await current.readTotals();
    const expected = mod.expectedTotals(obligations, current.readPayments(), today);
    setComparison(expected.map(exp => {
      const got: SheetTotals | undefined = sheet.find(item => item.currency === exp.currency);
      const rows = [
        { label: 'Scheduled', sheet: got?.scheduledCents ?? NaN, check: exp.scheduledCents },
        { label: 'Paid', sheet: got?.paidCents ?? NaN, check: exp.paidCents },
        { label: 'Outstanding', sheet: got?.outstandingCents ?? NaN, check: exp.outstandingCents },
        { label: 'Overdue', sheet: got?.overdueCents ?? NaN, check: exp.overdueCents },
      ];
      return { currency: exp.currency, ok: rows.every(r => r.sheet === r.check), rows };
    }));
  };

  useEffect(() => {
    if (!host.current) return;
    let disposed = false;
    const container = document.createElement('div');
    container.style.height = '100%';
    host.current.appendChild(container);
    setReady(false); setDirty(false);
    import('@/lib/univer-register').then(async mod => {
      if (disposed) return;
      const mounted = mod.mountRegister(container, obligations, today, tab);
      view.current = mounted;
      await mounted.ready.catch(() => {});
      if (disposed) return;
      let timer: ReturnType<typeof setTimeout> | null = null;
      mounted.onEdit(() => { setDirty(true); if (timer) clearTimeout(timer); timer = setTimeout(() => { void compare(); }, 600); });
      setReady(true);
      await compare();
    }).catch(e => setMessage({ tone: 'bad', text: `Univer Sheets could not load: ${errorText(e)}` }));
    return () => { disposed = true; const v = view.current; view.current = null; setTimeout(() => { v?.dispose(); container.remove(); }, 0); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, tab]);

  const save = async () => {
    const current = view.current;
    if (!current) return;
    const rows = current.readPayments();
    const problems = rows.filter(r => r.problem).map(r => r.problem!);
    if (problems.length) { setMessage({ tone: 'bad', text: problems.join('. ') }); return; }
    setBusy(true); setMessage(null);
    try {
      const result = await api<{ saved: number; failed: number; results: { ref: string; error?: string }[] }>(`/api/w/${ctx.workspace.id}/payments`, {
        json: { rows: rows.map(r => ({ id: r.id, ref: r.ref, version: r.version, paid: r.paid, paidDate: r.paidDate })) } });
      const failures = result.results.filter(r => r.error).map(r => `${r.ref}: ${r.error}`);
      setMessage(failures.length ? { tone: 'bad', text: `Saved ${result.saved}. Not saved: ${failures.join('; ')}` }
        : { tone: '', text: result.saved ? `Saved ${result.saved} payment${result.saved === 1 ? '' : 's'}. Fully paid payments are now marked done.` : 'No payment changes to save.' });
      await ctx.reload();
    } catch (e) { setMessage({ tone: 'bad', text: errorText(e) }); } finally { setBusy(false); }
  };

  const allMatch = comparison.length > 0 && comparison.every(c => c.ok);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Register and payments</h1>
          <p>Confirmed obligations in a Univer Sheets table, and the payment schedule with Univer formulas for totals. ClauseBridge re-checks the formulas to the cent.</p>
        </div>
        <div className="row">
          <div className="tabs">
            <button className={tab === 'register' ? 'on' : ''} onClick={() => ctx.go('register')}>Obligations</button>
            <button className={tab === 'payments' ? 'on' : ''} onClick={() => ctx.go('register', 'payments')}>Payment schedule</button>
          </div>
          {tab === 'payments' && <button className="btn primary" disabled={!ready || busy} onClick={save}>{busy ? 'Saving…' : 'Save payments'}</button>}
        </div>
      </div>
      {message && <p className={`notice ${message.tone}`} role="status">{message.text}</p>}
      {tab === 'register' && <p className="hint">Use the table’s column filters to sort by status, owner or due date. Change an obligation from its detail panel; the register is rebuilt from the confirmed records.</p>}
      {tab === 'payments' && comparison.length > 0 && (
        <div className={`notice ${allMatch ? '' : 'warn'}`} style={{ marginBottom: 10 }}>
          {allMatch ? 'The sheet’s formula totals match ClauseBridge’s cent check: ' : 'The sheet’s totals differ from ClauseBridge’s check: '}
          {comparison.map(c => c.ok ? `${c.currency} ✓` : `${c.currency}: ${c.rows.filter(r => r.sheet !== r.check).map(r => `${r.label} sheet ${Number.isNaN(r.sheet) ? 'not a number' : formatMoney(r.sheet, c.currency)}, check ${formatMoney(r.check, c.currency)}`).join('; ')}`).join(' · ')}
          {dirty && ' (edits not saved yet)'}
          <button className="btn small quiet" onClick={compare} style={{ marginLeft: 6 }}>Check again</button>
        </div>
      )}
      <div className="sheet-frame">
        <div className="sheet-host" ref={host} />
        {!ready && <div className="doc-loading"><PixelLoader label="Opening Univer Sheets" /></div>}
      </div>
    </>
  );
}
