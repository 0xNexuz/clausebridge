# ClauseBridge build ledger

Append-only record of milestones (M), issues (I) and questions (Q).

## M-001 — Project start (7 November 2026)
- **Request:** Build ClauseBridge to match the proposal in `docs/PROPOSAL.md`.
- **Decisions (owner, 7 November 2026):** public repository `0xNexuz/clausebridge`; reminders in the app plus a calendar feed, no email service.
- **Expected outcome:** a working application covering every proposal promise in `docs/CLIENT_SCOPE.md`, with setup documentation and sample contracts.
- **Foundations reused from ProofLine (same owner):** account sessions, Ant Ling client, request throttling and the report check-and-approve pattern.
- **Status:** in progress.

## M-002 — First working version (7 November 2026)
- **Request:** Build ClauseBridge to match `docs/PROPOSAL.md`.
- **Built:**
  - Contract upload (text PDF via unpdf, `.docx` via mammoth, text), normalisation that re-joins PDF line wraps, clause splitting with exact offsets (`lib/contract/clauses.ts`).
  - Ling 3.2 Flash extraction (`lib/server/extract.ts`): parties, deliverables, payments, deadlines and responsibilities with verbatim quotes. ClauseBridge drops suggestions whose quote is not in the contract, re-anchors quotes to their clause, and reads dates, relative timing (business days included) and amounts itself (`lib/contract/terms.ts`). A model date or amount the clause doesn't state is shown as a warning and not used.
  - Human confirmation: only a member's confirmation creates an obligation; edits are recorded as "set by a person".
  - Shared workspaces with invite codes; obligations with owner, status, due date, evidence (file, link, note) and history; append-only audit (SQLite and Postgres triggers).
  - Univer Docs: read-only contract view (edit commands cancelled before they run) with suggestion quotes highlighted and selected on click; editable progress report.
  - Univer Sheets: obligations register as a Univer table (`ObligationRegister`; a table may not share its sheet's name), payment schedule with SUMIFS totals that ClauseBridge re-checks in integer cents; Paid / Paid on edits saved back with version checks.
  - Dashboard (overdue, due in 30 days, outstanding and overdue money per currency, needs attention), in-app reminders and a private iCalendar feed with a day-before alert.
  - Progress reports: facts and clause references filled in by ClauseBridge, summary wording by Ling 3.2 Flash through tokens only (plain summary when Ant Ling is not connected), pre-approval check, approval, and "changed since approval".
- **Checks:** `npm test` 12/12 pass (parsing, grounding, store, privacy between workspaces, payments, dashboard, calendar); `npm run typecheck` clean; `npm run build` passes. Browser runs on the production build: sample contracts, PDF and Word uploads, suggestions, confirmations, drawer edits and evidence, register table, a Paid edit in Univer Sheets saved and re-checked, report check (57 figures verified) and approval path.
- **Not yet verified:** suggestions from the real Ant Ling API. Local runs used a stand-in server returning a hand-written reply in Ling's format (`tests/fixtures/standin-website-reply.json`); it is not model output. A live check needs a deployment with `ANT_LING_API_KEY`.
- **Issues fixed during the run:** Univer's read-only permission showed a "content is protected" message on load, replaced by cancelling edit commands; disposing Univer inside React cleanup warned, now deferred; the report check flagged digits in the workspace name and the "next 30 days" heading, now allowed; formula totals arrive as formatted strings after calculation, now parsed and awaited.

## M-003 — Design: paper collage art direction (7 November 2026)
- **Request (owner):** merge four reference images into new artwork and design the full frontend and the internal tool, with smooth hover animations.
- **Built:** see `docs/DESIGN.md`. Original artwork in code: torn-paper hero collage with a contract-page character whose eyes follow the cursor, a pixel-art reader with a laptop, a pixel couch scene for the 404 page, and a distressed vintage box of four highlighter pens whose colours are the four obligation kinds. Two references were other companies' property (a browser game's dinosaur; tobacco and software branding), so ClauseBridge uses original equivalents.
- **Evidence:** screenshots in the PR.

## M-004 — Vercel project (7 November 2026)
- **Request (owner):** create the Vercel project with a short link.
- **Done:** project `clausebridge` (team `xreyys-projects`) linked to `0xNexuz/clausebridge`, production branch `main`, framework Next.js, Node 24. First deployment built from PR #1's branch and is live at https://clausebridge.vercel.app (public, landing page served).
- **Postgres check:** `tests/postgres.integration.mjs` run against a local PostgreSQL 16: migrations (twice), accounts, workspace privacy, invites, contract with file bytes, extraction save, confirm and reject, payments, evidence bytes, reports, calendar feed and append-only audit all pass.
- **Owner to do:** add a Postgres database (Neon) to the project so `DATABASE_URL` is set, add `ANT_LING_API_KEY` (server only), then redeploy. Until then `/app` cannot store accounts.
