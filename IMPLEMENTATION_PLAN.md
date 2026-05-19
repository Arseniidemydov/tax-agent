# Reports And P&L Implementation Plan

## Goal

Reach the same reporting level as the Flo Marketing sample package in [`example of reports/FLO Marketing`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing), and then go beyond it with a clearer audit trail and review workflow. Specifically match or exceed `ProfitandLoss.pdf`, `Report Chase CK.pdf`, `Report CC Chase.pdf`, `Report Subcontractors.pdf`, and `Report Ask My Accountant.pdf`.

## What "Same Level Or Better" Means

**P&L parity** — cash-basis professional P&L with parent/child accounts; section totals and formulas for Income, COGS, Gross Profit, Expenses, Net Operating Income, Other Income / Other Expenses, Net Income; company-specific account naming; stable grouping across repeated vendors and payment rails.

**Report parity** — source account quick reports (`Chase CK 8277`, `Chase CC 9286`), distribution account quick reports (`Subcontractors`, `Ask My Accountant`); transaction-level drilldown with QuickBooks-style columns (Date, Type, Name, Memo, Source / Split Account, Amount, Running Balance); PDF output for each report type; full export package, not just one-at-a-time downloads.

**Better than the sample** — human review for uncertain classifications; audit trail showing how each P&L line was built; transfer clustering and rule reuse; explicit "why" behind each classification; repeatable local test path using the Flo Marketing sample set.

## Current Stage

**Advanced MVP, not full product yet.** Draft-generation power roughly `85–90%`; accountant-grade trust and repeatability roughly `70–80%`. Best Flo annual parity to date: Income `+0.03%`, COGS `-0.32%`, Expenses `+0.86%`, Net Income `+0.90%` against the canonical accountant figures (snapshot in `data/flo-parity-run-legal.json`).

The mainline pipeline now extracts via Claude Sonnet 4.6 with prompt caching, verifies via a Claude second-pass classifier with stability and AMA-confidence guards, reconciles every statement against opening/closing balances, renders accountant-style P&L and quick-report PDFs, learns per-company personal-vs-business decisions, and notifies an n8n webhook on every P&L completion.

## Accountant-Ready Checklist

Gate list for calling the product accountant-ready rather than just a strong draft generator.

**Accuracy & stability**
- [ ] Full-year benchmark reruns stay consistently close, not just one lucky run
- [ ] Income, COGS, Expenses, Net Income stay within tolerance on repeated clean reruns
- [ ] High-dollar drift in `Legal & Professional Fees`, `Meals and Entertainment`, `Telephone Expense`, `Advertising and Promotion`, `Subcontractors` is closed or reduced to explicitly reviewed exceptions
- [ ] Refunds, reversals, returned items, transfer-like deposits no longer swing between Income / Other Income / Ignore by wording
- [ ] Similar memo families land in the same account on repeated runs without fresh correction

**Human review & audit**
- [ ] Material or unclear classifications pause for user confirmation
- [ ] Saved user decisions override model guesses
- [ ] Users can see why a transaction was classified (model / local rule / saved rule / manual)
- [ ] Final P&L shows what was excluded, reviewed, auto-applied
- [x] `Ask My Accountant` is a deliberate review workflow, not only a catch-all bucket

**Completeness & trust**
- [x] Missing-statement and partial-year coverage is impossible to miss
- [x] Strict review can block finalization when account coverage is likely incomplete
- [x] Source-account coverage, statement periods, balance continuity visible in final audit
- [x] Accountants can distinguish classification error from missing-file error

**Bookkeeping-system gates** (open)
- [ ] Jobs, transactions, rules, chart settings stored in shared persistence (not just machine-local files)
- [ ] Reports reproducible across sessions and reruns
- [ ] Manual adjustments / journal-style corrections supported
- [x] Reconciliation status exists for source accounts
- [ ] Period-close logic so finalized package behaves like bookkeeping output

**Delivery & workflow**
- [x] Exported P&L and quick reports look accountant-ready, not app-generated
- [ ] Full report packet export exists
- [ ] Accountants can drill from a P&L line into supporting transaction detail quickly
- [ ] Review flow is fast enough that the product saves real time vs creating cleanup work

## Shipped Phases (summary)

### Foundation (Phases 1–6, shipped earlier)

