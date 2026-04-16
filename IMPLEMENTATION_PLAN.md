# Reports And P&L Implementation Plan

## Goal

Reach the same reporting level as the Flo Marketing sample package in [`example of reports/FLO Marketing`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing), and then go beyond it with a clearer audit trail and review workflow.

That means matching or exceeding:

- `ProfitandLoss.pdf`
- `Report Chase CK.pdf`
- `Report CC Chase.pdf`
- `Report Subcontractors.pdf`
- `Report Ask My Accountant.pdf`

## What “Same Level Or Better” Means

### P&L Parity

- Cash-basis professional P&L
- Parent and child accounts
- Section totals and formulas:
  - Income
  - Cost of Goods Sold
  - Gross Profit
  - Expenses
  - Net Operating Income
  - Other Income / Other Expenses
  - Net Income
- Company-specific account naming
- Stable grouping across repeated vendors and payment rails

### Report Parity

- Source account quick reports like `Chase CK 8277` and `Chase CC 9286`
- Distribution account quick reports like `Subcontractors` and `Ask My Accountant`
- Transaction-level drilldown with columns close to QuickBooks:
  - Date
  - Transaction Type
  - Name
  - Memo / Description
  - Source Account or Split Account
  - Amount
  - Running Balance
- PDF output for each report type, not just one generic export
- Full export package, not only one-at-a-time downloads

### Better Than The Sample

- Human review for uncertain classifications
- Audit trail showing how each P&L line was built
- Transfer clustering and rule reuse
- Explicit "why" behind each classification
- Repeatable local test path using the Flo Marketing sample set

## Current Status

### Already Shipped

- `Simple deposit/deduction` path
- `Professional P&L` path
- AI extraction with Schedule C plus professional account fields
- Guided review for uncertain professional transactions
- Professional audit panel explaining formulas, transfer handling, and review decisions
- Better transfer clustering for review questions
- OpenAI second-pass cluster verifier for professional mode
- Auto-applied high-confidence category remaps from the verifier
- Verifier-driven category confirmation cards inside the existing review step
- Local persisted review-rule store for accepted professional review answers
- Reusable transfer/category rules applied before verifier and manual review
- Professional `Strict review` mode that pauses for material or unclear clusters instead of auto-applying verifier remaps
- Persistent chart-of-accounts store with a first in-app manager tab
- Saved review-rule manager that can remap, disable, or delete persisted rules
- Local company profile store with active-company selection and per-company chart/rule isolation
- Reusable professional ledger payload
- Inferred source-account labeling from uploaded statement filenames
- Distribution and source quick reports in the professional results UI
- Per-report PDF export for quick reports
- Statement-level metadata extraction from uploaded PDFs:
  - institution
  - account name
  - account type
  - account last 4
  - statement period
  - opening / closing balances when visible
- Source-account merging based on extracted statement identity instead of filename-only grouping
- Source report summaries that show statement coverage and reported opening / closing balances
- Professional audit warnings for source-account coverage gaps and likely partial-year statement sets, so missing files are visible alongside classification logic

### Important Gaps Still Open

- Source running balances are still computed from extracted inflows and outflows, not yet anchored from statement opening balances
- Quick report columns are closer to the sample, but still missing fields like cleared/reference/check details when available
- Professional P&L PDF and quick report PDFs still look like Tax Agent exports, not accountant-style final deliverables
- No packet export that downloads the whole report set together
- Company profiles are now separated locally, but persistence is still machine-local and not yet backed by a shared database or auth layer
- No reconciliation, period close, or reproducible cross-session bookkeeping state
- Coverage warnings are now visible, but strict review does not yet pause or require acknowledgement when the uploaded package looks partial for one source account

### Product Stage

Advanced MVP, not full product yet.

### What Still Must Be True Before We Call This A Full Product

- Annual parity needs to be consistently close on the remaining high-dollar buckets, especially `Legal & Professional Fees`, `Meals and Entertainment`, `Telephone Expense`, and the last `Advertising` vs `Subcontractors` drift
- The app needs a manual adjustment / `Ask My Accountant` workflow that is intentionally part of the bookkeeping model, not just an inferred destination bucket
- Coverage and completeness issues need stronger handling than passive warnings, especially in strict review
- Jobs, transactions, chart settings, and rules need shared persistence rather than machine-local files
- Reconciliation, period close, and reproducible reruns still need to exist before this behaves like a bookkeeping product instead of an advanced report builder

