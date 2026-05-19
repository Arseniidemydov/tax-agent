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
- Accountant review inbox inside the professional flow with:
  - per-question accountant notes
  - client follow-up question drafting
  - dedicated `awaiting_client` sign-off gate for unresolved client items
  - exportable client clarification packet PDF
  - answer intake tied back to the exact review item before finalization
  - explicit `this run only` vs `save for future company runs` decision scope
  - final audit visibility for notes, client questions, and resolved client responses
- Professional audit panel explaining formulas, transfer handling, and review decisions
- Better transfer clustering for review questions
- OpenAI second-pass cluster verifier for professional mode
- Auto-applied high-confidence category remaps from the verifier
- Verifier-driven category confirmation cards inside the existing review step
- Internal verifier evidence layer with:
  - company-level historical cluster lookup
  - deterministic refund / returned-item diagnostics
  - bank-fee signal checks fed into the verifier prompt
- Stability guard on verifier remaps that can:
  - suppress drift-prone remaps when stable company history already supports the current mapping
  - hold refund / returned-item / transfer-like remaps for user confirmation instead of auto-applying them
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
- Strict professional review now pauses on likely partial-year source accounts and asks the user to acknowledge or exclude them before the statement is finalized

### Important Gaps Still Open

- Source running balances are still computed from extracted inflows and outflows, not yet anchored from statement opening balances
- Quick report columns are closer to the sample, but still missing fields like cleared/reference/check details when available
- Professional P&L PDF and quick report PDFs still look like Tax Agent exports, not accountant-style final deliverables
- No packet export that downloads the whole report set together
- Company profiles are now separated locally, but persistence is still machine-local and not yet backed by a shared database or auth layer
- No reconciliation, period close, or reproducible cross-session bookkeeping state
- Standard professional review still warns about partial-year source accounts, but it does not pause for acknowledgement the way strict review now does

### Product Stage

Advanced MVP, not full product yet.

### Current Readiness Estimate

- Draft-generation power: roughly `75-85%`
- Accountant-grade trust and repeatability: roughly `55-65%`

### What Still Must Be True Before We Call This A Full Product

- Annual parity needs to be consistently close on the remaining high-dollar buckets, especially `Legal & Professional Fees`, `Meals and Entertainment`, `Telephone Expense`, and the last `Advertising` vs `Subcontractors` drift
- The app needs a manual adjustment / `Ask My Accountant` workflow that is intentionally part of the bookkeeping model, not just an inferred destination bucket
- Coverage and completeness issues need stronger handling than passive warnings, especially in strict review
- Jobs, transactions, chart settings, and rules need shared persistence rather than machine-local files
- Reconciliation, period close, and reproducible reruns still need to exist before this behaves like a bookkeeping product instead of an advanced report builder

### Accountant-Ready Checklist

This is the blunt gate list for calling the product accountant-ready rather than just a strong internal draft generator.

#### 1. Accuracy And Stability Gates

- [ ] Full-year benchmark reruns stay consistently close, not just one lucky run
- [ ] `Income`, `COGS`, `Expenses`, and `Net Income` stay within an acceptable tolerance on repeated clean reruns
- [ ] Remaining high-dollar drift is closed or reduced to explicitly reviewed exceptions:
  - `Legal & Professional Fees`
  - `Meals and Entertainment`
  - `Telephone Expense`
  - `Advertising and Promotion`
  - `Subcontractors`
- [ ] Refunds, reversals, returned items, and transfer-like deposits no longer swing between `Income`, `Other Income`, and `Ignore` because of wording changes
- [ ] Similar memo families land in the same account on repeated runs without needing fresh human correction

#### 2. Human Review And Audit Gates

- [ ] Any material or unclear classification can pause for user confirmation
- [ ] Saved user decisions clearly override model guesses
- [ ] Users can see why a transaction was classified the way it was:
  - model
  - local rule
  - saved review rule
  - manual confirmation
- [ ] The final P&L can show what was excluded, what was reviewed, and what was auto-applied
- [ ] `Ask My Accountant` becomes a deliberate review workflow, not only a catch-all inferred bucket

#### 3. Completeness And Trust Gates

