import type { Db } from './db.ts';

export const SCHEMA_VERSION = 1;

/** Table definitions. `BLOB`/`BIGINT` are swapped for the dialect; everything else is portable. */
function tables(blob: string) {
  return `
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL, username_lower TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (username_lower TEXT PRIMARY KEY, failures INTEGER NOT NULL,
  first_at TEXT NOT NULL, locked_until TEXT);
CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES users(id),
  next_ref INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (workspace_id TEXT NOT NULL REFERENCES workspaces(id), user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner','member')), joined_at TEXT NOT NULL, PRIMARY KEY (workspace_id, user_id));
CREATE TABLE IF NOT EXISTS invites (code_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS contracts (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL, file_name TEXT NOT NULL, file_kind TEXT NOT NULL, file_sha256 TEXT NOT NULL, file_bytes ${blob},
  text TEXT NOT NULL, clauses_json TEXT NOT NULL, parties_json TEXT NOT NULL, effective_date TEXT,
  extraction_json TEXT, uploaded_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS contracts_workspace ON contracts(workspace_id, created_at);
CREATE TABLE IF NOT EXISTS suggestions (id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES contracts(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL, title TEXT NOT NULL, party TEXT NOT NULL,
  clause_id TEXT NOT NULL, quote TEXT NOT NULL, quote_start INTEGER NOT NULL, quote_end INTEGER NOT NULL,
  due_json TEXT NOT NULL, amount_json TEXT NOT NULL, confidence TEXT NOT NULL, reason TEXT NOT NULL, checks_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','rejected')), model TEXT, request_id TEXT,
  decided_by TEXT REFERENCES users(id), decided_at TEXT, obligation_id TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS suggestions_contract ON suggestions(contract_id, status);
CREATE TABLE IF NOT EXISTS obligations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  contract_id TEXT NOT NULL REFERENCES contracts(id), suggestion_id TEXT, ref TEXT NOT NULL, kind TEXT NOT NULL,
  title TEXT NOT NULL, party TEXT NOT NULL, owner_id TEXT REFERENCES users(id),
  due_date TEXT, due_text TEXT NOT NULL, due_source TEXT, amount_cents BIGINT, currency TEXT, amount_source TEXT,
  paid_cents BIGINT NOT NULL, paid_date TEXT, status TEXT NOT NULL CHECK (status IN ('open','in_progress','blocked','done')),
  clause_id TEXT NOT NULL, quote TEXT NOT NULL, quote_start INTEGER NOT NULL, quote_end INTEGER NOT NULL,
  version INTEGER NOT NULL, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, ref));
CREATE INDEX IF NOT EXISTS obligations_workspace ON obligations(workspace_id, due_date);
CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, obligation_id TEXT NOT NULL REFERENCES obligations(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL CHECK (kind IN ('file','link','note')),
  label TEXT NOT NULL, url TEXT, note TEXT, file_name TEXT, file_mime TEXT, file_bytes ${blob}, file_size BIGINT,
  file_sha256 TEXT, added_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS evidence_obligation ON evidence(obligation_id);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  contract_id TEXT REFERENCES contracts(id), title TEXT NOT NULL, as_of TEXT NOT NULL, draft_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved')), approved_text TEXT, approved_facts_json TEXT,
  text_sha256 TEXT, approved_by TEXT REFERENCES users(id), approved_at TEXT, model TEXT, request_id TEXT,
  created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS reports_workspace ON reports(workspace_id, created_at);
CREATE TABLE IF NOT EXISTS calendar_feeds (user_id TEXT PRIMARY KEY REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL,
  contract_id TEXT, summary TEXT NOT NULL, detail_json TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS audit_workspace ON audit(workspace_id, created_at);
`;
}

const SQLITE_GUARDS = `
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT, 'audit entries are append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT, 'audit entries are append-only'); END;
`;

const POSTGRES_GUARDS = `
CREATE OR REPLACE FUNCTION clausebridge_audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN RAISE EXCEPTION 'audit entries are append-only'; END; $$;
DROP TRIGGER IF EXISTS audit_append_only ON audit;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION clausebridge_audit_append_only();
`;

export async function migrate(db: Db) {
  if (db.dialect === 'sqlite') {
    const row = await db.get<{ user_version: number }>('PRAGMA user_version');
    const version = row?.user_version ?? 0;
    if (version > SCHEMA_VERSION) throw new Error('The ClauseBridge database is newer than this application');
    if (version < 1) {
      await db.tx(async tx => {
        await tx.exec(tables('BLOB').replaceAll('BIGINT', 'INTEGER') + SQLITE_GUARDS);
        await tx.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      });
    }
    return;
  }
  await db.tx(async tx => {
    await tx.exec('SELECT pg_advisory_xact_lock(4207731)');
    await tx.exec(tables('BYTEA') + POSTGRES_GUARDS);
  });
}
