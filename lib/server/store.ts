import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Clause } from '../contract/clauses.ts';
import { formatDate, formatMoney, isValidIsoDate } from '../contract/terms.ts';
import type { AuditEntry, ContractDetail, ContractSummary, Due, Amount, Evidence, Extraction, Kind, Member, Obligation,
  Party, Source, Status, Suggestion, SuggestionKind, Workspace } from '../types.ts';
import { KINDS, STATUSES, STATUS_LABEL } from '../types.ts';
import { withEffectiveDate } from '../due.ts';
import { openPostgres, openSqlite, type Db } from './db.ts';
import { StoreError } from './errors.ts';
import { migrate } from './schema.ts';
export { StoreError } from './errors.ts';

const now = () => new Date().toISOString();
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.stringify(value);
const parse = <T>(value: string | null | undefined, fallback: T): T => { try { return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } };

export const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;
export const MAX_CONTRACT_FILE_BYTES = 4 * 1024 * 1024;

type UserRow = { id: string; username: string; password_salt: string; password_hash: string };
type ContractRow = { id: string; workspace_id: string; title: string; file_name: string; file_kind: string; text: string;
  clauses_json: string; parties_json: string; effective_date: string | null; extraction_json: string | null;
  uploaded_by: string; created_at: string; updated_at: string };
type SuggestionRow = { id: string; contract_id: string; kind: string; title: string; party: string; clause_id: string;
  quote: string; quote_start: number; quote_end: number; due_json: string; amount_json: string; confidence: string;
  reason: string; checks_json: string; status: string; model: string | null; decided_by: string | null;
  decided_at: string | null; obligation_id: string | null };
type ObligationRow = { id: string; workspace_id: string; contract_id: string; ref: string; kind: string; title: string;
  party: string; owner_id: string | null; owner_name: string | null; due_date: string | null; due_text: string;
  due_source: string | null; amount_cents: number | null; currency: string | null; amount_source: string | null;
  paid_cents: number; paid_date: string | null; status: string; clause_id: string; quote: string; quote_start: number;
  quote_end: number; version: number; updated_at: string; contract_title: string; clauses_json: string; evidence_count: number };

export type ConfirmEdits = { kind?: Kind; title?: string; party?: string; ownerId?: string | null; dueDate?: string | null;
  amountCents?: number | null; currency?: string | null };
export type ObligationPatch = { status?: Status; ownerId?: string | null; dueDate?: string | null; title?: string; paidCents?: number; paidDate?: string | null };
export type NewSuggestion = Omit<Suggestion, 'id' | 'contractId' | 'status' | 'decidedBy' | 'decidedAt' | 'obligationId'>;

function suggestionFromRow(row: SuggestionRow): Suggestion {
  return { id: row.id, contractId: row.contract_id, kind: row.kind as SuggestionKind, title: row.title, party: row.party,
    clauseId: row.clause_id, quote: row.quote, quoteStart: row.quote_start, quoteEnd: row.quote_end,
    due: parse<Due>(row.due_json, { date: null, text: '', source: null, options: [], relative: null, recurrence: null, ambiguous: false }),
    amount: parse<Amount>(row.amount_json, { cents: null, currency: null, text: '', source: null, options: [], percent: null }),
    confidence: row.confidence === 'high' ? 'high' : 'low', reason: row.reason, checks: parse(row.checks_json, []),
    status: row.status as Suggestion['status'], model: row.model, decidedBy: row.decided_by, decidedAt: row.decided_at,
    obligationId: row.obligation_id };
}

function obligationFromRow(row: ObligationRow): Obligation {
  const clause = parse<Clause[]>(row.clauses_json, []).find(item => item.id === row.clause_id);
  return { id: row.id, ref: row.ref, contractId: row.contract_id, contractTitle: row.contract_title, kind: row.kind as Kind,
    title: row.title, party: row.party, ownerId: row.owner_id, ownerName: row.owner_name, dueDate: row.due_date,
    dueText: row.due_text, dueSource: row.due_source as Source, amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
    currency: row.currency, amountSource: row.amount_source as Source, paidCents: Number(row.paid_cents), paidDate: row.paid_date,
    status: row.status as Status, clauseId: row.clause_id, clauseLabel: clause?.label ?? 'Clause', quote: row.quote,
    quoteStart: row.quote_start, quoteEnd: row.quote_end, evidenceCount: Number(row.evidence_count), version: row.version,
    updatedAt: row.updated_at };
}

const OBLIGATION_SELECT = `SELECT o.*, u.username AS owner_name, c.title AS contract_title, c.clauses_json,
  (SELECT COUNT(*) FROM evidence e WHERE e.obligation_id = o.id) AS evidence_count
  FROM obligations o JOIN contracts c ON c.id = o.contract_id LEFT JOIN users u ON u.id = o.owner_id`;

export class ClauseBridgeStore {
  readonly db: Db;
  constructor(db: Db) { this.db = db; }

  // ---------- accounts ----------

  async createUser(username: string, salt: string, passwordHash: string) {
    const id = randomUUID();
    const timestamp = now();
    try {
      await this.db.tx(async db => {
        await db.run('INSERT INTO users VALUES (?,?,?,?,?,?)', [id, username, username.toLowerCase(), salt, passwordHash, timestamp]);
        await this.insertWorkspace(db, id, `${username}'s workspace`, timestamp);
      });
    } catch (error) {
      if (error instanceof StoreError) throw error;
      throw new StoreError('conflict', 'Username is unavailable');
    }
    return { id, username };
  }

  findUser(username: string) {
    return this.db.get<UserRow>('SELECT * FROM users WHERE username_lower = ?', [username.toLowerCase()]);
  }

