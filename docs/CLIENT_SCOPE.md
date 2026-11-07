# Scope and open questions

**Project:** ClauseBridge (second of three Univer proposals, after ProofLine)
**Status:** In development. Not a signed statement of work.

## Proposal promises and how ClauseBridge meets them

| Proposal | ClauseBridge |
| --- | --- |
| Upload contracts | PDF (text-based), Word .docx and plain-text files up to 4 MB. Scanned image PDFs need OCR and are out of scope for the first release. |
| Review AI-suggested obligations in a shared workspace | Team workspaces with invite codes. Suggestions wait in a review queue beside the contract. |
| Extract suggested deadlines, deliverables, parties and payment terms for human confirmation | Ling 3.2 Flash suggests terms with the exact sentence they came from. ClauseBridge checks the sentence is in the contract and reads dates and amounts itself. A member confirms, edits or rejects each one. |
| Track each approved obligation with an owner, status and supporting evidence | Obligations have an owner (a workspace member), status, due date and evidence (files, links or notes). |
| View upcoming deadlines, outstanding payments and unresolved items | Dashboard: overdue and upcoming deadlines, amounts outstanding, and items needing attention. |
| Progress summaries and management reports linked to the contract text | Report wording by Ling 3.2 Flash, figures and clause references filled in by ClauseBridge, opened in Univer Docs, checked and approved. |
| Users confirm extracted terms before they become tracked obligations | Enforced on the server: only a confirmation creates an obligation. |
| Contract administration, not legal advice | Stated in the app; the extraction prompt forbids legal interpretation. |
| Univer Docs: editable contract review workspace with clear references to source clauses | The contract opens in Univer Docs with numbered clauses; selecting a suggestion or obligation selects its source text. |
| Univer's relational tables, where available under the SDK plan | Univer Bases is a Pro unit that relies on Univer's services. The register uses Univer Sheets tables (open source) instead. |
| Univer Sheets: payment schedules and totals | Payment schedule sheet with formulas for scheduled, paid and outstanding amounts, re-checked to the cent. |
| Univer Slides or Docs: progress reports | Univer Docs. |
| Extraction pipeline, human review, reminders and audit history | All four, with reminders in the app and as a calendar feed (.ics) with alerts. |

## To agree with the client
- Whether ClauseBridge may be publicly demoed and posted on X.
- Which Univer licence edition, features and authorised domains apply to ClauseBridge's deployment.
- Whether Ant Ling may process uploaded contract text in the deployed app.
- Who supplies test users, real (anonymised) contracts and final sign-off.

Do not record licence keys, API keys or private contracts in this repository.