- [ ] Missing-statement and partial-year coverage is impossible to miss before a report is treated as final
- [ ] Strict review can block finalization when account coverage is likely incomplete
- [ ] Source-account coverage, statement periods, and balance continuity are visible in the final audit
- [ ] Accountants can distinguish classification error from missing-file error

#### 4. Bookkeeping-System Gates

- [ ] Jobs, transactions, rules, and chart settings are stored in shared persistence, not just machine-local files
- [ ] Reports are reproducible across sessions and reruns
- [ ] Manual adjustments or journal-style corrections are supported
- [ ] Reconciliation status exists for source accounts
- [ ] Period-close logic exists so a finalized package behaves like bookkeeping output, not just an ad hoc report

#### 5. Delivery And Workflow Gates

- [ ] The exported P&L and quick reports look accountant-ready, not app-generated
- [ ] Full report packet export exists
- [ ] Accountants can drill from a P&L line into supporting transaction detail quickly
- [ ] The review flow is fast enough that the product saves real time instead of creating cleanup work

#### 6. Practical Readiness Conclusion

The product is ready to position as:

- an accountant copilot for draft P&Ls and supporting reports
- a first-pass categorization and review system

The product is not ready to position as:

- a fully automated bookkeeping engine that can be trusted without review
- a final-books / sign-off system for multi-client production use

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

### Best Flo Parity Checkpoint

Best full professional rerun completed on the 16 raw Flo statement PDFs after the legal/professional trust-wire hardening pass and the new strict completeness gate.

- `Income`: app `1,830,427.75` vs reference `1,829,927.75` (`+0.03%`)
- `Cost of Goods Sold`: app `1,230,279.46` vs reference `1,234,241.75` (`-0.32%`)
- `Expenses`: app `261,573.29` vs reference `259,336.85` (`+0.86%`)
- `Net Income`: app `339,375.00` vs reference `336,349.15` (`+0.90%`)

Largest remaining bucket drift after the latest rerun:

- `Advertising and Promotion`: app `460,479.41` vs reference `476,630.70` (`-16,151.29`)
- `Legal & Professional Fees`: app `24,404.00` vs reference `36,088.95` (`-11,684.95`)
- `Subcontractors`: app `769,800.05` vs reference `757,611.05` (`+12,189.00`)
- `Ask My Accountant`: app `43,562.00` vs reference `41,282.00` (`+2,280.00`)
- `Meals and Entertainment`: app `23,557.01` vs reference `17,617.20` (`+5,939.81`)
- `Telephone Expense`: app `2,022.02` vs reference `7,198.09` (`-5,176.07`)

Concrete findings from the best checkpoint:

- Overall statement totals are now within about `1%` of the Flo reference on a clean company profile with deterministic review answers
- `Legal & Professional Fees` materially improved from the prior annual checkpoint (`15,364.00` -> `24,404.00`), which validates the legal/professional trust-wire hardening
- `Advertising and Promotion` and `Subcontractors` are now both close enough that the remaining gap looks like policy/rule tuning rather than broken routing
- `Ask My Accountant` drifted back above the reference on this clean rerun, so some suspense-style items are still landing there that probably belong in legal/professional, meals, or another expense family
- `Bank Charge service` is still close (`1,507.85` vs `1,692.60`), but no longer exact on the clean rerun
- The annual standard-review queue narrowed to `6` questions:
  - `3` transfer-style questions
  - `3` verifier/category questions
- The raw Flo source pack itself is uneven by account:
  - checking covers the full Jan-Dec 2025 year
  - the credit-card source pack only contains Aug/Sep-Dec statement coverage
  - the new audit now surfaces that partial-year card coverage explicitly instead of leaving it as hidden context
- `Telephone Expense` still only captures the visible `AT&T` rows, so the remaining telecom gap still looks at least partly constrained by source coverage

### Recent Validation Experiments

Two follow-up annual reruns after the best checkpoint exposed a new theme: the remaining problem is no longer just single-vendor rules, but stability across extraction variants and explicit handling for refunds/returned items.

- `flo-parity-run-legal-3.json`
  - bank and wire fees improved materially (`Bank Charge service` moved to `1,611.85`, near the `1,692.60` reference)
  - but broad refund-credit handling created `25,835.00` of `Other Income`, which pushed `Net Income` to `364,885.76` (`+8.48%`)
  - analysis showed three vendor/travel refund credits plus a bad `Deposited Item Returned NSF` classification were responsible for most of the overshoot