  async assertLoginAllowed(username: string) {
    const row = await this.db.get<{ locked_until: string | null }>('SELECT locked_until FROM login_attempts WHERE username_lower = ?', [username.toLowerCase()]);
    if (row?.locked_until && row.locked_until > now()) throw new StoreError('rate_limited', 'Too many attempts. Try again later.');
  }

  async recordLoginFailure(username: string) {
    const key = username.toLowerCase();
    const row = await this.db.get<{ failures: number; first_at: string }>('SELECT failures, first_at FROM login_attempts WHERE username_lower = ?', [key]);
    const recent = row && Date.now() - Date.parse(row.first_at) < 15 * 60_000;
    const failures = recent ? row.failures + 1 : 1;
    const firstAt = recent ? row.first_at : now();
    const lockedUntil = failures >= 5 ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
    await this.db.run(`INSERT INTO login_attempts VALUES (?,?,?,?) ON CONFLICT (username_lower)
      DO UPDATE SET failures = excluded.failures, first_at = excluded.first_at, locked_until = excluded.locked_until`, [key, failures, firstAt, lockedUntil]);
  }

  async recordLoginSuccess(username: string) {
    await this.db.run('DELETE FROM login_attempts WHERE username_lower = ?', [username.toLowerCase()]);
  }

  async createSession(userId: string, tokenHash: string, expiresAt: string) {
    await this.db.run('INSERT INTO sessions VALUES (?,?,?,?)', [tokenHash, userId, expiresAt, now()]);
  }

  async sessionUser(tokenHash: string) {
    return (await this.db.get<{ id: string; username: string }>(`SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`, [tokenHash, now()])) ?? null;
  }

  async deleteSession(tokenHash: string) {
    await this.db.run('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
  }

  // ---------- workspaces ----------

  private async insertWorkspace(db: Db, userId: string, name: string, timestamp: string) {
    const id = randomUUID();
    await db.run('INSERT INTO workspaces VALUES (?,?,?,?,?)', [id, name, userId, 1, timestamp]);
    await db.run('INSERT INTO members VALUES (?,?,?,?)', [id, userId, 'owner', timestamp]);
    await this.audit(db, id, userId, 'workspace_created', 'workspace', id, null, `Created the workspace “${name}”`, {});
    return id;
  }

  /** The caller's role in a workspace; "not found" for non-members so workspace IDs reveal nothing. */
  async role(userId: string, workspaceId: string, db: Db = this.db): Promise<'owner' | 'member'> {
    const row = await db.get<{ role: string }>('SELECT role FROM members WHERE workspace_id = ? AND user_id = ?', [workspaceId, userId]);
    if (!row) throw new StoreError('not_found', 'Workspace not found');
    return row.role as 'owner' | 'member';
  }

  async listWorkspaces(userId: string): Promise<Workspace[]> {
    const rows = await this.db.all<{ id: string; name: string; role: string; created_at: string }>(`SELECT w.id, w.name, m.role, w.created_at
      FROM members m JOIN workspaces w ON w.id = m.workspace_id WHERE m.user_id = ? ORDER BY w.created_at`, [userId]);
    const result: Workspace[] = [];
    for (const row of rows) result.push({ id: row.id, name: row.name, role: row.role as Workspace['role'], members: await this.members(row.id) });
    return result;
  }

  async members(workspaceId: string, db: Db = this.db): Promise<Member[]> {
    const rows = await db.all<{ user_id: string; username: string; role: string }>(`SELECT m.user_id, u.username, m.role FROM members m
      JOIN users u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY m.joined_at`, [workspaceId]);
    return rows.map(row => ({ userId: row.user_id, username: row.username, role: row.role as Member['role'] }));
  }

  async createWorkspace(userId: string, name: string) {
    const clean = name.trim();
    if (!clean || clean.length > 60) throw new StoreError('invalid', 'Workspace names are 1–60 characters');
    return this.db.tx(db => this.insertWorkspace(db, userId, clean, now()));
  }

  async renameWorkspace(userId: string, workspaceId: string, name: string) {
    const clean = name.trim();
    if (!clean || clean.length > 60) throw new StoreError('invalid', 'Workspace names are 1–60 characters');
    await this.db.tx(async db => {
      if (await this.role(userId, workspaceId, db) !== 'owner') throw new StoreError('forbidden', 'Only the workspace owner can rename it');
      await db.run('UPDATE workspaces SET name = ? WHERE id = ?', [clean, workspaceId]);
      await this.audit(db, workspaceId, userId, 'workspace_renamed', 'workspace', workspaceId, null, `Renamed the workspace to “${clean}”`, {});
    });
  }

  /** Creates a one-week invite code. Only its hash is stored; the code is shown once. */
  async createInvite(userId: string, workspaceId: string) {
    const code = randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await this.db.tx(async db => {
      await this.role(userId, workspaceId, db);
      await db.run('INSERT INTO invites VALUES (?,?,?,?,?)', [sha256(code), workspaceId, userId, now(), expiresAt]);
      await this.audit(db, workspaceId, userId, 'invite_created', 'workspace', workspaceId, null, 'Created an invite code (valid for 7 days)', { expiresAt });
    });
    return { code, expiresAt };
  }

  async joinWorkspace(userId: string, code: string) {
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(clean)) throw new StoreError('invalid', 'Invite codes are 8 letters and numbers');
    return this.db.tx(async db => {
      const invite = await db.get<{ workspace_id: string; expires_at: string }>('SELECT workspace_id, expires_at FROM invites WHERE code_hash = ?', [sha256(clean)]);
      if (!invite || invite.expires_at < now()) throw new StoreError('not_found', 'That invite code is not valid or has expired');
      const existing = await db.get('SELECT 1 AS x FROM members WHERE workspace_id = ? AND user_id = ?', [invite.workspace_id, userId]);
      if (!existing) {
        await db.run('INSERT INTO members VALUES (?,?,?,?)', [invite.workspace_id, userId, 'member', now()]);
        await this.audit(db, invite.workspace_id, userId, 'member_joined', 'workspace', invite.workspace_id, null, 'Joined the workspace with an invite code', {});
      }
      return invite.workspace_id;
    });
  }

