'use client';

import { useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { formatDate } from '@/lib/contract/terms';
import type { AppContext } from './App';
import { localDay } from './Bits';

const SAMPLES = [
  { id: 'website-redesign', title: 'Website Redesign Services Agreement', note: 'Agency and restaurant group, USD payments' },
  { id: 'office-supplies', title: 'Supply Framework Agreement', note: 'Buyer and supplier, NGN payments' },
];

export default function Contracts({ ctx }: { ctx: AppContext }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setError('');
    if (file.size > 4 * 1024 * 1024) { setError('Contract files can be up to 4 MB'); return; }
    setBusy(`Reading ${file.name}…`);
    try {
      const form = new FormData();
      form.set('file', file);
      if (title.trim()) form.set('title', title.trim());
      const result = await api<{ id: string }>(`/api/w/${ctx.workspace.id}/contracts`, { form });
      await ctx.reload();
      ctx.go('contract', result.id);
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };

  const addSample = async (sample: string) => {
    setError(''); setBusy('Adding the sample contract…');
    try {
      const result = await api<{ id: string }>(`/api/w/${ctx.workspace.id}/contracts`, { json: { sample } });
      await ctx.reload();
      ctx.go('contract', result.id);
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };

  return (
    <>
      <div className="page-head"><div><h1>Contracts</h1><p>Each contract opens in Univer Docs beside the terms ClauseBridge suggests. Nothing is tracked until someone confirms it.</p></div></div>
      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Add a contract</h2>
        <div
          className={`drop ${over ? 'over' : ''}`}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); const file = e.dataTransfer.files[0]; if (file) void upload(file); }}
        >
          <div className="upload">
            <div>
              <b>Drop a PDF, Word (.docx) or text file here</b>
              <div className="hint">Up to 4 MB. Scanned PDFs without selectable text aren’t supported yet.</div>
            </div>
            <div className="row">
              <input className="input" aria-label="Contract title (optional)" placeholder="Title (optional)" value={title} onChange={e => setTitle(e.target.value)} style={{ width: 200 }} />
              <button className="btn primary" disabled={Boolean(busy)} onClick={() => input.current?.click()}>Choose file</button>
              <input ref={input} type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden
                onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void upload(file); }} />
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <span className="hint">No contract to hand? Try a sample:</span>
          {SAMPLES.map(sample => <button key={sample.id} className="btn small" disabled={Boolean(busy)} onClick={() => addSample(sample.id)} title={sample.note}>{sample.title}</button>)}
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>The same samples as files, to test uploading: <a href="/samples/website-redesign-agreement.pdf" download>PDF</a> · <a href="/samples/office-supplies-agreement.docx" download>Word</a>. All sample parties and people are made up.</p>
        {busy && <p className="notice" style={{ marginTop: 10 }}>{busy}</p>}
        {error && <p className="notice bad" role="alert" style={{ marginTop: 10 }}>{error}</p>}
      </section>
      <div className="contracts">
        {ctx.data.contracts.length === 0 && <div className="empty">No contracts in this workspace yet.</div>}
        {ctx.data.contracts.map(contract => (
          <button key={contract.id} className="contract-row" onClick={() => ctx.go('contract', contract.id)}>
            <div>
              <h3>{contract.title}</h3>
              <p>{contract.parties.length ? contract.parties.map(p => `${p.name}${p.role ? ` (${p.role})` : ''}`).join(' and ') : 'Parties not confirmed yet'}</p>
              <p>{contract.fileName} · added by {contract.uploadedBy} on {formatDate(localDay(contract.createdAt))}{contract.effectiveDate ? ` · effective ${formatDate(contract.effectiveDate)}` : ''}</p>
            </div>
            <div className="row">
              {contract.pending > 0 && <span className="count">{contract.pending} to review</span>}
              {!contract.extracted && <span className="status">Not reviewed yet</span>}
              <span className="status done">{contract.done}/{contract.obligations} done</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