- `flo-parity-run-legal-4.json`
  - narrowed the refund-credit exception and forced NSF returns back out of the P&L
  - this removed the overshoot, but the annual result fell to `Net Income 329,094.76` (`-2.16%`)
  - that run also showed extraction variance still moves dollars between `Advertising`, `Subcontractors`, `Meals`, `Legal & Professional Fees`, and `Bank Charge service`

Current conclusion from the rerun history:

- the strongest overall parity is still the earlier `flo-parity-run-legal.json` checkpoint
- the newer reruns are still valuable because they revealed two real product requirements:
  - explicit handling for `returned NSF` and refund-credit transactions
  - a stability layer that reduces sensitivity to memo/extraction wording changes between runs

### Internal Tooling Checkpoint

The first internal verifier-tool layer is now shipped:

- company-level historical cluster lookup is persisted after completed professional runs
- deterministic refund / returned-item / bank-fee diagnostics are attached to verifier candidates
- the OpenAI verifier now receives those tool results as evidence rather than reasoning from memo text alone
- a new stability guard can suppress or hold OpenAI remaps when company history plus diagnostics say the remap is drift-prone

Latest live smoke-test result on the same company and March 2025 Flo checking statement run twice:

- first pass: `5` review answers, `historyBackedClusterCount = 0`, `stabilityHeldClusterCount = 1`
- second pass: `1` review answer, `historyBackedClusterCount = 1`, `stabilityHeldClusterCount = 1`

That confirms the verifier can now consult prior company-specific cluster history on rerun and use the new stability layer to reduce repeat review noise.

### Refund / NSF Normalization Checkpoint

Refund-heavy memo normalization is now stronger:

- refund / reversal / credit memo variants are normalized before fingerprinting and verifier-history clustering
- returned-item / NSF memo variants now collapse into a stable adjustment family instead of fragmenting across slightly different bank wording
- returned-item fees are separated from returned-item deposits so fee rows can stay in `Bank Charge service`

Targeted live rerun on the August 2025 Flo checking statement (`20250829-statements-8277-FloMarketing.pdf`), which contains `Yacht Charter Credit Refund` and `Tripr Efund` memo variants:

- first pass: `5` review answers, `historyBackedClusterCount = 0`, `reviewSuggestedClusterCount = 4`
- second pass on the same company and statement: `2` review answers, `historyBackedClusterCount = 1`, `autoAppliedClusterCount = 1`, `reviewSuggestedClusterCount = 0`

That is the strongest proof so far that the refund/NSF normalization is helping the company-history layer recognize the same adjustment family on rerun instead of treating each wording variant as new.

### Annual Flo Pack Checkpoint After Refund / NSF Normalization

The first full-year Flo rerun after the refund / NSF normalization patch completed, but it exposed a new bottleneck:

- all `16` raw statements processed successfully
- the annual totals came out at:
  - `Income 1,804,061.45` vs `1,829,927.75` (`-1.41%`)
  - `COGS 1,222,682.52` vs `1,234,241.75` (`-0.94%`)
  - `Expenses 251,814.41` vs `259,336.85` (`-2.90%`)
  - `Net Income 346,049.52` vs `336,349.15` (`+2.88%`)
- but the OpenAI verifier timed out on the large annual cluster set and fell back to Gemini extraction plus local rules only

That result is still useful because it shows the normalization patch did not break the annual flow, but it is not the final post-normalization benchmark because the second-pass verifier never got to participate.

### Verifier Batching Checkpoint

To fix the annual-run timeout bottleneck:

- the OpenAI verifier now splits large cluster sets into smaller sequential batches instead of sending all annual candidates in one request
- `.env.example` now exposes `OPENAI_VERIFIER_BATCH_SIZE=6`
- the next annual Flo rerun should answer the real question: does the full-year benchmark now keep the second-pass verifier online instead of timing out at the end of extraction?

### Accountant Inbox Checkpoint

The professional review step now behaves more like an accountant workbench than a raw classifier form:

- each review card can capture an accountant note before the P&L is finalized
- each review card can draft and queue a client-facing follow-up question
- queued client items now move the job into a dedicated `awaiting_client` stage instead of pretending the statement is done
- queued client questions can be exported as a clean PDF packet for the client
- client replies can be captured against the exact queued item before final sign-off
- review decisions now have explicit scope:
  - `This run only`
  - `Save for future company runs`