  // ---------- contracts ----------

  async createContract(userId: string, workspaceId: string, input: { title: string; fileName: string; fileKind: string;
    bytes: Buffer | null; text: string; clauses: Clause[] }) {
    const title = input.title.trim().slice(0, 140) || 'Untitled contract';
    const id = randomUUID();
    const timestamp = now();
    await this.db.tx(async db => {
      await this.role(userId, workspaceId, db);
      const count = await db.get<{ n_count: number }>('SELECT COUNT(*) AS n_count FROM contracts WHERE workspace_id = ?', [workspaceId]);
      if (Number(count?.n_count ?? 0) >= 50) throw new StoreError('invalid', 'This workspace already holds 50 contracts');
      await db.run(`INSERT INTO contracts (id, workspace_id, title, file_name, file_kind, file_sha256, file_bytes, text, clauses_json,
        parties_json, effective_date, extraction_json, uploaded_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, workspaceId, title, input.fileName.slice(0, 160), input.fileKind, sha256(input.bytes ?? input.text), input.bytes,
          input.text, json(input.clauses), '[]', null, null, userId, timestamp, timestamp]);
      await this.audit(db, workspaceId, userId, 'contract_uploaded', 'contract', id, id,
        `Uploaded “${title}” (${input.fileName}, ${input.clauses.length} clauses)`, { fileName: input.fileName, clauses: input.clauses.length });
    });
    return id;
  }

  private async contractRow(workspaceId: string, contractId: string, db: Db = this.db) {
    const row = await db.get<ContractRow>(`SELECT id, workspace_id, title, file_name, file_kind, text, clauses_json, parties_json,
      effective_date, extraction_json, uploaded_by, created_at, updated_at FROM contracts WHERE id = ? AND workspace_id = ?`, [contractId, workspaceId]);
    if (!row) throw new StoreError('not_found', 'Contract not found');
    return row;
  }

  async listContracts(userId: string, workspaceId: string): Promise<ContractSummary[]> {
    await this.role(userId, workspaceId);
    const rows = await this.db.all<ContractRow & { uploader: string; pending_count: number; obligation_count: number; done_count: number }>(`
      SELECT c.id, c.title, c.file_name, c.file_kind, c.parties_json, c.effective_date, c.extraction_json, c.created_at, u.username AS uploader,
        (SELECT COUNT(*) FROM suggestions s WHERE s.contract_id = c.id AND s.status = 'pending') AS pending_count,
        (SELECT COUNT(*) FROM obligations o WHERE o.contract_id = c.id) AS obligation_count,
        (SELECT COUNT(*) FROM obligations o WHERE o.contract_id = c.id AND o.status = 'done') AS done_count
      FROM contracts c JOIN users u ON u.id = c.uploaded_by WHERE c.workspace_id = ? ORDER BY c.created_at DESC`, [workspaceId]);
    return rows.map(row => this.summary(row, row.uploader, Number(row.pending_count), Number(row.obligation_count), Number(row.done_count)));
  }

  private summary(row: Pick<ContractRow, 'id' | 'title' | 'file_name' | 'file_kind' | 'parties_json' | 'effective_date' | 'extraction_json' | 'created_at'>,
    uploader: string, pending: number, obligations: number, done: number): ContractSummary {
    return { id: row.id, title: row.title, fileName: row.file_name, fileKind: row.file_kind, effectiveDate: row.effective_date,
      createdAt: row.created_at, uploadedBy: uploader, parties: parse<Party[]>(row.parties_json, []), pending, obligations, done,
      extracted: Boolean(row.extraction_json) };
  }

  async getContract(userId: string, workspaceId: string, contractId: string): Promise<ContractDetail> {
    await this.role(userId, workspaceId);
    const row = await this.contractRow(workspaceId, contractId);
    const uploader = await this.db.get<{ username: string }>('SELECT username FROM users WHERE id = ?', [row.uploaded_by]);
    const suggestions = (await this.db.all<SuggestionRow>('SELECT * FROM suggestions WHERE contract_id = ? ORDER BY quote_start, created_at', [contractId]))
      .map(suggestionFromRow).map(item => withEffectiveDate(item, row.effective_date));
    const counts = await this.db.get<{ obligation_count: number; done_count: number }>(`SELECT COUNT(*) AS obligation_count,
      SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done_count FROM obligations WHERE contract_id = ?`, [contractId]);
    return { ...this.summary(row, uploader?.username ?? '', suggestions.filter(s => s.status === 'pending').length,
      Number(counts?.obligation_count ?? 0), Number(counts?.done_count ?? 0)),
    text: row.text, clauses: parse<Clause[]>(row.clauses_json, []), suggestions, extraction: parse<Extraction | null>(row.extraction_json, null) };
  }

  async contractFile(userId: string, workspaceId: string, contractId: string) {
    await this.role(userId, workspaceId);
    const row = await this.db.get<{ file_name: string; file_kind: string; file_bytes: Buffer | null; text: string }>(
      'SELECT file_name, file_kind, file_bytes, text FROM contracts WHERE id = ? AND workspace_id = ?', [contractId, workspaceId]);
    if (!row) throw new StoreError('not_found', 'Contract not found');
    return row;
  }

  async setEffectiveDate(userId: string, workspaceId: string, contractId: string, date: string | null) {
    if (date !== null && !isValidIsoDate(date)) throw new StoreError('invalid', 'Use a valid date');
    await this.db.tx(async db => {
      await this.role(userId, workspaceId, db);
      const row = await this.contractRow(workspaceId, contractId, db);
      await db.run('UPDATE contracts SET effective_date = ?, updated_at = ? WHERE id = ?', [date, now(), contractId]);
      await this.audit(db, workspaceId, userId, 'effective_date_set', 'contract', contractId, contractId,
        date ? `Set the effective date of “${row.title}” to ${formatDate(date)}` : `Cleared the effective date of “${row.title}”`,
        { before: row.effective_date, after: date });
    });
  }

  /** Replaces the contract's pending suggestions with a new extraction run. Decided suggestions are kept. */
  async saveExtraction(userId: string, workspaceId: string, contractId: string, suggestions: NewSuggestion[], extraction: Extraction) {
    return this.db.tx(async db => {
      await this.role(userId, workspaceId, db);
      const row = await this.contractRow(workspaceId, contractId, db);
      const decided = (await db.all<SuggestionRow>("SELECT * FROM suggestions WHERE contract_id = ? AND status <> 'pending'", [contractId])).map(suggestionFromRow);
      const decidedKeys = new Set(decided.map(item => `${item.kind}\u0000${item.quoteStart}\u0000${item.quoteEnd}`));
      await db.run("DELETE FROM suggestions WHERE contract_id = ? AND status = 'pending'", [contractId]);
      let added = 0;
      const timestamp = now();
      for (const item of suggestions) {
        if (decidedKeys.has(`${item.kind}\u0000${item.quoteStart}\u0000${item.quoteEnd}`)) continue;
        await db.run(`INSERT INTO suggestions (id, contract_id, workspace_id, kind, title, party, clause_id, quote, quote_start, quote_end,
          due_json, amount_json, confidence, reason, checks_json, status, model, request_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [randomUUID(), contractId, workspaceId, item.kind, item.title, item.party, item.clauseId, item.quote, item.quoteStart, item.quoteEnd,
            json(item.due), json(item.amount), item.confidence, item.reason, json(item.checks), 'pending', item.model, extraction.requestIds[0] ?? null, timestamp]);
        added++;
      }
      await db.run('UPDATE contracts SET extraction_json = ?, updated_at = ? WHERE id = ?', [json(extraction), timestamp, contractId]);
      const dropped = extraction.dropped.length ? `; ${extraction.dropped.length} dropped because the quoted text was not in the contract` : '';
      await this.audit(db, workspaceId, userId, 'terms_suggested', 'contract', contractId, contractId,
        `Asked ${extraction.model ?? 'Ant Ling'} for the terms of “${row.title}”: ${added} suggested${dropped}`,
        { model: extraction.model, requestIds: extraction.requestIds, suggested: added, dropped: extraction.dropped.length, tokens: extraction.tokens });
      return { added, dropped: extraction.dropped.length };
    });
  }

