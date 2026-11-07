# ClauseBridge

**Every promise in your contracts, tracked to the clause.**

ClauseBridge helps small agencies, procurement teams, consultants and startups turn contracts into confirmed obligations, deadlines and payment schedules. Upload a contract, review the deadlines, deliverables, parties and payment terms that Ling 3.2 Flash suggests, and confirm the ones that are right. Confirmed terms become obligations with an owner, a status and evidence, tracked in Univer Sheets and reported in Univer Docs.

ClauseBridge supports contract administration. It does not replace legal review or give legal advice.

Built with the [Univer](https://univer.ai) SDK 1.3.1 and [Ant Ling](https://ant-ling.com)'s Ling 3.2 Flash. The original proposal is in [`docs/PROPOSAL.md`](docs/PROPOSAL.md); [`docs/CLIENT_SCOPE.md`](docs/CLIENT_SCOPE.md) maps every line of it to the feature that meets it.

## What you can do

- **Upload a contract**: a text-based PDF, a Word `.docx` or a text file, up to 4 MB. ClauseBridge extracts the text, splits it into numbered clauses and opens it in Univer Docs. Two fictional sample contracts are built in.
- **Review suggested terms**: Ling 3.2 Flash suggests the parties, deliverables, payments, deadlines and ongoing responsibilities, each with the exact sentence it came from. Click a suggestion and that sentence is selected in the contract.
- **Confirm before anything is tracked**: each suggestion is confirmed (as is, or edited), or rejected, by a workspace member. Only a confirmation creates an obligation.
- **Track obligations**: owner, status, due date and evidence (files up to 3 MB, links or notes) for every obligation, with its full history.
- **See what needs attention**: overdue and upcoming deadlines, outstanding and overdue payments per currency, and unresolved items (terms waiting for review, obligations with no owner or no date, work marked done without evidence).
- **Run the register in Univer Sheets**: confirmed obligations form a Univer Sheets table you can sort and filter. The payment schedule totals scheduled, paid, outstanding and overdue amounts with Univer formulas; record payments in the sheet and save them.
- **Report progress**: draft a progress report for one contract or the whole workspace. It opens in Univer Docs; every figure, date, status and clause reference is filled in by ClauseBridge and checked again before anyone can approve it. Approved reports show which figures have changed since.
- **Work as a team**: shared workspaces with invite codes.
- **Get reminders**: an in-app list of what is overdue or due this week, and a private calendar link (Google, Apple or Outlook) with an alert the day before each due date.
- **Audit everything**: an append-only history of uploads, AI runs, confirmations, rejections, changes, payments, evidence and approvals.

## How the AI is kept honest

Ling 3.2 Flash suggests; people decide; ClauseBridge checks.

1. The model must copy the exact contract words each suggestion comes from. ClauseBridge looks for that quote in the contract text (ignoring case, curly quotes and spacing) and **drops any suggestion whose quote isn't there**, recording why.
2. **Every date and amount is read from the quote by ClauseBridge's own parsers** (`lib/contract/terms.ts`), never taken from the model. If the model offers a date or amount the clause doesn't state, it is shown as a warning and not used.
3. Timing such as "within seven (7) days of the Effective Date" is worked out from the contract's effective date, counting business days where the clause says so.
4. Anything that needs judgement (two dates in one clause, a day/month order that could go either way, a payment with no amount) is marked "check carefully" with the reason.
5. Money is stored as integer cents. Report wording from the model may only cite figures as tokens; ClauseBridge inserts the values and rejects any draft that writes a number itself.

## How Univer is used

| Univer | In ClauseBridge |
| --- | --- |
| Univer Docs | The contract review view (read-only, so every clause reference keeps its exact position), with suggestion quotes highlighted and selected on click. The editable progress report. |
| Univer Sheets tables | The obligations register, with column filters. |
| Univer Sheets formulas | The payment schedule's totals, re-checked by ClauseBridge to the cent. |
| Univer Bases | Not used: it is a Pro unit that relies on Univer's backend services. The proposal allowed for this ("where available under the chosen SDK plan"). |

All Univer packages used are open source (Apache-2.0); no licence key is needed.

## Run it locally

Requirements: Node.js 22.5 or later (24 on Vercel).

```bash
npm install
npm run dev            # http://127.0.0.1:3000
```

Without configuration ClauseBridge stores data in a private SQLite file under `.clausebridge-data/` and runs without AI (everything works except suggesting terms; reports get a plain summary). To turn on Ling 3.2 Flash, copy `.env.example` to `.env.local` and set `ANT_LING_API_KEY`.

## Deploy to Vercel

1. Import the repository into Vercel (framework: Next.js).
2. Add a PostgreSQL database (for example Neon from the Vercel Marketplace) so `DATABASE_URL` is set. The schema is created on first use.
3. Set `ANT_LING_API_KEY` as a server environment variable (never `NEXT_PUBLIC_`).
4. Deploy. Uploads are limited to 4 MB to stay within Vercel's request size limit.

## Tests

```bash
npm test               # parsing, grounding, store, payments, reminders and calendar feed
npm run typecheck
npm run build
```

## Project structure

```
app/                 Next.js routes: landing, /app, API under app/api
components/          The app screens; components/art holds the original artwork
lib/contract/        Clause splitting and ClauseBridge's own date, amount and quote readers
lib/server/          Store (SQLite or Postgres), auth, Ant Ling client, extraction, report drafting
lib/univer-*.ts      Univer Docs and Univer Sheets integration (loaded in the browser only)
lib/obligations.ts   Dashboard, payment totals and reminders
lib/report.ts        Report facts, structure and the pre-approval check
lib/ics.ts           Calendar feed
docs/                Proposal, scope, build ledger and design notes
```

## Limits

- Scanned PDFs (images without selectable text) need OCR first.
- Dates written as numbers (05/02/2027) are read day first and flagged for checking.
- ClauseBridge does not interpret the law, judge whether terms are fair or enforceable, or give legal advice.

Built by 0xNexuz.