- the final audit trail now shows:
  - which answer was chosen
  - whether it was run-only or reusable
  - any accountant note
  - the queued client follow-up question, when one was created
  - the final client response, when one was required and captured

This is an important bridge between the model layer and actual accountant workflow, because the app can now preserve judgment, pause for client clarification, and only finalize after that clarification is on file.

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

## Phase 7: Report Quality Improvements

### Outcome

Direct, measurable lifts in report accuracy, parity, and accountant-grade trust. Each item below is selected because its primary effect is *better reports*, not new features.

### Shipped Subset (waves 1-2)

The first two waves of Phase 7 shipped together with the Claude API migration:

**Wave 1 (alongside the Claude swap):**

- **7.1 Reconciliation** — per-statement opening/closing balance check, surfaced as `statementReconciliations` and `reconciliationAlerts` in the audit panel, plus two new overview stats. Validated end-to-end on a 12-statement test pack: all 12 statements reconciled to the penny (`delta=$0.00`).
- **7.2 (partial) Tighter extraction schema** — `category` and `plSection` are now closed-enum constrained in the tool schema (previously free strings), so Claude can no longer emit values outside the known set. The full 7.2 (drop dual classification entirely) deferred because the existing `category_conflict` review signal depends on a Schedule C category being present.
- **7.9 Correctness fixes** — `OWNER (DRAW|DISTRIBUTION|PAYMENT)` ignore pattern tightened to `OWNER (DRAW|DISTRIBUTION)` so legitimate owner payments are no longer silently dropped. The exponential-backoff retry policy was already implemented as part of the Claude migration.

**Wave 2:**

- **7.3 Few-shot for high-drift buckets** — added a `VENDOR DISAMBIGUATION GUIDE` section to the professional extraction prompt with concrete vendor-name examples for `Subcontractors`, `Advertising and Promotion`, `Telephone Expense`, `Meals and Entertainment`, and `Legal & Professional Fees`. Sits in the cached system block so the prompt-cache hit rate is unaffected.
- **7.6 Accountant-style PDF parity** — `drawProfessionalReport` and `drawQuickReport` rewritten in plain Helvetica with no color fills, thin horizontal rules, indented hierarchy, parentheses for negative amounts, and a single `Cash Basis  <date>` footer. Quick reports now use QuickBooks-style column layout (`Distribution Account | Date | Type | Name | Memo / Description | Source Account / Full Name | Amount | Balance`). Validated by re-rendering against the 12-statement test JSON.

**Wave 3:**