  /**
   * A person's decision on one suggestion. Confirming a term creates the tracked obligation (or records a
   * party); nothing is tracked without this step.
   */
  async decideSuggestion(userId: string, workspaceId: string, suggestionId: string, decision:
    { action: 'reject'; reason?: string } |
    { action: 'confirm'; edits: ConfirmEdits }) {
    return this.db.tx(async db => {
      await this.role(userId, workspaceId, db);
      const row = await db.get<SuggestionRow>('SELECT * FROM suggestions WHERE id = ? AND workspace_id = ?', [suggestionId, workspaceId]);
      if (!row) throw new StoreError('not_found', 'Suggestion not found');
      if (row.status !== 'pending') throw new StoreError('conflict', 'This suggestion has already been decided');
      const contract = await this.contractRow(workspaceId, row.contract_id, db);
      const suggestion = withEffectiveDate(suggestionFromRow(row), contract.effective_date);
      const clauses = parse<Clause[]>(contract.clauses_json, []);
      const clauseLabel = clauses.find(clause => clause.id === suggestion.clauseId)?.label ?? 'the contract';
      const timestamp = now();

      if (decision.action === 'reject') {
        const reason = (decision.reason ?? '').trim().slice(0, 200);
        await db.run("UPDATE suggestions SET status = 'rejected', decided_by = ?, decided_at = ? WHERE id = ?", [userId, timestamp, suggestionId]);
        await this.audit(db, workspaceId, userId, 'suggestion_rejected', 'suggestion', suggestionId, suggestion.contractId,
          `Rejected the suggested ${suggestion.kind} “${suggestion.title}” (${clauseLabel})`, { reason, quote: suggestion.quote });
        return { obligationId: null };
      }

      const edits = decision.edits;
      if (suggestion.kind === 'party') {
        const name = (edits.party ?? suggestion.party).trim().slice(0, 100);
        const role = (edits.title ?? suggestion.title).trim().slice(0, 60);
        if (!name) throw new StoreError('invalid', 'A party needs a name');
        const parties = parse<Party[]>(contract.parties_json, []).filter(party => party.name.toLowerCase() !== name.toLowerCase());
        parties.push({ name, role, clauseId: suggestion.clauseId, quote: suggestion.quote });
        await db.run('UPDATE contracts SET parties_json = ?, updated_at = ? WHERE id = ?', [json(parties), timestamp, contract.id]);
        await db.run("UPDATE suggestions SET status = 'confirmed', decided_by = ?, decided_at = ? WHERE id = ?", [userId, timestamp, suggestionId]);
        await this.audit(db, workspaceId, userId, 'party_confirmed', 'contract', contract.id, contract.id,
          `Confirmed ${name}${role ? ` (${role})` : ''} as a party to “${contract.title}”`, { name, role, quote: suggestion.quote });
        return { obligationId: null };
      }

      const kind = edits.kind ?? suggestion.kind;
      if (!KINDS.includes(kind as Kind)) throw new StoreError('invalid', 'Unknown obligation type');
      const title = (edits.title ?? suggestion.title).trim();
      if (!title || title.length > 160) throw new StoreError('invalid', 'Obligation titles are 1–160 characters');
      const party = (edits.party ?? suggestion.party).trim().slice(0, 100);
      if (edits.ownerId) await this.assertMember(db, workspaceId, edits.ownerId);

      // Due date: the contract's own date unless the person sets a different one.
      let dueDate = suggestion.due.date;
      let dueSource: Source = suggestion.due.source;
      if (edits.dueDate !== undefined) {
        if (edits.dueDate !== null && !isValidIsoDate(edits.dueDate)) throw new StoreError('invalid', 'Use a valid due date');
        if (edits.dueDate !== dueDate) {
          dueDate = edits.dueDate;
          dueSource = dueDate === null ? null : suggestion.due.options.includes(dueDate) ? 'contract' : 'person';
        }
      }
      let amountCents = suggestion.amount.cents;
      let currency = suggestion.amount.currency;
      let amountSource: Source = suggestion.amount.source;
      if (edits.amountCents !== undefined || edits.currency !== undefined) {
        const nextCents = edits.amountCents === undefined ? amountCents : edits.amountCents;
        const nextCurrency = edits.currency === undefined ? currency : edits.currency;
        if (nextCents !== null && (!Number.isSafeInteger(nextCents) || nextCents <= 0)) throw new StoreError('invalid', 'Amounts must be more than zero');
        if (nextCents !== null && (!nextCurrency || !/^[A-Z]{3}$/.test(nextCurrency))) throw new StoreError('invalid', 'Choose a currency for the amount');
        if (nextCents !== amountCents || nextCurrency !== currency) {
          const fromContract = suggestion.amount.options.some(option => option.cents === nextCents && option.currency === nextCurrency);
          amountCents = nextCents;
          currency = nextCents === null ? null : nextCurrency;
          amountSource = nextCents === null ? null : fromContract ? 'contract' : 'person';
        }
      }
      if (kind === 'payment' && amountCents === null) throw new StoreError('invalid', 'A payment needs an amount. Enter it from the contract before confirming.');

      const workspace = await db.get<{ next_ref: number }>('SELECT next_ref FROM workspaces WHERE id = ?', [workspaceId]);
      const refNumber = Number(workspace?.next_ref ?? 1);
      const ref = `OB-${String(refNumber).padStart(3, '0')}`;
      await db.run('UPDATE workspaces SET next_ref = ? WHERE id = ?', [refNumber + 1, workspaceId]);
      const obligationId = randomUUID();
      await db.run(`INSERT INTO obligations (id, workspace_id, contract_id, suggestion_id, ref, kind, title, party, owner_id, due_date, due_text,
        due_source, amount_cents, currency, amount_source, paid_cents, paid_date, status, clause_id, quote, quote_start, quote_end, version,
        created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [obligationId, workspaceId, contract.id, suggestionId, ref, kind, title, party, edits.ownerId ?? null, dueDate,
          suggestion.due.text, dueSource, amountCents, currency, amountSource, 0, null, 'open', suggestion.clauseId, suggestion.quote,
          suggestion.quoteStart, suggestion.quoteEnd, 1, userId, timestamp, timestamp]);
      await db.run("UPDATE suggestions SET status = 'confirmed', decided_by = ?, decided_at = ?, obligation_id = ? WHERE id = ?",
        [userId, timestamp, obligationId, suggestionId]);
      const changed: string[] = [];
      if (title !== suggestion.title) changed.push('title');
      if (kind !== suggestion.kind) changed.push('type');
      if (party !== suggestion.party) changed.push('party');
      if (dueDate !== suggestion.due.date) changed.push('due date');
      if (amountCents !== suggestion.amount.cents || currency !== suggestion.amount.currency) changed.push('amount');
      await this.audit(db, workspaceId, userId, 'suggestion_confirmed', 'obligation', obligationId, contract.id,
        `Confirmed ${ref} “${title}” from ${clauseLabel}${changed.length ? ` (changed: ${changed.join(', ')})` : ''}`,
        { ref, suggestionId, changed, dueDate, dueSource, amountCents, currency, amountSource, quote: suggestion.quote });
      return { obligationId };
    });
  }

  private async assertMember(db: Db, workspaceId: string, userId: string) {
    const row = await db.get('SELECT 1 AS x FROM members WHERE workspace_id = ? AND user_id = ?', [workspaceId, userId]);
    if (!row) throw new StoreError('invalid', 'The owner must be a member of this workspace');
  }

  // ---------- obligations ----------

  async listObligations(userId: string, workspaceId: string): Promise<Obligation[]> {
    await this.role(userId, workspaceId);
    const rows = await this.db.all<ObligationRow>(`${OBLIGATION_SELECT} WHERE o.workspace_id = ? ORDER BY o.ref`, [workspaceId]);
    return rows.map(obligationFromRow);
  }

  async getObligation(userId: string, workspaceId: string, obligationId: string) {
    await this.role(userId, workspaceId);
    const row = await this.db.get<ObligationRow>(`${OBLIGATION_SELECT} WHERE o.workspace_id = ? AND o.id = ?`, [workspaceId, obligationId]);
    if (!row) throw new StoreError('not_found', 'Obligation not found');
    const evidence = await this.db.all<{ id: string; kind: string; label: string; url: string | null; note: string | null; file_name: string | null;
      file_mime: string | null; file_size: number | null; username: string; created_at: string }>(`SELECT e.id, e.kind, e.label, e.url, e.note,
      e.file_name, e.file_mime, e.file_size, u.username, e.created_at FROM evidence e JOIN users u ON u.id = e.added_by
      WHERE e.obligation_id = ? ORDER BY e.created_at`, [obligationId]);
    const history = await this.audit_for(workspaceId, obligationId);
    return {
      obligation: obligationFromRow(row),
      evidence: evidence.map((item): Evidence => ({ id: item.id, kind: item.kind as Evidence['kind'], label: item.label, url: item.url,
        note: item.note, fileName: item.file_name, fileMime: item.file_mime, fileSize: item.file_size === null ? null : Number(item.file_size),
        addedBy: item.username, createdAt: item.created_at })),
      history,
    };
  }

  async updateObligation(userId: string, workspaceId: string, obligationId: string, version: number, patch: ObligationPatch) {
    return this.db.tx(async db => {
      await this.role(userId, workspaceId, db);
      const row = await db.get<ObligationRow>(`${OBLIGATION_SELECT} WHERE o.workspace_id = ? AND o.id = ?`, [workspaceId, obligationId]);
      if (!row) throw new StoreError('not_found', 'Obligation not found');
      if (row.version !== version) throw new StoreError('conflict', 'Someone else changed this obligation. Reload to see the latest.');
      const before = obligationFromRow(row);
      const after = { ...before };
      const changes: string[] = [];
      if (patch.status !== undefined) {
        if (!STATUSES.includes(patch.status)) throw new StoreError('invalid', 'Unknown status');
        if (patch.status !== before.status) { after.status = patch.status; changes.push(`status ${STATUS_LABEL[before.status]} → ${STATUS_LABEL[patch.status]}`); }
      }
      if (patch.ownerId !== undefined && patch.ownerId !== before.ownerId) {
        if (patch.ownerId) await this.assertMember(db, workspaceId, patch.ownerId);
        const owner = patch.ownerId ? await db.get<{ username: string }>('SELECT username FROM users WHERE id = ?', [patch.ownerId]) : null;
        after.ownerId = patch.ownerId;
        after.ownerName = owner?.username ?? null;
        changes.push(`owner ${before.ownerName ?? 'none'} → ${after.ownerName ?? 'none'}`);
      }
      if (patch.dueDate !== undefined && patch.dueDate !== before.dueDate) {
        if (patch.dueDate !== null && !isValidIsoDate(patch.dueDate)) throw new StoreError('invalid', 'Use a valid due date');
        after.dueDate = patch.dueDate;
        after.dueSource = patch.dueDate ? 'person' : null;
        changes.push(`due ${before.dueDate ? formatDate(before.dueDate) : 'none'} → ${patch.dueDate ? formatDate(patch.dueDate) : 'none'}`);
      }
      if (patch.title !== undefined && patch.title.trim() !== before.title) {
        const title = patch.title.trim();
        if (!title || title.length > 160) throw new StoreError('invalid', 'Obligation titles are 1–160 characters');
        after.title = title;
        changes.push('title');
      }
      if (patch.paidCents !== undefined || patch.paidDate !== undefined) {
        if (before.kind !== 'payment' || before.amountCents === null || !before.currency) throw new StoreError('invalid', 'Only payments record amounts paid');
        const paid = patch.paidCents ?? before.paidCents;
        if (!Number.isSafeInteger(paid) || paid < 0 || paid > before.amountCents) throw new StoreError('invalid', `Paid must be between 0 and ${formatMoney(before.amountCents, before.currency)}`);
        const paidDate = patch.paidDate === undefined ? before.paidDate : patch.paidDate;
        if (paidDate !== null && !isValidIsoDate(paidDate)) throw new StoreError('invalid', 'Use a valid payment date');
        if (paid !== before.paidCents) changes.push(`paid ${formatMoney(before.paidCents, before.currency)} → ${formatMoney(paid, before.currency)}`);
        if (paidDate !== before.paidDate) changes.push(`paid on ${before.paidDate ? formatDate(before.paidDate) : 'none'} → ${paidDate ? formatDate(paidDate) : 'none'}`);
        after.paidCents = paid;
        after.paidDate = paid > 0 ? (paidDate ?? now().slice(0, 10)) : null;
        // A payment's status follows the money: fully paid is done; un-paying reopens it.
        if (paid === before.amountCents && after.status !== 'done') { after.status = 'done'; changes.push('status → Done (fully paid)'); }
        if (paid < before.amountCents && before.status === 'done' && patch.status === undefined) { after.status = 'open'; changes.push('status Done → Not started (not fully paid)'); }
      }
      if (!changes.length) return { obligation: before, changed: false };
      const timestamp = now();
      await db.run(`UPDATE obligations SET status = ?, owner_id = ?, due_date = ?, due_source = ?, title = ?, paid_cents = ?, paid_date = ?,
        version = ?, updated_at = ? WHERE id = ?`, [after.status, after.ownerId, after.dueDate, after.dueSource, after.title, after.paidCents,
        after.paidDate, version + 1, timestamp, obligationId]);
      await this.audit(db, workspaceId, userId, 'obligation_updated', 'obligation', obligationId, before.contractId,
        `Updated ${before.ref}: ${changes.join('; ')}`, { ref: before.ref, changes,
          before: { status: before.status, ownerId: before.ownerId, dueDate: before.dueDate, paidCents: before.paidCents, paidDate: before.paidDate, title: before.title },
          after: { status: after.status, ownerId: after.ownerId, dueDate: after.dueDate, paidCents: after.paidCents, paidDate: after.paidDate, title: after.title } });
      return { obligation: { ...after, version: version + 1, updatedAt: timestamp }, changed: true };
    });
  }

  async addEvidence(userId: string, workspaceId: string, obligationId: string, input: { kind: 'file' | 'link' | 'note'; label: string;
    url?: string; note?: string; fileName?: string; fileMime?: string; bytes?: Buffer }) {
    return this.db.tx(async db => {
      await this.role(userId, workspaceId, db);
      const ob = await db.get<{ ref: string; contract_id: string }>('SELECT ref, contract_id FROM obligations WHERE id = ? AND workspace_id = ?', [obligationId, workspaceId]);
      if (!ob) throw new StoreError('not_found', 'Obligation not found');
      const count = await db.get<{ n_count: number }>('SELECT COUNT(*) AS n_count FROM evidence WHERE obligation_id = ?', [obligationId]);
      if (Number(count?.n_count ?? 0) >= 20) throw new StoreError('invalid', 'An obligation can hold up to 20 pieces of evidence');
      const label = input.label.trim().slice(0, 120) || (input.fileName ?? 'Evidence');
      const id = randomUUID();
      const size = input.bytes?.length ?? null;
      if (size !== null && size > MAX_EVIDENCE_BYTES) throw new StoreError('invalid', 'Evidence files can be up to 3 MB');
      await db.run(`INSERT INTO evidence (id, obligation_id, workspace_id, kind, label, url, note, file_name, file_mime, file_bytes, file_size,
        file_sha256, added_by, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, obligationId, workspaceId, input.kind, label,
        input.url ?? null, input.note ?? null, input.fileName ?? null, input.fileMime ?? null, input.bytes ?? null, size,
        input.bytes ? sha256(input.bytes) : null, userId, now()]);
      const what = input.kind === 'file' ? `file “${input.fileName}”` : input.kind === 'link' ? 'a link' : 'a note';
      await this.audit(db, workspaceId, userId, 'evidence_added', 'obligation', obligationId, ob.contract_id,
        `Added ${what} as evidence for ${ob.ref} (“${label}”)`, { ref: ob.ref, evidenceId: id, kind: input.kind, sha256: input.bytes ? sha256(input.bytes) : null });
      return id;
    });
  }