- **Phase 1: Ledger foundation** — reusable transaction ledger with per-tx decision source and reasoning, source-account labels, signed amounts.
- **Phase 2: First-gen quick reports** — distribution + source quick reports in the app, per-report PDF export.
- **Phase 3: Source-account fidelity** — statement-level metadata extraction (institution, account name/type/last4, period, opening/closing balance), source-account merging based on extracted identity, partial-year coverage warnings.
- **Phase 4: PDF parity (foundation)** — first-generation export pipeline, server-owned report rendering.
- **Phase 5: Classification stability & rules** — persistent chart of accounts + manager, saved review-rule store + manager, OpenAI second-pass verifier with internal evidence layer (company history, refund/NSF/bank-fee diagnostics, stability guard), strict review mode, per-company isolation, accountant inbox (notes, client-clarification packet, run-only vs save-for-company decision scope).
- **Phase 6: Persistence & reconciliation** — partial: reconciliation status exists (see Phase 7.1); shared DB, period close, manual journal entries still open.

### Phase 7: Report Quality (waves 1–5, all shipped)

- **7.1 Reconciliation** — per-statement opening/closing balance check, `statementReconciliations` and `reconciliationAlerts` in audit. Validated: all 12 statements in the test pack reconciled to the penny.
- **7.2 (partial) Closed-enum extraction schema** — `category` and `plSection` enum-constrained in the Claude tool schema, blocking free-string drift. Full dual-classification removal deferred (still need Schedule C category for the existing category_conflict signal).
- **7.3 Few-shot for high-drift buckets** — `VENDOR DISAMBIGUATION GUIDE` block in the cached system prompt covering Subcontractors, Advertising and Promotion, Telephone Expense, Meals and Entertainment, Legal & Professional Fees.
- **7.4 Verifier tuning** — `Meals and Entertainment` added to verifier priority list; `$250` amount floor dropped for priority-group clusters (any cluster in the four high-drift buckets is a verifier candidate regardless of amount). `MAX_OPENAI_VERIFIER_CLUSTERS=18` still bounds per-run cost.
- **7.5 (partial) Vendor canonicalization — Income side** — `canonicalizeIncomeAccount` collapses every income line into `Sales` with a payment-rail-derived account (Square Sales, Stripe Sales, Zelle Sales, PayPal Sales, Venmo Sales, Cash App Sales, generic Sales). Validated on the 12-statement test ledger: 21 sales subaccounts → 4, totals preserved exactly at $118,262.03.
- **7.6 Accountant-style PDF parity** — P&L and quick-report PDFs rewritten in plain Helvetica, no color fills, thin rules, indented hierarchy, parentheses for negatives, `Cash Basis <date>` footer. Quick reports match QuickBooks column layout.
- **7.7 (partial) Parity reporter** — `npm run parity` reads every `data/flo-parity-run*.json` snapshot, prints per-run drift against canonical Flo figures, optional `--groups` view for high-drift buckets. The best historical run (`flo-parity-run-legal.json`, +0.90% NI drift) is auto-marked.
- **7.8 Ask My Accountant lane** — verifier picks below `VERIFIER_AMA_FALLBACK_CONFIDENCE` (default `0.55`) auto-route to `expenses_ask_my_accountant`. Ignore-class decisions (transfers) exempt. New `askMyAccountantForcedClusterCount` stat.
- **7.9 Correctness fixes** — `OWNER (DRAW|DISTRIBUTION|PAYMENT)` regex tightened to drop over-broad `PAYMENT` match; exponential-backoff retry on extraction (Claude migration).

### Phase 8: Personal-Expense Detection (per-company)

Commingled business accounts carry heavy non-business activity (mortgage, personal credit cards, life insurance, family Zelles, lifestyle merchants, vacation purchases). Phase 8 detects candidate personal transactions and surfaces them as review questions; **decisions are per-company** so a mortgage payment can be personal for a consulting firm and business for a real-estate investor.