## Completed Phases

## Phase 1: Ledger Foundation

### Outcome

Turn the professional output from a rolled-up statement into a reusable transaction ledger that every report can be built from.

### Status

Completed.

### Delivered

- Enriched professional transactions with ledger metadata
- Inferred source account labels from statement files
- Preserved per-transaction decision source and reasoning
- Created report-ready ledger rows with signed amounts
- Added reusable groupings for distribution and source account reporting

## Phase 2: First-Generation Quick Reports

### Outcome

Generate account quick reports from the ledger in the app and support per-report PDF export.

### Status

Completed as a first-generation version.

### Delivered

- Distribution account quick reports such as `Subcontractors` and `Ask My Accountant`
- Source account quick reports such as `Chase CK 8277` and `Chase CC 9286`
- Running-balance style report tables in the UI
- Report selector, summaries, drilldown, and quick-report PDF download

### Still Not Final

- Report fidelity is still approximate
- Source balances are computed, not statement-derived
- Export still happens one report at a time rather than as a full packet

## Revised Build Order

## Phase 3: Source Account Fidelity

### Outcome

Make source-account reports behave much more like the Flo / QuickBooks reference reports.

### Work

- Extract statement-level source account metadata instead of relying only on filename inference
- Capture opening and closing balances when they are available in the uploaded statements
- Produce true running balances from statement data when possible
- Improve transaction type labels beyond generic `Deposit`, `Expense`, and transfer fallbacks
- Track cleared, reference, and check-number style fields when available
- Tighten counterparty/name extraction so rows read more like bookkeeping ledgers than raw bank memos

### Acceptance

- Source reports resemble `Report Chase CK.pdf` and `Report CC Chase.pdf` much more closely
- Running balances are explicitly marked as statement-derived when extracted

## Phase 4: Export Packet And PDF Parity

### Outcome

Produce a final export set that feels like an accountant deliverable rather than an internal app report.

### Work

- Redesign the professional P&L PDF to match the print-first style of the Flo sample
- Redesign quick report PDFs to look closer to QuickBooks-style account reports
- Add business/report header metadata so exports show company identity cleanly
- Add a report-packet export that downloads the P&L plus supporting quick reports together
- Keep the current audit content, but treat it as secondary support rather than the main export format
- Keep export rendering server-owned so future packet exports are reproducible from canonical report data

### Acceptance

- Generated export set can stand next to the Flo Marketing sample package without looking like a prototype
- Users can download the full report package in one action

## Phase 5: Classification Stability And Rules

### Outcome

Make bookkeeping classification stable and company-specific so the review step shrinks over time.

### Status

In progress.

### Work

- Introduce a persistent chart of accounts
- Add company-specific account overrides
- Save review answers as reusable rules
- Add a second-pass verifier that maps ambiguous clusters onto a closed chart of accounts before the final P&L rollup
- Add stricter gating so material or unclear clusters always pause for user confirmation when safety matters more than speed
- Add an in-app rule manager so users can inspect, disable, delete, or remap persisted professional review rules
- Add an in-app chart-of-accounts manager for custom verifier choices and company-specific account expansion
- Add a company profile store so rules and chart overrides can be separated by business without requiring user accounts yet
- Add normalization rules for:
  - transfers
  - ad platforms
  - travel
  - subscriptions
  - subcontractors
  - `Ask My Accountant` items

### Acceptance

- Similar transactions land in the same final account without repeated manual review
- Accepted review decisions survive across local reruns and suppress duplicate review questions
- Users can switch between faster standard review and strict human-confirmation review without losing the existing UI workflow

### Latest Flo Parity Snapshot

Full professional rerun completed on the 16 raw Flo statement PDFs after the rail-specific marketing split was added.

- `Income`: app `1,835,392.75` vs reference `1,829,927.75` (`+0.30%`)
- `Cost of Goods Sold`: app `1,227,108.72` vs reference `1,234,241.75` (`-0.58%`)
- `Expenses`: app `249,100.27` vs reference `259,336.85` (`-3.95%`)
- `Net Income`: app `366,133.76` vs reference `336,349.15` (`+8.86%`)

Largest remaining bucket drift after the latest rerun:

- `Advertising and Promotion`: app `454,108.67` vs reference `476,630.70` (`-22,522.03`)
- `Legal & Professional Fees`: app `15,364.00` vs reference `36,088.95` (`-20,724.95`)
- `Subcontractors`: app `773,000.05` vs reference `757,611.05` (`+15,389.00`)
- `Meals and Entertainment`: app `23,360.54` vs reference `17,617.20` (`+5,743.34`)
- `Telephone Expense`: app `2,022.02` vs reference `7,198.09` (`-5,176.07`)

Concrete findings from the latest rerun:

- `Ask My Accountant` is now exact at `41,282.00`
- `Bank Charge service` is now essentially exact at `1,704.55` vs reference `1,692.60`
- The rail-specific split materially improved the biggest COGS problem:
  - `Advertising and Promotion` moved from `355,661.67` to `454,108.67`
  - `Subcontractors` moved from `866,259.05` to `773,000.05`
- The reference sample supports a descriptor-based split:
  - ACH and same-day `Legatmarketing` / `Movearound` / `Allamericanmarketing` rows appear in the sample `Report Subcontractors.pdf`
  - realtime and vendor-payment variants for the same families appear in the sample checking report, which is why the app now routes those rails into `Advertising and Promotion`
- `Telephone Expense` still only captures the three `AT&T` rows, so the remaining telecom-related spend is still leaking elsewhere
- `Legal & Professional Fees` still under-captures the reference despite now picking up `Lawrence Caplan` plus the `Forbes Hare` wire
- `Meals and Entertainment` remains high because the app still keeps clusters like `Chef Shiran` in meals when the verifier only weakly suggests a suspense bucket
- Transfer-review answers have a large effect on final parity totals, so annual parity runs should use a clean company profile and a deterministic answer policy instead of persisting test answers into the default company
- The raw Flo source pack itself is uneven by account:
  - checking covers the full Jan-Dec 2025 year
  - the credit-card source pack only contains Sep-Dec statement files
  - so part of the remaining annual `Telephone Expense` gap may be source-data coverage rather than only a classifier miss

## Phase 6: Persistence And Reconciliation

### Outcome

Move from "AI report generator" to a bookkeeping system.

### Work

- Persist jobs, transactions, rules, and chart of accounts
- Add reconciliation status
- Add period close logic
- Support amendments and manual journal entries

### Acceptance

- Reports are reproducible and auditable across sessions

## Immediate Next Slice

### Next

- Rerun the full Flo annual parity pack after the new legal/professional trust-wire hardening pass and record the new `Legal & Professional Fees` delta
- Add a stricter completeness gate for professional mode so users must acknowledge or review likely partial-year source accounts before treating the statement as final
- Tighten the `Meals and Entertainment` vs suspense-policy line for clusters like `Chef Shiran`, where the verifier suggests a bookkeeping review but the current statement still keeps the spend as meals
- Revisit `Telephone Expense` only after using the new coverage warnings to separate true classifier misses from missing-statement-month issues
- Keep the new rail-specific marketing split, but refine the remaining `Advertising` vs `Subcontractors` delta by checking whether any additional realtime `Legat / All American / Move Around` variants are still being normalized into subcontractor language
- Continue running annual Flo parity checks on a clean company profile after each high-dollar rule pass and store each checkpoint in this document
- Move the local company profile store into a shared company/account-level bookkeeping store
- Redesign exported PDFs so they look closer to the Flo sample set
- Add a full report-packet download flow instead of only one-at-a-time PDF exports

## Test Pack

Primary parity set:

- [`example of reports/FLO Marketing/Chase CK AÑO 2025`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Chase%20CK%20AN%CC%83O%202025)
- [`example of reports/FLO Marketing/Chase CC`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Chase%20CC)

Target comparison set:

- [`example of reports/FLO Marketing/ProfitandLoss.pdf`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/ProfitandLoss.pdf)
- [`example of reports/FLO Marketing/Report Chase CK.pdf`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Report%20Chase%20CK.pdf)
- [`example of reports/FLO Marketing/Report CC Chase.pdf`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Report%20CC%20Chase.pdf)
- [`example of reports/FLO Marketing/Report Subcontractors.pdf`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Report%20Subcontractors.pdf)
- [`example of reports/FLO Marketing/Report Ask My Accountant.pdf`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Report%20Ask%20My%20Accountant.pdf)