  async evidenceFile(userId: string, workspaceId: string, evidenceId: string) {
    await this.role(userId, workspaceId);
    const row = await this.db.get<{ file_name: string | null; file_mime: string | null; file_bytes: Buffer | null }>(
      "SELECT file_name, file_mime, file_bytes FROM evidence WHERE id = ? AND workspace_id = ? AND kind = 'file'", [evidenceId, workspaceId]);
    if (!row?.file_bytes) throw new StoreError('not_found', 'File not found');
    return row;
  }

  // ---------- reports ----------

  async createReport(userId: string, workspaceId: string, input: { contractId: string | null; title: string; asOf: string; draft: unknown;
    model: string | null; requestId: string | null }) {
    const id = randomUUID();
    await this.db.tx(async db => {
      await this.role(userId, workspaceId, db);
      if (input.contractId) await this.contractRow(workspaceId, input.contractId, db);
      await db.run(`INSERT INTO reports (id, workspace_id, contract_id, title, as_of, draft_json, status, model, request_id, created_by, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [id, workspaceId, input.contractId, input.title, input.asOf, json(input.draft), 'draft', input.model,
        input.requestId, userId, now()]);
      await this.audit(db, workspaceId, userId, 'report_drafted', 'report', id, input.contractId,
        `Drafted the report “${input.title}”${input.model ? ` (wording by ${input.model})` : ''}`, { model: input.model, requestId: input.requestId });
    });
    return id;
  }

  async listReports(userId: string, workspaceId: string) {
    await this.role(userId, workspaceId);
    return (await this.db.all<{ id: string; title: string; contract_id: string | null; as_of: string; status: string; approved_at: string | null;
      approver: string | null; created_at: string; author: string }>(`SELECT r.id, r.title, r.contract_id, r.as_of, r.status, r.approved_at,
      a.username AS approver, r.created_at, u.username AS author FROM reports r JOIN users u ON u.id = r.created_by
      LEFT JOIN users a ON a.id = r.approved_by WHERE r.workspace_id = ? ORDER BY r.created_at DESC`, [workspaceId]))
      .map(row => ({ id: row.id, title: row.title, contractId: row.contract_id, asOf: row.as_of, status: row.status, approvedAt: row.approved_at,
        approvedBy: row.approver, createdAt: row.created_at, author: row.author }));
  }

  async getReport(userId: string, workspaceId: string, reportId: string) {
    await this.role(userId, workspaceId);
    const row = await this.db.get<{ id: string; title: string; contract_id: string | null; as_of: string; draft_json: string; status: string;
      approved_text: string | null; approved_facts_json: string | null; approved_at: string | null; approver: string | null; model: string | null;
      created_at: string }>(`SELECT r.*, a.username AS approver FROM reports r LEFT JOIN users a ON a.id = r.approved_by
      WHERE r.id = ? AND r.workspace_id = ?`, [reportId, workspaceId]);
    if (!row) throw new StoreError('not_found', 'Report not found');
    return { id: row.id, title: row.title, contractId: row.contract_id, asOf: row.as_of, draft: parse<unknown>(row.draft_json, null),
      status: row.status as 'draft' | 'approved', approvedText: row.approved_text, approvedFacts: parse<unknown>(row.approved_facts_json, null),
      approvedAt: row.approved_at, approvedBy: row.approver, model: row.model, createdAt: row.created_at };
  }

  async approveReport(userId: string, workspaceId: string, reportId: string, text: string, facts: unknown, verifiedFigures: number) {
    return this.db.tx(async db => {
      await this.role(userId, workspaceId, db);
      const row = await db.get<{ status: string; title: string; contract_id: string | null }>('SELECT status, title, contract_id FROM reports WHERE id = ? AND workspace_id = ?', [reportId, workspaceId]);
      if (!row) throw new StoreError('not_found', 'Report not found');
      if (row.status === 'approved') throw new StoreError('conflict', 'This report is already approved. Draft a new one to report again.');
      const timestamp = now();
      await db.run(`UPDATE reports SET status = 'approved', approved_text = ?, approved_facts_json = ?, text_sha256 = ?, approved_by = ?, approved_at = ?
        WHERE id = ?`, [text, json(facts), sha256(text), userId, timestamp, reportId]);
      await this.audit(db, workspaceId, userId, 'report_approved', 'report', reportId, row.contract_id,
        `Approved the report “${row.title}” (${verifiedFigures} figures checked)`, { verifiedFigures, textSha256: sha256(text) });
      return { approvedAt: timestamp };
    });
  }

  // ---------- calendar ----------

  async createCalendarFeed(userId: string) {
    const token = randomBytes(24).toString('base64url');
    await this.db.run(`INSERT INTO calendar_feeds VALUES (?,?,?) ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash,
      created_at = excluded.created_at`, [userId, sha256(token), now()]);
    return token;
  }

  async hasCalendarFeed(userId: string) {
    return Boolean(await this.db.get('SELECT 1 AS x FROM calendar_feeds WHERE user_id = ?', [userId]));
  }

  async calendarObligations(token: string) {
    const feed = await this.db.get<{ user_id: string }>('SELECT user_id FROM calendar_feeds WHERE token_hash = ?', [sha256(token)]);
    if (!feed) return null;
    const rows = await this.db.all<ObligationRow & { workspace_name: string }>(`${OBLIGATION_SELECT.replace('FROM obligations o', ', w.name AS workspace_name FROM obligations o JOIN workspaces w ON w.id = o.workspace_id')}
      WHERE o.workspace_id IN (SELECT workspace_id FROM members WHERE user_id = ?) AND o.due_date IS NOT NULL
      AND (o.owner_id = ? OR o.owner_id IS NULL) ORDER BY o.due_date`, [feed.user_id, feed.user_id]);
    return rows.map(row => ({ ...obligationFromRow(row), workspaceName: row.workspace_name }));
  }

  // ---------- audit ----------

  private async audit(db: Db, workspaceId: string, actorId: string, action: string, targetType: string, targetId: string,
    contractId: string | null, summary: string, detail: unknown) {
    await db.run('INSERT INTO audit VALUES (?,?,?,?,?,?,?,?,?,?)', [randomUUID(), workspaceId, actorId, action, targetType, targetId,
      contractId, summary.slice(0, 400), json(detail), now()]);
  }

  private async audit_for(workspaceId: string, targetId: string): Promise<AuditEntry[]> {
    return (await this.db.all<{ id: string; username: string; action: string; target_type: string; target_id: string; contract_id: string | null;
      summary: string; detail_json: string; created_at: string }>(`SELECT a.*, u.username FROM audit a JOIN users u ON u.id = a.actor_id
      WHERE a.workspace_id = ? AND (a.target_id = ? OR a.detail_json LIKE ?) ORDER BY a.created_at, a.id`, [workspaceId, targetId, `%${targetId}%`]))
      .map(row => ({ id: row.id, actor: row.username, action: row.action, targetType: row.target_type, targetId: row.target_id,
        contractId: row.contract_id, summary: row.summary, detail: parse(row.detail_json, {}), createdAt: row.created_at }));
  }

  async listAudit(userId: string, workspaceId: string, limit = 200): Promise<AuditEntry[]> {
    await this.role(userId, workspaceId);
    return (await this.db.all<{ id: string; username: string; action: string; target_type: string; target_id: string; contract_id: string | null;
      summary: string; detail_json: string; created_at: string }>(`SELECT a.*, u.username FROM audit a JOIN users u ON u.id = a.actor_id
      WHERE a.workspace_id = ? ORDER BY a.created_at DESC, a.id DESC LIMIT ?`, [workspaceId, Math.min(Math.max(limit, 1), 500)]))
      .map(row => ({ id: row.id, actor: row.username, action: row.action, targetType: row.target_type, targetId: row.target_id,
        contractId: row.contract_id, summary: row.summary, detail: parse(row.detail_json, {}), createdAt: row.created_at }));
  }
}

let singleton: Promise<ClauseBridgeStore> | null = null;

/** The application store: Postgres when DATABASE_URL/POSTGRES_URL is set, otherwise a private local SQLite file. */
export function getStore(): Promise<ClauseBridgeStore> {
  if (!singleton) {
    singleton = (async () => {
      const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
      let db: Db;
      if (url) db = openPostgres(url).db;
      else {
        if (process.env.VERCEL) throw new Error('Hosted ClauseBridge requires DATABASE_URL or POSTGRES_URL');
        const dir = process.env.CLAUSEBRIDGE_DATA_DIR || path.join(process.cwd(), '.clausebridge-data');
        db = (await openSqlite(path.join(dir, 'clausebridge.sqlite'))).db;
      }
      await migrate(db);
      return new ClauseBridgeStore(db);
    })();
    singleton.catch(() => { singleton = null; });
  }
  return singleton;
}