- **`detectPersonalCandidateCategory(tx)`** — nine pattern categories (`mortgage_servicer`, `consumer_credit_card`, `personal_auto_loan`, `life_insurance_individual`, `family_keyword_zelle`, `atm_cash_withdrawal`, `lifestyle_merchant`, `consumer_subscription`, `individual_zelle`). Validated on M.E.M. PRODUCTS CORP statements: 25/31 expected matches, 5 negative controls correctly skipped (revenue, fleet, utility, phone, contractor Zelle).
- **`buildPersonalCandidateReviewSignal`** — review question explicitly says "for this company"; three options: `exclude_owner_draw`, `keep_business_expense`, `ignore_transfer`. Dispatched between transfer/refund and category-conflict.
- **New classification target `ignore_owner_draw`** (Ignore > Owner Draws > Owner Draws / Personal). Verifier guidance explicitly forbids auto-classifying into this bucket — only user-review puts transactions here.
- **Per-company persistence** via new ruleType `personal_candidate_cluster`; bucket key is `(category, canonical counterparty)`. Same memo on a different company starts fresh.
- **Family-keyword Zelle canonicalization** — Hijo/Hija/Mama all collapse to `Family Member (<keyword>)` so they share one review bucket.
- **Parallel question cap** `MAX_PERSONAL_CANDIDATE_QUESTIONS=10` so first-run commingled accounts can surface their full personal cluster set without crowding the regular review queue.
- **Audit panel** — new `personalExpenseClusters` return key, four overview stats, new `logicSteps` entry when exclusions applied.
- **Webhook payload** — `notifyPnLWebhook` appends `personalClustersFlagged`, `personalExpensesExcluded`, `personalCandidatesPending`.

### Other surface

- **Webhook**: every terminal P&L completion fires a GET to `PNL_WEBHOOK_URL` (default n8n endpoint) with job context. Fire-and-forget, 5s timeout, never blocks job flow.
- **Tooling**: `npm run parity` for per-run drift table; `sonet_test/run_test.mjs` for full upload→review→render e2e drives.

## Open Work

**Highest leverage**
- **7.5 full vendor canonicalization (architectural)** — persistent per-company vendor table that grows with use, plus expense-side canonicalization. Needs DB-backed persistence; bigger than the Income-side patch already shipped.
- **7.7 parity replayer** — re-run today's classifier against historical raw extractions to validate quality changes quantitatively. Requires persisting raw transactions at extraction time (today's dumps are post-classified).
- **Shared persistence** — move company profiles, rules, chart from machine-local JSON to a shared store (DB + auth). Prerequisite for multi-user / cloud product.

**Quality polish**
- Per-company business-type field so personal-vs-business question wording adapts (real-estate vs service-business hint).
- UI surfacing of `personalExpenseClusters[].reasons` so users see why each cluster was flagged.
- Full report-packet PDF download (P&L + all supporting quick reports + audit in one file).
- Manual-adjustment / journal-entry workflow.
- Period-close logic so finalized runs behave like bookkeeping output, not reports.
- Drill-down navigation from P&L line → supporting transactions.
- Telephone Expense / Bank Charge service residual drift after the structural fixes settle.

**Coverage gaps that came up during testing but are constrained by source data**
- Telephone Expense drift on the FLO set is mostly caused by partial source coverage (only AT&T memos visible), not classifier error. Surfacing via the coverage warning is correct; nothing further to fix in the classifier.
- The credit-card source pack in the FLO sample covers Aug–Dec only; the audit now flags this explicitly.

## Test Pack

**Primary parity set** (FLO Marketing 2025 statements):
- [`example of reports/FLO Marketing/Chase CK AÑO 2025`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Chase%20CK%20AN%CC%83O%202025)
- [`example of reports/FLO Marketing/Chase CC`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Chase%20CC)

**Target comparison set** (what good looks like):
- [`example of reports/FLO Marketing/ProfitandLoss.pdf`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/ProfitandLoss.pdf)
- [`example of reports/FLO Marketing/Report Chase CK.pdf`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Report%20Chase%20CK.pdf)
- [`example of reports/FLO Marketing/Report CC Chase.pdf`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Report%20CC%20Chase.pdf)
- [`example of reports/FLO Marketing/Report Subcontractors.pdf`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Report%20Subcontractors.pdf)
- [`example of reports/FLO Marketing/Report Ask My Accountant.pdf`](/Users/arsenii/Desktop/tax%20agent/example%20of%20reports/FLO%20Marketing/Report%20Ask%20My%20Accountant.pdf)

**Commingled-account test set** (for Phase 8 validation): M.E.M. PRODUCTS CORP three Bank of America statements (Jan–Mar 2026). Target: Net Income within ~3% of the reference ChatGPT report's $23,627 after one round of `exclude_owner_draw + save_company_rule` answers.