- **7.7 (partial) Parity reporter** — `npm run parity` reads every `data/flo-parity-run*.json` snapshot and prints a per-run drift table against the canonical Flo Marketing accountant figures (income / COGS / expenses / net income), plus an optional per-bucket drift table via `--groups` covering Subcontractors, Advertising and Promotion, Legal & Professional Fees, Meals and Entertainment, Telephone Expense, Bank Charge service, and Ask My Accountant. The best run (lowest absolute net-income drift) is auto-marked. Substring filter: `npm run parity -- legal` matches all four legal-* snapshots. **Deferred:** a true *replayer* (re-run today's classifier against historical raw extractions) needs raw transactions persisted at extraction time — current dumps are post-classified, not replayable. Tracked as a follow-up.

**Wave 4:**

- **7.4 Verifier tuning for drift-prone buckets** — added `Meals and Entertainment` to the verifier priority-group list (it was the only one of the four high-drift buckets missing from `isVerifierPriorityGroup`) and dropped the `$250` amount floor for priority-group clusters: any cluster currently sitting in `Subcontractors`, `Advertising and Promotion`, `Legal & Professional Fees`, `Meals and Entertainment`, `Telephone Expense`, `Bank Charge service`, `Computer and Internet`, `Other Expense`, or `Ask My Accountant` is now a verifier candidate regardless of dollar amount. The `MAX_OPENAI_VERIFIER_CLUSTERS=18` cap still bounds per-run cost. The verifier model upgrade itself (Sonnet 4.6) was already in place from the Claude migration.
- **7.8 Strengthen the Ask My Accountant lane** — when the verifier returns a classification with `confidence < VERIFIER_AMA_FALLBACK_CONFIDENCE` (default `0.55`), the cluster is automatically rerouted to `expenses_ask_my_accountant` instead of being kept in a real bucket. The verifier's original pick stays visible in `classificationMeta.verifierOriginalClassificationId` for audit. `Ignore`-class decisions (transfers, balance-sheet activity) are exempt — those need to stay out of the P&L entirely. Added `askMyAccountantForcedClusterCount` to the verifier summary and a new "Low-confidence picks routed to Ask My Accountant" overview stat. Configurable via the new `VERIFIER_AMA_FALLBACK_CONFIDENCE` env var.

**Wave 5:**

- **7.5 (partial) Vendor canonicalization — Income side** — added `canonicalizeIncomeAccount(description)` and a new Income branch in `canonicalizeProfitAndLossGrouping` that forces every income line into `Sales` group with a payment-rail-derived account: `Square Sales`, `Stripe Sales`, `Zelle Sales`, `PayPal Sales`, `Venmo Sales`, `Cash App Sales`, or generic `Sales`. The customer name now belongs in the ledger row's NAME column (via the existing `canonicalizeCounterpartyName`), not baked into the chart of accounts. Validated against the 12-statement test ledger: collapses 21 sales subaccounts (`Sales`, `Square Sales`, `Sales - Square`, `Zelle Sales`, `Sales - Marketing Services`, `Sales - Meraki Press USA LLC`, ...) down to 4 (`Zelle Sales $55,821`, `Square Sales $33,053`, `Sales $28,915`, `Stripe Sales $473`) with totals preserved exactly. **Deferred:** the full architectural 7.5 (a persistent per-company vendor table that grows with use, plus expense-side canonicalization) needs database-backed persistence and is a larger effort.

Open items: `7.5` full vendor canonicalization (architectural), `7.7` parity replayer.

## Phase 8: Personal-Expense Detection (per-company)

### Outcome

Commingled business accounts carry heavy personal activity (mortgage, personal credit cards, life insurance, family Zelles, lifestyle merchants, vacation purchases) that today flows into the P&L as business expenses. Phase 8 detects candidate personal transactions, surfaces them as review questions, and remembers the per-company answer so future runs auto-apply — mirroring what the ChatGPT-style CPA report does ("Personal expenses were reclassified as shareholder distributions / owner draws").

**The defining constraint**: what counts as "personal" depends on the company. Mortgage payments are personal for a consulting firm but business for a real-estate investment LLC. The heuristic layer only proposes a *category match* (e.g. "this is a mortgage-servicer pattern"); the per-company persisted answer is the only source of truth for whether the category is personal for that company.

### Shipped

- **`detectPersonalCandidateCategory(tx)`** — returns `{ category, confidence, reasons }` for transactions matching any of nine known patterns: `mortgage_servicer`, `consumer_credit_card`, `personal_auto_loan`, `life_insurance_individual`, `family_keyword_zelle`, `atm_cash_withdrawal`, `lifestyle_merchant`, `consumer_subscription`. Confidence ≥ 0.55 surfaces as a review question. Validated against the M.E.M. PRODUCTS CORP three-statement test set: 25/31 expected memos correctly matched across categories; 5 negative controls (ABBOUD revenue, WEX fleet, FPL utility, AT&T phone, individual-name contractor Zelle) correctly skipped.
- **`buildPersonalCandidateReviewSignal(tx, detection)`** — review question whose framing explicitly says "for this company" with three options: `exclude_owner_draw` (default), `keep_business_expense`, `ignore_transfer`.
- **Dispatch insertion** in `getProfessionalReviewSignal` between the transfer/refund and category-conflict branches.
- **New classification target** `ignore_owner_draw` (section `Ignore`, group `Owner Draws`, account `Owner Draws / Personal`) in `PROFESSIONAL_VERIFIER_CLASSIFICATIONS`. Conservative guidance: the verifier is told **not** to auto-classify into this bucket — only the user-review pathway puts transactions here.
- **Per-company persistence** via a new `personal_candidate_cluster` `ruleType` in `buildPersistedReviewRuleMatch`. Bucket key is `(category, canonical counterparty)` so all NEWREZ payments share one bucket but a different mortgage servicer asks again. **Decisions live on the active company profile only** — the same memo on a different company starts fresh.
- **Bucket grouping** via new `'personal_candidate_review'` branch in `buildReviewBucketInfo`.
- **Family-keyword Zelle canonicalization** in `canonicalizeCounterpartyName` — `Zelle payment to Hijo Luis` / `... Hija Myriam` / `... Mama` all canonicalize to `Family Member (<keyword>)` so they share one review bucket.
- **Parallel question cap** `MAX_PERSONAL_CANDIDATE_QUESTIONS = 10` plumbed through `selectProfessionalReviewQuestions` so first-run commingled accounts can surface their full personal cluster set without crowding the regular 6-slot review queue.
- **Audit panel additions** in `buildProfessionalAudit`: new return key `personalExpenseClusters` (per-cluster `{category, counterpartyLabel, transactionCount, totalAmount, decisionForThisCompany}`), four new overview stats, and a new `logicSteps` entry that fires when any exclusions were applied.
- **Webhook payload** — `notifyPnLWebhook` appends `personalClustersFlagged`, `personalExpensesExcluded`, and `personalCandidatesPending` when relevant, so n8n can route a different notification when commingled activity needs attention.

### Multi-company safety

The mechanism that makes this multi-company-correct is the existing per-company rule store (`data/company-profiles.json` → each company's `reviewRules` array). The bucket key encodes both the category and canonical counterparty; the rule store is scoped per company. Verified by:

1. M.E.M. PRODUCTS CORP (commingled service business): first run surfaces ~8 personal clusters; user answers `exclude_owner_draw` → P&L matches ChatGPT's ~$23.6K Net Income.
2. A real-estate investment LLC profile (hypothetical, same statements): mortgage cluster surfaces again; user answers `keep_business_expense` → mortgage stays in expenses. Both companies' decisions persist independently.

### Open

- **Add a per-company business-type field** so the review question text adapts ("for a service business this is usually personal; for a real-estate investor this is usually business"). Lower priority — the per-company learning already produces correct results without this hint.
- **Confidence-tier UI** so the user can see *why* the system flagged each item (mortgage servicer match vs family keyword vs lifestyle merchant). The data is already in `personalExpenseClusters[].reasons` — the UI surfacing is separate work.

### 7.1 Reconcile Against Statement Balances [SHIPPED]

`openingBalance` and `closingBalance` are extracted (see [`server.js:1086`](server.js#L1086)) but never used as a check, so extraction errors flow silently into the P&L.

- Add a per-statement reconciliation step:
  - `expected = closingBalance - openingBalance`
  - `extracted = sum(deposits) - sum(deductions)` (signed by accountType)
  - `delta = expected - extracted`
- If `|delta| > tolerance` (e.g., `$0.50`), surface a hard audit alert and block `final` status until acknowledged.
- Anchor source running balances from `openingBalance` instead of computing them from inflows/outflows.

#### Acceptance

- Statements with extraction gaps are flagged before the report is treated as final
- Source running balances are statement-derived when opening balance is available

### 7.2 Eliminate Dual Classification In The Gemini Prompt [PARTIAL — SHIPPED]

The professional prompt asks Gemini for both a Schedule C `category` and `plSection`/`plGroup`/`plAccount` ([`server.js:1163-1172`](server.js#L1163-L1172)). This doubles the hallucination surface and is a likely root cause of drift in `Legal & Professional Fees`, `Meals`, `Telephone`, and `Advertising` vs `Subcontractors`.

- In professional mode, drop `category` from the prompt entirely.
- Have Gemini emit only `{plSection, plGroup, plAccount}` from a closed enumeration of the verifier classification IDs in `PROFESSIONAL_VERIFIER_CLASSIFICATIONS`.
- Reject any value outside the enumeration during normalization.
- Use Gemini's structured output / JSON schema mode (`responseMimeType: "application/json"`, `responseSchema`) instead of relying on prose JSON parsing.
- Reconcile the `SCHEDULE_C_CATEGORIES` taxonomy ([`server.js:326`](server.js#L326)) with the verifier classifications. Today `Travel and meals` is collapsed in Schedule C but split in the verifier - pick one taxonomy and use it everywhere.

#### Acceptance

- Extraction returns a value strictly inside the closed classification set
- Drift in the four high-impact buckets is reduced on the parity benchmark

### 7.3 Few-Shot Block For The Four High-Drift Buckets [SHIPPED]

Add 8-12 hand-picked examples to the professional extraction prompt, drawn from `data/flo-parity-run-*.json`, specifically the wordings that have historically drifted:

- `Legatmarketing`, `Expresso`, `All American Marketing` -> `Subcontractors`
- `FACEBK ADS` / `FB` -> `Advertising and Promotion / Facebook`
- `ATT` / `VERIZON` / `T-MOBILE` -> `Telephone Expense`
- `DOORDASH` / `UBER EATS` / restaurant names -> `Meals and Entertainment`
- `ATTORNEY` / `LAW OFFICES` / `CPA` -> `Legal & Professional Fees`

#### Acceptance

- Parity drift on these four buckets is closed against the Flo reference checkpoint

### 7.4 Verifier Tuning For Drift-Prone Buckets [SHIPPED]

Today the OpenAI verifier ([`server.js:56-57`](server.js#L56-L57)) only runs on clusters >= `$750` and uses `gpt-4o-mini`. Recurring small mis-tags accumulate into thousands of dollars of drift.

- Run the verifier on any cluster whose `plGroup` is one of the four high-drift buckets, regardless of amount.
- Upgrade the verifier model to a stronger judgement model (e.g. `gpt-4.1` or Claude Sonnet 4.6). Cost is roughly 30 calls per run; quality delta is significant.
- Lower auto-apply confidence threshold considerations should still be guarded by the existing stability layer.

#### Acceptance

- Recurring small mis-tags inside the four high-drift buckets are corrected on rerun
- Verifier remains within the existing batching / timeout envelope

### 7.5 Vendor-Name Canonicalization As A Real Pipeline Step [PARTIAL — SHIPPED]

The Flo `Report Subcontractors.pdf` sample shows a clean `NAME` column (`Expresso`, `Legatmarketing`, `Denni Diaz`) separate from `MEMO/DESCRIPTION`. The current code has `inferCounterpartyName` ([`server.js:5477`](server.js#L5477)) and `canonicalizeCounterpartyName` ([`server.js:5511`](server.js#L5511)) but they are not surfaced as a first-class normalized field that the classifier consumes first.

- Make canonical vendor name an explicit pipeline stage:
  1. Extract raw description.
  2. Normalize -> canonical vendor (per-company vendor table, edit-distance fallback).
  3. Classify on `(canonical_vendor, amount, type)` instead of raw memo.
- Persist the canonical vendor table per company so it grows with use.

#### Acceptance

- Same memo family lands in the same account on repeated runs (the existing accountant-readiness gate)
- Quick reports show a clean `NAME` column distinct from `MEMO/DESCRIPTION`

### 7.6 Accountant-Style PDF Parity [SHIPPED]

`drawProfessionalReport` ([`server.js:7415`](server.js#L7415)) uses colored fills, a rounded summary card, and a `Tax Agent` footer. The Flo sample is plain Helvetica, no fills, single rule lines, right-aligned totals, and a `Cash Basis  <date>` footer.

P&L PDF changes:

- Drop the rounded summary card and section color fills (`#edf3ff`, `#e4efff`, etc.).
- Use thin horizontal rules, bold headers, and right-aligned amount columns only.
- Header: `Profit and Loss` / `<Company Name>` / `January-December, <Year>` only. Drop the `generated from uploaded bank statements` subtitle.
- Footer: `Cash Basis  <day>, <date> <time> <tz>  <page>/<total>`.

QuickReport PDF changes ([`server.js:7170`](server.js#L7170)):

- Match the sample columns exactly: `DISTRIBUTION ACCOUNT | TRANSACTION DATE | TRANSACTION TYPE | NUM | NAME | MEMO/DESCRIPTION | FULL NAME | CLEARED | AMOUNT | BALANCE`.
- Add `NUM`, `FULL NAME`, and `CLEARED` columns. `NUM` can be the check / reference number when present in the memo (already partially extracted via `TRANSFER_REFERENCE_PATTERNS`).

#### Acceptance

- Generated P&L and quick reports can sit next to the Flo Marketing sample package without looking like a prototype

### 7.7 Standing Parity Benchmark [PARTIAL — SHIPPED]

`data/flo-parity-run*.json` already contains six historical runs (~80k lines each) but there is no harness that runs them and reports drift per bucket.

- Add `npm run parity` that:
  - loads each parity-run file
  - recomputes the P&L sections and totals
  - compares to the canonical Flo totals per `plGroup`
  - emits a `% drift` table per bucket and per total line
- Treat this as the gate for every other quality change. Without it, every other improvement on this list is unverifiable.

#### Acceptance

- A single command produces the drift table on every parity run file
- New rule and prompt changes are validated against the harness instead of by feel

### 7.8 Strengthen The Ask My Accountant Lane [SHIPPED]

`expenses_ask_my_accountant` ([`server.js:122`](server.js#L122)) is currently only an inferred destination. When the model is uncertain, it picks something - usually `Other Expense` or whichever bucket is closest - and that pollutes real lines.

- Have the verifier emit an explicit confidence on the chosen classification.
- Force any decision below a threshold (e.g. `0.6`) into `Ask My Accountant` instead of letting it land in a real bucket.
- Surface the AMA queue as a deliberate review workflow, matching the `Report Ask My Accountant.pdf` pattern in the sample set.

#### Acceptance

- Real P&L lines stay clean of low-confidence classifications
- The AMA bucket reflects deliberate review, not catch-all spillover

### 7.9 Smaller Correctness Fixes [SHIPPED]

- `IGNORE_PATTERNS` ([`server.js:1212`](server.js#L1212)) includes `OWNER (DRAW|DISTRIBUTION|PAYMENT)` - `PAYMENT` matches far too broadly. Tighten to `OWNER (DRAW|DISTRIBUTION)` and let owner payments be caught by transfer heuristics.
- The retry loop in `extractStatementDataFromPDF` ([`server.js:2731`](server.js#L2731)) has no exponential backoff and treats `429` the same as `503`. Switch to exponential backoff (`5s -> 15s -> 45s`) and split timeout retries from rate-limit retries.

#### Acceptance

- Legitimate owner-payment transactions are no longer silently ignored
- Transient extraction failures recover more reliably under load

### Suggested Sequence

1. `7.1` Reconciliation - unlocks per-statement quality measurement
2. `7.7` Parity benchmark - unlocks per-rule quality measurement
3. `7.2` + `7.3` Prompt schema and few-shot - first round of accuracy gains, verified against the harness
4. `7.5` Vendor canonicalization - locks in stability across reruns
5. `7.4` Verifier tuning - closes remaining recurring drift
6. `7.6` PDF parity - turns the output into a deliverable
7. `7.8` Ask My Accountant lane - cleans up residual low-confidence noise
8. `7.9` Smaller correctness fixes - ship alongside any of the above

## Immediate Next Slice

### Next

- Expand the new stability layer for annual reruns:
  - finish validating the new refund / NSF memo normalization against the full annual Flo pack, now with verifier batching enabled
  - refine explicit decision rules for operating refunds vs non-operating/travel refunds
  - broaden the new history-backed remap suppression beyond the March smoke-test families, especially for refund / transfer-like memo variants
- Build on the new accountant/client loop:
  - turn the client clarification packet into a fuller round-trip workflow, such as shareable links or structured answer import
  - add a clearer `ready to finalize` vs `waiting on client` sign-off dashboard state across runs
  - allow a review answer to become a saved rule directly from the audit/results view without waiting for the next rerun
  - consider anchored per-cluster chat only after the structured inbox proves itself
- Tighten the remaining `Legal & Professional Fees` gap by identifying which trust-company, law-firm, advisory, and settlement-related vendors are still leaking into generic expenses or meals
- Revisit `Bank Charge service` after the new fee fix, and make sure wire/ACH fees stay inside the P&L without dragging the underlying transfer into it
- Tighten the `Meals and Entertainment` vs suspense-policy line for clusters like `Chef Shiran`, where the verifier suggests a bookkeeping review but the current statement still keeps the spend as meals
- Revisit `Telephone Expense` only after using the coverage warnings to separate true classifier misses from missing-statement-month issues
- Keep the rail-specific marketing split, but make one more pass on the last `Advertising` vs `Subcontractors` delta only after the refund/NSF stability work is settled
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
