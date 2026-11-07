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

## I-001 — Report check flags digits in a person's name (7 November 2026)
- **Found by:** the first live run on https://clausebridge.vercel.app with Ling 3.2 Flash. A workspace member named `live6t44ib` owned an obligation; the report line "owner live6t44ib" made the pre-approval check flag "6" and "44" as unverified figures, so approval was refused (409).
- **Expected outcome:** names of workspace members and obligation owners, like contract titles and party names, are not treated as figures, while a number typed into the report is still flagged. Names with no letters are never exempted.

## M-005 — Live check with the real Ling 3.2 Flash (7 November 2026)
- **Request (owner):** the Neon database and `ANT_LING_API_KEY` are set on the Vercel project ("settings locked in"); run the full flow on https://clausebridge.vercel.app and add genuine screenshots to the README.
- **How:** the build machine cannot reach vercel.app, so the checks ran from a Vercel Sandbox: an API script, then a real Chromium (headless, version 153) driving the UI. Synthetic test accounts only.
- **API run (deployment with commit `117e232`, then `aeb51fe`):**
  - AI status: connected, model `Ling-3.2-flash`.
  - Website sample (effective date 3 Nov 2026): 17 suggestions, 0 dropped, 3,104 tokens, one request, 10.2 s. All 9 dates and all 4 amounts ClauseBridge read match the contract, including "within five (5) business days of the Effective Date" → 10 Nov 2026. Four terms were marked "check carefully" because the clause gives no date or depends on an event.
  - Uploads on Vercel: the PDF gave 28 clauses, the Word file 21. Word contract (commencement 1 Oct 2026): 14 suggestions, 0 dropped, 2,608 tokens; its 5 dates and 2 NGN amounts match the contract.
  - 27 obligations confirmed; deposit payment saved; status change, a note and a file added as evidence.
  - Report: summary by Ling on the first attempt. The first run found I-001 (approval refused, 409). After the fix: check passes (30 figures), a typed "USD 2,500.00" is flagged and approval with it is refused (409), approval succeeds, and after marking OB-015 done the approved report lists the 4 figures that changed.
  - Calendar feed: 14 events, 12 alarms (done items get none), `TRIGGER:-PT15H`. Audit: 45 entries.
- **Browser run:** landing page, 404 page, account creation, contract in Univer Docs, Ling suggestions (18 this time, 13.6 s; the model's count varies between runs), 15 terms and 2 parties confirmed in the UI, overview, obligation drawer edit and note, register and payment schedule in Univer Sheets (formula totals match the cent check), report drafted with Ling's wording, checked and approved, team and history views. No console errors and no failed requests apart from the deliberate 404.
  - Note for future runs: Chromium started with `--disable-web-security` sends no `Origin` header, so ClauseBridge's same-origin check refuses its writes (403). Normal browsers send it; the check stays as is.
- **Fixed:** I-001 (`lib/report.ts` `reportNames`, used by both report routes; a short fact can no longer mask part of a longer number). Singular labels for "1 open obligation", "1 suggestion to review" and "suggested 1 term".
- **Checks:** `npm test` 14/14 (new `tests/report.test.mjs`), `npm run typecheck` clean, `npm run build` passes.
- **Screens:** `docs/screens/`. Captured from a local copy loaded with the live run's suggestions unchanged; the seed refused to load unless the contract text length, clause count and every quote position matched the live run. The report summary is Ling's wording from the live run, replayed through ClauseBridge's own validation; figures were filled in from the local copy, which mirrors the live state.
- **Test data on the live database:** accounts `live6t44ib`, `tobip2f3`, `tobiqnkx` and `dbgoilj`, each with its own private workspace and the fictional samples. The owner can delete them.
- **Open:** `ANT_LING_API_KEY` is set for Production only, so preview deployments run without AI. Ling's summary wording is checked for figures but not for meaning; people still read it before approving.
