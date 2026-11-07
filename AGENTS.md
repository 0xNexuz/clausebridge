# CLAUSEBRIDGE — project instructions for coding agents

ClauseBridge turns contracts into confirmed obligations, deadlines and payment schedules, built on the Univer SDK.
Read `docs/PROPOSAL.md`, `docs/BUILD_LEDGER.md` and `docs/CLIENT_SCOPE.md` before any change.

## Non-negotiable rules
1. This is a Univer partnership project. Use the **real Univer SDK** (Univer Docs for the contract and reports, Univer Sheets for the register and payment schedule), not an imitation editor or table. Verify behaviour against the exact installed SDK version (1.3.1).
2. **People confirm, the AI suggests.** Nothing Ant Ling suggests becomes a tracked obligation until a workspace member confirms it. Every suggestion keeps the exact contract sentence it came from.
3. **No unchecked number or date.** A suggestion's quote must be found in the contract text, and every date and amount is read from that quote by ClauseBridge's own parsers (`lib/contract/terms.ts`). Money is integer cents. Model output never certifies a figure.
4. ClauseBridge supports contract administration. It does not give legal advice or interpret the law, and the UI and prompts say so.
5. Treat uploaded contracts and evidence as untrusted and private. Validate file types and sizes, never log contract text, and keep every query scoped to the caller's workspace.
6. Keep all `@univerjs/*` and `@univerjs-pro/*` packages on exactly the same release (1.3.1); `@univerjs/icons` follows the version the SDK requires. Check Pro rights before adding licensed features (Univer Bases needs Pro services and is not used).
7. Never put `UNIVER_LICENSE_KEY`, Ant Ling API keys, database URLs or other secrets in the browser, Git, screenshots or replies. Only `NEXT_PUBLIC_UNIVER_LICENSE` (license.txt) is meant for the browser.
8. **Ant Ling runs server-side for two jobs only:** suggesting contract terms for human confirmation, and wording progress reports whose figures are filled in by ClauseBridge from fact tokens.
9. Do not claim features, integrations or deployments that have not been reproduced. Sample contracts are synthetic.
10. Submit PRs for review; do not merge or deploy without the owner's go-ahead. Commits are authored by the owner (0xNexuz); add no AI co-author lines.

## Journal
- Before coding, add the next `M-###` (milestone), `I-###` (issue) or `Q-###` (question) entry to `docs/BUILD_LEDGER.md` with date, request and expected outcome.
- After coding, record what changed, the commands run and their results, evidence paths and anything unresolved. Append; never rewrite history.

## Required checks
`npm test` → `npm run typecheck` → `npm run build` → a real browser run of the changed flow.
