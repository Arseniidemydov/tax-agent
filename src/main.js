// ─── DOM References ─────────────────────────────────────────────────────────

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const fileItems = document.getElementById('file-items');
const uploadBtn = document.getElementById('upload-btn');
const uploadBtnLabel = document.getElementById('upload-btn-label');
const analysisModeInputs = document.querySelectorAll('input[name="analysis-mode"]');
const companySelect = document.getElementById('company-select');
const companyCreateForm = document.getElementById('company-create-form');
const companyNameInput = document.getElementById('company-name-input');
const professionalReviewSettings = document.getElementById('professional-review-settings');
const professionalReviewModeInputs = document.querySelectorAll('input[name="professional-review-mode"]');

const uploadSection = document.getElementById('upload-section');
const processingSection = document.getElementById('processing-section');
const resultsSection = document.getElementById('results-section');

const processingModePill = document.getElementById('processing-mode-pill');
const processingDesc = document.getElementById('processing-desc');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const processingLog = document.getElementById('processing-log');

const resultsModePill = document.getElementById('results-mode-pill');
const resultsTitle = document.getElementById('results-title');
const resultsSubtitle = document.getElementById('results-subtitle');
const reviewResultsView = document.getElementById('review-results-view');
const reviewSummaryNote = document.getElementById('review-summary-note');
const reviewQuestionsContainer = document.getElementById('review-questions');
const reviewSubmitBtn = document.getElementById('review-submit-btn');
const simpleResultsView = document.getElementById('simple-results-view');
const professionalResultsView = document.getElementById('professional-results-view');

const totalDepositsEl = document.getElementById('total-deposits');
const totalDeductionsEl = document.getElementById('total-deductions');
const totalNetEl = document.getElementById('total-net');
const totalCountEl = document.getElementById('total-count');

const depositsTable = document.querySelector('#deposits-table tbody');
const deductionsTable = document.querySelector('#deductions-table tbody');

const pnlTotalIncomeEl = document.getElementById('pnl-total-income');
const pnlGrossProfitEl = document.getElementById('pnl-gross-profit');
const pnlTotalExpensesEl = document.getElementById('pnl-total-expenses');
const pnlNetIncomeEl = document.getElementById('pnl-net-income');
const pnlTotalCogsEl = document.getElementById('pnl-total-cogs');
const pnlNetOperatingIncomeEl = document.getElementById('pnl-net-operating-income');
const pnlTotalOtherIncomeEl = document.getElementById('pnl-total-other-income');
const pnlTotalOtherExpensesEl = document.getElementById('pnl-total-other-expenses');
const pnlReviewNote = document.getElementById('pnl-review-note');
const pnlAuditStats = document.getElementById('pnl-audit-stats');
const pnlAuditSteps = document.getElementById('pnl-audit-steps');
const pnlAuditFormulas = document.getElementById('pnl-audit-formulas');
const pnlAuditCoverage = document.getElementById('pnl-audit-coverage');
const pnlAuditTransfers = document.getElementById('pnl-audit-transfers');
const pnlAuditReviewSection = document.getElementById('pnl-audit-review-section');
const pnlAuditReviewDecisions = document.getElementById('pnl-audit-review-decisions');
const quickReportSelect = document.getElementById('quick-report-select');
const quickReportDownloadBtn = document.getElementById('quick-report-download-btn');
const quickReportSummary = document.getElementById('quick-report-summary');
const quickReportTableBody = document.getElementById('quick-report-table-body');
const pnlTableBody = document.querySelector('#pnl-table tbody');
const settingsRefreshBtn = document.getElementById('settings-refresh-btn');
const settingsCompanyNote = document.getElementById('settings-company-note');
const settingsStatus = document.getElementById('settings-status');
const settingsChartCount = document.getElementById('settings-chart-count');
const settingsCustomChartCount = document.getElementById('settings-custom-chart-count');
const settingsRuleCount = document.getElementById('settings-rule-count');
const settingsDisabledRuleCount = document.getElementById('settings-disabled-rule-count');
const chartAccountForm = document.getElementById('chart-account-form');
const chartAccountSectionInput = document.getElementById('chart-account-section');
const chartAccountGroupInput = document.getElementById('chart-account-group');
const chartAccountNameInput = document.getElementById('chart-account-name');
const chartAccountGuidanceInput = document.getElementById('chart-account-guidance');
const chartAccountList = document.getElementById('chart-account-list');
const reviewRuleList = document.getElementById('review-rule-list');

const downloadBtn = document.getElementById('download-btn');
const resetBtn = document.getElementById('reset-btn');

// ─── State ──────────────────────────────────────────────────────────────────

let selectedFiles = [];
let reportData = null;
let selectedAnalysisMode = 'simple';
let selectedProfessionalReviewMode = 'strict';
let selectedCompanyId = '';
let companyProfiles = [];
let renderedFileCount = 0;
let currentJobId = null;
let statusPollInterval = null;
let reviewQuestions = [];
let reviewAnswers = {};
let professionalSettings = null;

const PROFESSIONAL_REVIEW_STANDARD = 'standard';
const PROFESSIONAL_REVIEW_STRICT = 'strict';
const COMPANY_STORAGE_KEY = 'tax-agent.active-company-id';

selectedCompanyId = loadStoredCompanyId();

const DOWNLOAD_ICON_SVG = `
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
`;

const MODE_COPY = {
  simple: {
    pill: 'Simple deposit/deduction',
    uploadButton: 'Process Simple Summary',
    processingDescription: 'AI is analyzing each PDF to extract and group deposits and deductions.',
    startText(fileCount) {
      return `Uploading ${fileCount} file(s) and starting the simple summary...`;
    },
    logText(fileCount) {
      return `Starting simple deposit/deduction analysis for ${fileCount} PDF file(s)...`;
    },
    resultsTitle: 'Simple Summary Ready',
    downloadLabel: 'Download Simple Summary PDF',
  },
  professional: {
    resultsTitle: 'Professional P&L Ready',
    downloadLabel: 'Download Professional P&L PDF',
  },
};

const PROFESSIONAL_REVIEW_COPY = {
  [PROFESSIONAL_REVIEW_STANDARD]: {
    pillSuffix: 'Standard review',
    uploadButton: 'Build Professional P&L',
    processingDescription: 'AI is extracting transactions, classifying them into the professional chart, and auto-applying only previously approved rules plus highly confident verifier remaps.',
    startText(fileCount) {
      return `Uploading ${fileCount} file(s) and building the professional P&L with standard review...`;
    },
    logText(fileCount) {
      return `Starting professional P&L analysis for ${fileCount} PDF file(s) with standard review...`;
    },
  },
  [PROFESSIONAL_REVIEW_STRICT]: {
    pillSuffix: 'Strict review',
    uploadButton: 'Review & Build Professional P&L',
    processingDescription: 'AI is extracting transactions and will stop for your approval on any material or unclear professional classification before finalizing the statement.',
    startText(fileCount) {
      return `Uploading ${fileCount} file(s) and starting strict professional review...`;
    },
    logText(fileCount) {
      return `Starting professional P&L analysis for ${fileCount} PDF file(s) with strict review...`;
    },
  },
};

// ─── File Helpers ───────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatSignedMoney(value) {
  const amount = Number(value) || 0;
  const absolute = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return amount < 0 ? `-$${absolute}` : `$${absolute}`;
}

function formatAuditValue(value, format = 'count') {
  if (format === 'currency') return formatMoney(value);
  return (Number(value) || 0).toLocaleString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function pdfIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}

function normalizeProfessionalReviewMode(value) {
  return value === PROFESSIONAL_REVIEW_STRICT
    ? PROFESSIONAL_REVIEW_STRICT
    : PROFESSIONAL_REVIEW_STANDARD;
}

function getModeCopy(mode = selectedAnalysisMode, professionalReviewMode = selectedProfessionalReviewMode) {
  if (mode !== 'professional') {
    return MODE_COPY.simple;
  }

  const reviewMode = normalizeProfessionalReviewMode(professionalReviewMode);
  const reviewCopy = PROFESSIONAL_REVIEW_COPY[reviewMode];

  return {
    ...MODE_COPY.professional,
    pill: `Professional P&L · ${reviewCopy.pillSuffix}`,
    uploadButton: reviewCopy.uploadButton,
    processingDescription: reviewCopy.processingDescription,
    startText: reviewCopy.startText,
    logText: reviewCopy.logText,
  };
}

function currentReportMode() {
  return (reportData && reportData.mode) || selectedAnalysisMode;
}

function slugifyFilenameSegment(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'report';
}

function buildQuickReportFilename(report) {
  const prefix = report?.kind === 'source' ? 'source-account-report' : 'distribution-account-report';
  return `${prefix}-${slugifyFilenameSegment(report?.title || 'quick-report')}.pdf`;
}

function buildChartAccountLabel(account) {
  if (!account) return '';
  return [account.section, account.group, account.account].filter(Boolean).join(' / ');
}

function formatRuleQuestionType(value) {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Review Rule';
}

function loadStoredCompanyId() {
  try {
    return localStorage.getItem(COMPANY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function saveStoredCompanyId(companyId) {
  try {
    if (companyId) {
      localStorage.setItem(COMPANY_STORAGE_KEY, companyId);
    } else {
      localStorage.removeItem(COMPANY_STORAGE_KEY);
    }
  } catch {
    // Ignore localStorage failures.
  }
}

function withCompanyQuery(path) {
  if (!selectedCompanyId) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}companyId=${encodeURIComponent(selectedCompanyId)}`;
}

function getSelectedCompanyProfile() {
  return companyProfiles.find((company) => company.id === selectedCompanyId) || companyProfiles[0] || null;
}

function syncCompanySelect() {
  companySelect.innerHTML = companyProfiles.map((company) => `
    <option value="${escapeHtml(company.id)}">${escapeHtml(company.name)}</option>
  `).join('');

  companySelect.disabled = companyProfiles.length === 0;
  if (companyProfiles.length > 0) {
    companySelect.value = companyProfiles.some((company) => company.id === selectedCompanyId)
      ? selectedCompanyId
      : companyProfiles[0].id;
    selectedCompanyId = companySelect.value || '';
  } else {
    selectedCompanyId = '';
  }
}

function updateSettingsCompanyNote(settings = professionalSettings) {
  const companyName = settings?.company?.name
    || getSelectedCompanyProfile()?.name
    || 'No company selected';
  settingsCompanyNote.textContent = `Active company: ${companyName}`;
}

async function loadCompanies({ preferredCompanyId = selectedCompanyId, silent = false } = {}) {
  try {
    const response = await fetch(withCompanyQuery('/api/companies'));
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load company profiles');
    }

    companyProfiles = Array.isArray(payload.companies) ? payload.companies : [];
    const resolvedCompanyId = payload.selectedCompanyId || preferredCompanyId || payload.defaultCompanyId || companyProfiles[0]?.id || '';
    selectedCompanyId = resolvedCompanyId;
    saveStoredCompanyId(selectedCompanyId);
    syncCompanySelect();
    updateSettingsCompanyNote();

    if (!silent) {
      setSettingsStatus(`Loaded ${companyProfiles.length.toLocaleString()} company profile(s).`, 'success');
    }
  } catch (err) {
    if (!silent) {
      setSettingsStatus(`Could not load company profiles: ${err.message}`, 'error');
    } else {
      console.error(err);
    }
  }
}

function stopStatusPolling() {
  if (statusPollInterval) {
    clearInterval(statusPollInterval);
    statusPollInterval = null;
  }
}

function hideAllResultViews() {
  reviewResultsView.style.display = 'none';
  simpleResultsView.style.display = 'none';
  professionalResultsView.style.display = 'none';
}

function setDownloadButtonVisible(isVisible) {
  downloadBtn.style.display = isVisible ? 'inline-flex' : 'none';
}

function resetReviewState() {
  reviewQuestions = [];
  reviewAnswers = {};
  reviewQuestionsContainer.innerHTML = '';
  reviewSummaryNote.textContent = 'We found a few transactions that need your input before we finalize the professional P&L.';
  reviewSubmitBtn.disabled = true;
  reviewSubmitBtn.innerHTML = '<span>Apply Answers &amp; Build P&amp;L</span>';
}

function setQuickReportDownloadButtonIdle(report = null) {
  const label = report?.kind === 'source'
    ? 'Download Source Report PDF'
    : report?.kind === 'distribution'
      ? 'Download Distribution Report PDF'
      : 'Download Quick Report PDF';

  quickReportDownloadBtn.disabled = !report;
  quickReportDownloadBtn.innerHTML = `${DOWNLOAD_ICON_SVG}<span>${label}</span>`;
}

function setQuickReportDownloadButtonLoading() {
  quickReportDownloadBtn.disabled = true;
  quickReportDownloadBtn.innerHTML = '<div class="spinner"></div><span>Generating Quick Report PDF...</span>';
}

// ─── Mode Presentation ──────────────────────────────────────────────────────

function syncAnalysisModeUi() {
  const copy = getModeCopy(selectedAnalysisMode, selectedProfessionalReviewMode);
  uploadBtnLabel.textContent = copy.uploadButton;
  processingModePill.textContent = copy.pill;
  processingDesc.textContent = copy.processingDescription;
  professionalReviewSettings.hidden = selectedAnalysisMode !== 'professional';

  if (!reportData) {
    resultsModePill.textContent = copy.pill;
    resultsTitle.textContent = copy.resultsTitle;
    resultsSubtitle.textContent = copy.processingDescription;
  }

  setDownloadButtonIdle(currentReportMode());
}

function buildResultsSubtitle(data) {
  const companyText = data.companyName ? ` Company: ${data.companyName}.` : '';
  const periodText = data.periodLabel ? ` Period: ${data.periodLabel}.` : '';
  const reviewText = data.reviewSummary?.resolvedQuestions
    ? ` Resolved ${data.reviewSummary.resolvedQuestions.toLocaleString()} review question(s) before finalizing this statement.`
    : '';
  const warningText = data.warning ? ` Warning: ${data.warning}` : '';

  if (data.mode === 'professional') {
    const reviewMode = normalizeProfessionalReviewMode(data.reviewMode);
    const strictReview = reviewMode === PROFESSIONAL_REVIEW_STRICT;
    const verifierText = data.verifierSummary?.evaluatedClusterCount
      ? strictReview
        ? ` OpenAI reviewed ${data.verifierSummary.evaluatedClusterCount.toLocaleString()} high-impact or material cluster(s) and held ${data.verifierSummary.reviewSuggestedClusterCount.toLocaleString()} for confirmation under strict review.`
        : ` OpenAI reviewed ${data.verifierSummary.evaluatedClusterCount.toLocaleString()} high-impact cluster(s) and auto-applied ${data.verifierSummary.autoAppliedClusterCount.toLocaleString()} confident mapping(s).`
      : '';
    const reviewModeText = strictReview
      ? ' Strict review was enabled, so the P&L paused for any material or unclear cluster instead of silently finalizing it.'
      : ' Standard review was enabled, so saved rules and confident verifier remaps could auto-apply before finalization.';
    const excludedText = data.excludedCount
      ? ` ${data.excludedCount.toLocaleString()} transaction(s) were excluded from the final professional statement.`
      : ' All extracted transactions were included in the professional statement.';
    return `Cash-basis professional statement built from ${data.transactionCount.toLocaleString()} extracted transaction(s) using Gemini extraction, local classification rules, and optional OpenAI cluster verification.${companyText}${periodText}${reviewModeText}${excludedText}${verifierText}${reviewText}${warningText}`;
  }

  return `Grouped deposits and deductions by description from ${data.transactionCount.toLocaleString()} extracted transaction(s).${companyText}${periodText}${warningText}`;
}

function setDownloadButtonIdle(mode = currentReportMode(), professionalReviewMode = reportData?.reviewMode || selectedProfessionalReviewMode) {
  const copy = getModeCopy(mode, professionalReviewMode);
  downloadBtn.disabled = false;
  downloadBtn.innerHTML = `${DOWNLOAD_ICON_SVG}<span id="download-btn-label">${copy.downloadLabel}</span>`;
}

function setDownloadButtonLoading() {
  downloadBtn.disabled = true;
  downloadBtn.innerHTML = '<div class="spinner"></div><span>Generating PDF...</span>';
}

analysisModeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    selectedAnalysisMode = input.value === 'professional' ? 'professional' : 'simple';
    syncAnalysisModeUi();
  });
});

professionalReviewModeInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    selectedProfessionalReviewMode = normalizeProfessionalReviewMode(input.value);
    syncAnalysisModeUi();
  });
});

// ─── Render File List ───────────────────────────────────────────────────────

function renderFileList() {
  if (selectedFiles.length === 0) {
    fileList.style.display = 'none';
    uploadBtn.disabled = true;
    return;
  }

  fileList.style.display = 'block';
  uploadBtn.disabled = false;
  fileItems.innerHTML = '';

  selectedFiles.forEach((file, idx) => {
    const li = document.createElement('li');
    li.className = 'file-item';
    li.innerHTML = `
      <span class="file-item-name">${pdfIcon()} ${escapeHtml(file.name)}</span>
      <span class="file-item-size">${formatSize(file.size)}</span>
      <button class="file-item-remove" data-idx="${idx}" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    fileItems.appendChild(li);
  });

  fileItems.querySelectorAll('.file-item-remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.idx, 10);
      selectedFiles.splice(idx, 1);
      renderFileList();
    });
  });
}

// ─── Drag & Drop ────────────────────────────────────────────────────────────

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter((file) => file.type === 'application/pdf');
  addFiles(files);
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  addFiles(files);
  fileInput.value = '';
});

function addFiles(files) {
  for (const file of files) {
    if (!selectedFiles.find((existingFile) => existingFile.name === file.name)) {
      selectedFiles.push(file);
    }
  }
  renderFileList();
}

// ─── Review Flow ────────────────────────────────────────────────────────────

function updateReviewSubmitButton() {
  const answeredCount = reviewQuestions.filter((question) => reviewAnswers[question.id]).length;
  const allAnswered = reviewQuestions.length > 0 && answeredCount === reviewQuestions.length;

  reviewSubmitBtn.disabled = !allAnswered;
  reviewSubmitBtn.innerHTML = `<span>${allAnswered ? `Apply ${answeredCount} Answer${answeredCount === 1 ? '' : 's'} & Build P&L` : `Answer ${reviewQuestions.length} Question${reviewQuestions.length === 1 ? '' : 's'} to Continue`}</span>`;
}

function renderReviewQuestions(questions) {
  reviewQuestionsContainer.innerHTML = '';

  questions.forEach((question, questionIndex) => {
    const card = document.createElement('div');
    card.className = 'review-question-card';

    const sourceFiles = Array.isArray(question.sourceFiles) && question.sourceFiles.length > 0
      ? `<div class="review-meta-chip">Source: ${escapeHtml(question.sourceFiles.join(', '))}</div>`
      : '';
    const clusterLabel = question.clusterLabel && question.clusterLabel !== question.sampleDescriptions?.[0]
      ? `<div class="review-meta-chip">Cluster: ${escapeHtml(question.clusterLabel)}</div>`
      : '';
    const suggestedClassification = question.suggestedClassification
      ? `<div class="review-meta-chip">Suggested: ${escapeHtml(question.suggestedClassification)}</div>`
      : '';
    const verifierConfidence = Number.isFinite(question.verifierConfidence)
      ? `<div class="review-meta-chip">Verifier confidence: ${escapeHtml(`${Math.round(question.verifierConfidence * 100)}%`)}</div>`
      : '';

    const sampleText = Array.isArray(question.sampleDescriptions) && question.sampleDescriptions.length > 0
      ? `Examples: ${escapeHtml(question.sampleDescriptions.join(' | '))}`
      : '';
    const currentClassificationLabel = question.type === 'coverage_review' ? 'Current status' : 'Current guess';

    const optionsHtml = question.options.map((option) => `
      <label class="review-option">
        <input type="radio" name="${escapeHtml(question.id)}" value="${escapeHtml(option.key)}" ${reviewAnswers[question.id] === option.key ? 'checked' : ''} />
        <span class="review-option-card">
          <span class="review-option-label">${escapeHtml(option.label)}${option.recommended ? ' <span class="review-option-badge">Recommended</span>' : ''}</span>
          <span class="review-option-description">${escapeHtml(option.description)}</span>
        </span>
      </label>
    `).join('');

    card.innerHTML = `
      <div class="review-question-topline">
        <span class="review-question-count">Question ${questionIndex + 1} of ${questions.length}</span>
        <span class="review-question-total">${formatMoney(question.totalAmount)} impacted</span>
      </div>
      <h3 class="review-question-title">${escapeHtml(question.title)}</h3>
      <p class="review-question-copy">${escapeHtml(question.prompt)}</p>
      <div class="review-question-meta">
        <div class="review-meta-chip">${escapeHtml(question.transactionCount.toLocaleString())} transaction(s)</div>
        <div class="review-meta-chip">${escapeHtml(currentClassificationLabel)}: ${escapeHtml(question.currentClassification)}</div>
        ${suggestedClassification}
        ${verifierConfidence}
        <div class="review-meta-chip">${escapeHtml(question.reason)}</div>
        ${clusterLabel}
        ${sourceFiles}
      </div>
      ${sampleText ? `<div class="review-samples">${sampleText}</div>` : ''}
      <div class="review-options">${optionsHtml}</div>
    `;

    card.querySelectorAll(`input[name="${CSS.escape(question.id)}"]`).forEach((input) => {
      input.addEventListener('change', () => {
        reviewAnswers[question.id] = input.value;
        updateReviewSubmitButton();
      });
    });

    reviewQuestionsContainer.appendChild(card);
  });

  updateReviewSubmitButton();
}

function showReview(job) {
  hideAllResultViews();
  reviewResultsView.style.display = 'block';
  setDownloadButtonVisible(false);
  reportData = null;

  resultsSection.style.display = 'block';
  processingSection.style.display = 'none';

  resultsModePill.textContent = getModeCopy('professional', job.reviewMode).pill;
  resultsTitle.textContent = 'Questions Before Final P&L';
  const reviewCompanyText = job.companyName ? ` Active company: ${job.companyName}.` : '';
  resultsSubtitle.textContent = `${job.review?.summary || 'We need a few answers before we can finalize the professional statement.'}${reviewCompanyText}`;

  const summaryParts = [job.review?.summary || 'We found a few transactions that need your input before we finalize the professional P&L.'];
  if (job.review?.warning) summaryParts.push(job.review.warning);
  reviewSummaryNote.textContent = summaryParts.join(' ');

  reviewQuestions = Array.isArray(job.review?.questions) ? job.review.questions : [];
  reviewAnswers = {};
  renderReviewQuestions(reviewQuestions);
}

async function submitReviewAnswers() {
  if (!currentJobId || reviewQuestions.length === 0) return;

  const unansweredQuestion = reviewQuestions.find((question) => !reviewAnswers[question.id]);
  if (unansweredQuestion) {
    reviewSummaryNote.textContent = `Please answer every question before finalizing the Professional P&L. Still missing: "${unansweredQuestion.title}".`;
    return;
  }

  reviewSubmitBtn.disabled = true;
  reviewSubmitBtn.innerHTML = '<div class="spinner"></div><span>Building Final P&amp;L...</span>';

  try {
    const response = await fetch(`/api/review/${currentJobId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers: reviewQuestions.map((question) => ({
          questionId: question.id,
          optionKey: reviewAnswers[question.id],
        })),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to apply review answers');
    }

    if (payload.status === 'completed' || payload.status === 'completed_with_errors') {
      reportData = payload.data;
      showResults(payload.data);
      return;
    }

    if (payload.status === 'awaiting_review') {
      showReview(payload);
      return;
    }

    throw new Error(payload.error || 'Unexpected review response from server');
  } catch (err) {
    reviewSummaryNote.textContent = `Could not apply your answers: ${err.message}`;
    updateReviewSubmitButton();
  }
}

reviewSubmitBtn.addEventListener('click', submitReviewAnswers);

settingsRefreshBtn.addEventListener('click', async () => {
  await loadCompanies({ preferredCompanyId: selectedCompanyId, silent: true });
  await loadProfessionalSettings();
});

companySelect.addEventListener('change', async () => {
  selectedCompanyId = companySelect.value || '';
  saveStoredCompanyId(selectedCompanyId);
  updateSettingsCompanyNote();
  await loadProfessionalSettings();
});

companyCreateForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const name = companyNameInput.value.trim();
  if (!name) {
    setSettingsStatus('Enter a company name before creating a new profile.', 'error');
    companyNameInput.focus();
    return;
  }

  setSettingsStatus('Creating company profile...', 'info');

  try {
    const response = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to create company profile');
    }

    const createdCompanyId = payload.company?.id || payload.selectedCompanyId || '';
    companyNameInput.value = '';
    await loadCompanies({ preferredCompanyId: createdCompanyId, silent: true });
    await loadProfessionalSettings({ silent: true });
    setSettingsStatus(`Created company profile "${payload.company?.name || name}".`, 'success');
  } catch (err) {
    setSettingsStatus(`Could not create company profile: ${err.message}`, 'error');
  }
});

chartAccountForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await updateProfessionalSettingsRequest('/api/professional-settings/chart-accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        section: chartAccountSectionInput.value,
        group: chartAccountGroupInput.value,
        account: chartAccountNameInput.value,
        guidance: chartAccountGuidanceInput.value,
      }),
    }, 'Custom chart account saved.');

    chartAccountForm.reset();
    chartAccountSectionInput.value = 'Expenses';
  } catch (err) {
    setSettingsStatus(`Could not save chart account: ${err.message}`, 'error');
  }
});

chartAccountList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const { action, id, enabled } = button.dataset;
  if (!id) return;

  try {
    if (action === 'toggle-chart') {
      await updateProfessionalSettingsRequest(`/api/professional-settings/chart-accounts/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled !== 'true' }),
      }, 'Chart account status updated.');
      return;
    }

    if (action === 'delete-chart') {
      await updateProfessionalSettingsRequest(`/api/professional-settings/chart-accounts/${id}`, {
        method: 'DELETE',
      }, 'Custom chart account deleted.');
    }
  } catch (err) {
    setSettingsStatus(`Could not update chart account: ${err.message}`, 'error');
  }
});

reviewRuleList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const { action, id, enabled } = button.dataset;
  if (!id) return;

  try {
    if (action === 'save-rule') {
      const select = reviewRuleList.querySelector(`.rule-manager-select[data-rule-id="${CSS.escape(id)}"]`);
      const classificationId = select?.value || '';
      if (!classificationId) {
        throw new Error('Choose a chart account first');
      }

      await updateProfessionalSettingsRequest(`/api/professional-settings/review-rules/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classificationId }),
      }, 'Saved review rule remapped.');
      return;
    }

    if (action === 'toggle-rule') {
      await updateProfessionalSettingsRequest(`/api/professional-settings/review-rules/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled !== 'true' }),
      }, 'Saved review rule status updated.');
      return;
    }

    if (action === 'delete-rule') {
      await updateProfessionalSettingsRequest(`/api/professional-settings/review-rules/${id}`, {
        method: 'DELETE',
      }, 'Saved review rule deleted.');
    }
  } catch (err) {
    setSettingsStatus(`Could not update saved review rule: ${err.message}`, 'error');
  }
});

// ─── Upload & Process ───────────────────────────────────────────────────────

function startStatusPolling(jobId) {
  stopStatusPolling();

  statusPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/status/${jobId}`);
      if (!res.ok) throw new Error('Failed to get status');

      const job = await res.json();
      const jobMode = job.analysisMode === 'professional' ? 'professional' : selectedAnalysisMode;
      const jobReviewMode = normalizeProfessionalReviewMode(job.reviewMode || selectedProfessionalReviewMode);
      const jobCopy = getModeCopy(jobMode, jobReviewMode);

      progressBar.style.width = `${job.progress}%`;
      progressText.textContent = job.status === 'awaiting_review'
        ? jobReviewMode === PROFESSIONAL_REVIEW_STRICT
          ? 'Strict review needed before finalizing the Professional P&L'
          : 'Review needed before finalizing the Professional P&L'
        : job.progress >= 100
          ? 'Analysis complete!'
          : `Processing file ${job.currentFile} of ${job.totalFiles}...`;
      processingModePill.textContent = jobCopy.pill;

      if (Array.isArray(job.filesProcessed) && job.filesProcessed.length > renderedFileCount) {
        const newFiles = job.filesProcessed.slice(renderedFileCount);
        newFiles.forEach((fileResult) => {
          if (fileResult.status === 'success') {
            addLogEntry('success', `${fileResult.filename} — ${fileResult.transactionCount} transactions extracted`);
          } else {
            addLogEntry('error', `${fileResult.filename} — ${fileResult.error}`);
          }
        });
        renderedFileCount = job.filesProcessed.length;
      }

      if (job.status === 'awaiting_review') {
        stopStatusPolling();
        addLogEntry('processing', `Review required: ${job.review?.totalQuestions || 0} clarification question(s) before we finalize the Professional P&L.`);
        showReview(job);
        return;
      }

      if (job.status === 'completed' || job.status === 'completed_with_errors') {
        stopStatusPolling();
        addLogEntry('success', `Total: ${job.data.transactionCount.toLocaleString()} transactions across all statements`);

        if (job.status === 'completed_with_errors' && job.error) {
          addLogEntry('error', job.error);
        }

        if (job.data.mode === 'professional') {
          addLogEntry(
            'success',
            `Professional P&L: ${job.data.includedTransactionCount.toLocaleString()} included, ${job.data.excludedCount.toLocaleString()} excluded from the statement`,
          );
        }

        reportData = job.data;
        setTimeout(() => showResults(job.data), 800);
        return;
      }

      if (job.status === 'error') {
        stopStatusPolling();
        throw new Error(job.error || 'Processing failed');
      }
    } catch (err) {
      stopStatusPolling();
      handleUploadError(err);
    }
  }, 2000);
}

uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  const modeCopy = getModeCopy(selectedAnalysisMode, selectedProfessionalReviewMode);

  currentJobId = null;
  reportData = null;
  resetReviewState();
  hideAllResultViews();

  uploadSection.style.display = 'none';
  processingSection.style.display = 'block';
  resultsSection.style.display = 'none';

  progressBar.style.width = '0%';
  progressBar.style.background = 'var(--gradient-primary)';
  progressText.textContent = modeCopy.startText(selectedFiles.length);
  processingModePill.textContent = modeCopy.pill;
  processingDesc.textContent = modeCopy.processingDescription;
  processingLog.innerHTML = '';
  renderedFileCount = 0;

  addLogEntry('processing', modeCopy.logText(selectedFiles.length));

  const formData = new FormData();
  selectedFiles.forEach((file) => formData.append('statements', file));
  formData.append('analysisMode', selectedAnalysisMode);
  if (selectedCompanyId) {
    formData.append('companyId', selectedCompanyId);
  }
  if (selectedAnalysisMode === 'professional') {
    formData.append('professionalReviewMode', normalizeProfessionalReviewMode(selectedProfessionalReviewMode));
  }

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Server error');
    }

    const payload = await response.json();
    const { jobId, companyName } = payload;
    currentJobId = jobId;
    addLogEntry('success', `Upload accepted. Job ID: ${jobId}${companyName ? ` for ${companyName}` : ''}`);
    startStatusPolling(jobId);
  } catch (err) {
    handleUploadError(err);
  }
});

function handleUploadError(err) {
  stopStatusPolling();
  progressBar.style.width = '100%';
  progressBar.style.background = 'linear-gradient(135deg, #f87171, #fb923c)';
  progressText.textContent = 'Processing failed';
  addLogEntry('error', `Error: ${err.message}`);
}

function addLogEntry(type, message) {
  const div = document.createElement('div');
  div.className = `log-entry ${type}`;
  const icons = {
    processing: '⏳',
    success: '✅',
    error: '❌',
  };
  div.textContent = `${icons[type] || ''} ${message}`;
  processingLog.appendChild(div);
  processingLog.scrollTop = processingLog.scrollHeight;
}

// ─── Results Rendering ──────────────────────────────────────────────────────

function showResults(data) {
  processingSection.style.display = 'none';
  resultsSection.style.display = 'block';

  hideAllResultViews();
  setDownloadButtonVisible(true);

  const mode = data.mode === 'professional' ? 'professional' : 'simple';
  const modeCopy = getModeCopy(mode, data.reviewMode);

  resultsModePill.textContent = modeCopy.pill;
  resultsTitle.textContent = modeCopy.resultsTitle;
  resultsSubtitle.textContent = buildResultsSubtitle(data);

  if (mode === 'professional') {
    professionalResultsView.style.display = 'block';
    showProfessionalResults(data);
  } else {
    simpleResultsView.style.display = 'block';
    showSimpleResults(data);
  }

  setDownloadButtonIdle(mode, data.reviewMode);

  resultsSection.style.animation = 'none';
  void resultsSection.offsetHeight;
  resultsSection.style.animation = 'fadeInUp 0.6s ease-out';
}

function showSimpleResults(data) {
  totalDepositsEl.textContent = formatMoney(data.totalDeposits);
  totalDeductionsEl.textContent = formatMoney(data.totalDeductions);
  totalNetEl.textContent = formatMoney(data.net);
  totalCountEl.textContent = (data.transactionCount || 0).toLocaleString();

  renderSimpleTable(depositsTable, data.deposits || [], data.totalDeposits || 0);
  renderSimpleTable(deductionsTable, data.deductions || [], data.totalDeductions || 0);
}

function renderSimpleTable(target, items, total) {
  target.innerHTML = '';

  items.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><span class="category-badge" style="font-size: 0.8rem; background: rgba(255, 255, 255, 0.05); padding: 2px 6px; border-radius: 4px; color: var(--text-secondary);">${escapeHtml(item.category || 'Other')}</span></td>
      <td>${escapeHtml(item.description)}</td>
      <td>${item.count}</td>
      <td>${formatMoney(item.total)}</td>
    `;
    target.appendChild(tr);
  });

  const totalRow = document.createElement('tr');
  totalRow.className = 'total-row';
  totalRow.innerHTML = `
    <td></td>
    <td></td>
    <td>TOTAL</td>
    <td>${items.reduce((sum, item) => sum + (item.count || 0), 0)}</td>
    <td>${formatMoney(total)}</td>
  `;
  target.appendChild(totalRow);
}

function renderProfessionalAudit(audit = {}) {
  const overviewStats = Array.isArray(audit.overviewStats) ? audit.overviewStats : [];
  const logicSteps = Array.isArray(audit.logicSteps) ? audit.logicSteps : [];
  const formulaBreakdown = Array.isArray(audit.formulaBreakdown) ? audit.formulaBreakdown : [];
  const coverageAlerts = Array.isArray(audit.coverageAlerts) ? audit.coverageAlerts : [];
  const transferClusters = Array.isArray(audit.transferClusters) ? audit.transferClusters : [];
  const reviewDecisions = Array.isArray(audit.reviewDecisions) ? audit.reviewDecisions : [];

  pnlAuditStats.innerHTML = overviewStats.length > 0
    ? overviewStats.map((item) => `
      <div class="audit-stat-card">
        <div class="audit-stat-label">${escapeHtml(item.label)}</div>
        <div class="audit-stat-value">${escapeHtml(formatAuditValue(item.value, item.format))}</div>
      </div>
    `).join('')
    : '<div class="audit-empty">No professional audit stats were generated for this statement.</div>';

  pnlAuditSteps.innerHTML = logicSteps.length > 0
    ? logicSteps.map((step) => `<div class="audit-step-item">${escapeHtml(step)}</div>`).join('')
    : '<div class="audit-empty">No logic steps were generated for this statement.</div>';

  pnlAuditFormulas.innerHTML = formulaBreakdown.length > 0
    ? formulaBreakdown.map((item) => `
      <div class="audit-formula-item">
        <div class="audit-formula-topline">
          <div class="audit-formula-label">${escapeHtml(item.label)}</div>
          <div class="audit-formula-value">${escapeHtml(formatAuditValue(item.value, item.format))}</div>
        </div>
        <div class="audit-formula-copy">${escapeHtml(item.formula)}</div>
      </div>
    `).join('')
    : '<div class="audit-empty">No formula breakdown was generated for this statement.</div>';

  pnlAuditCoverage.innerHTML = coverageAlerts.length > 0
    ? coverageAlerts.map((alert) => {
      const severity = ['warning', 'notice', 'info'].includes(alert.severity) ? alert.severity : 'info';
      const chips = Array.isArray(alert.chips) ? alert.chips.filter(Boolean) : [];

      return `
        <div class="audit-coverage-card">
          <div class="audit-coverage-topline">
            <div class="audit-coverage-title">${escapeHtml(alert.title || 'Coverage signal')}</div>
            <div class="audit-coverage-badge audit-coverage-badge-${escapeHtml(severity)}">${escapeHtml(alert.badge || severity)}</div>
          </div>
          ${chips.length > 0 ? `
            <div class="audit-coverage-meta">
              ${chips.map((chip) => `<div class="review-meta-chip">${escapeHtml(chip)}</div>`).join('')}
            </div>
          ` : ''}
          <div class="audit-coverage-summary">${escapeHtml(alert.summary || '')}</div>
          ${alert.detail ? `<div class="audit-coverage-detail">${escapeHtml(alert.detail)}</div>` : ''}
        </div>
      `;
    }).join('')
    : '<div class="audit-empty">No obvious statement-period gaps were detected from the extracted statement metadata for this professional run.</div>';

  pnlAuditTransfers.innerHTML = transferClusters.length > 0
    ? transferClusters.map((cluster) => `
      <div class="audit-cluster-card">
        <div class="audit-cluster-topline">
          <div class="audit-cluster-label">${escapeHtml(cluster.label)}</div>
          <div class="audit-cluster-resolution">${escapeHtml(cluster.resolution)}</div>
        </div>
        <div class="audit-cluster-meta">
          <div class="review-meta-chip">${escapeHtml((cluster.count || 0).toLocaleString())} transaction(s)</div>
          <div class="review-meta-chip">${escapeHtml(formatMoney(cluster.totalAmount || 0))} impacted</div>
        </div>
        <div class="audit-cluster-copy">Examples: ${escapeHtml((cluster.sampleDescriptions || []).join(' | '))}</div>
      </div>
    `).join('')
    : '<div class="audit-empty">No transfer-like clusters were detected in this professional run.</div>';

  if (reviewDecisions.length > 0) {
    pnlAuditReviewSection.style.display = 'block';
    pnlAuditReviewDecisions.innerHTML = reviewDecisions.map((decision) => `
      <div class="audit-decision-card">
        <div class="audit-decision-topline">
          <div class="audit-decision-title">${escapeHtml(decision.questionTitle)}</div>
          <div class="audit-decision-answer">${escapeHtml(decision.answerLabel)}</div>
        </div>
      </div>
    `).join('');
  } else {
    pnlAuditReviewSection.style.display = 'none';
    pnlAuditReviewDecisions.innerHTML = '';
  }
}

function setSettingsStatus(message, tone = 'info') {
  settingsStatus.textContent = message;
  settingsStatus.className = `settings-status settings-status-${tone}`;
}

function renderChartAccounts(chartAccounts = []) {
  if (!Array.isArray(chartAccounts) || chartAccounts.length === 0) {
    chartAccountList.innerHTML = '<div class="audit-empty">No chart accounts are configured yet.</div>';
    return;
  }

  const grouped = chartAccounts.reduce((acc, entry) => {
    const section = entry.section || 'Unassigned';
    if (!acc.has(section)) acc.set(section, []);
    acc.get(section).push(entry);
    return acc;
  }, new Map());

  chartAccountList.innerHTML = Array.from(grouped.entries()).map(([section, entries]) => `
    <div class="settings-group">
      <div class="settings-group-title">${escapeHtml(section)}</div>
      <div class="settings-group-list">
        ${entries.map((entry) => `
          <div class="settings-item">
            <div class="settings-item-main">
              <div class="settings-item-title">${escapeHtml(entry.group)}${entry.account !== entry.group ? ` <span class="settings-item-subtitle">/ ${escapeHtml(entry.account)}</span>` : ''}</div>
              <div class="settings-item-meta">
                <div class="review-meta-chip">${entry.enabled ? 'Enabled' : 'Disabled'}</div>
                <div class="review-meta-chip">${entry.builtIn ? 'Built-in' : 'Custom'}</div>
              </div>
              ${entry.guidance ? `<div class="settings-item-copy">${escapeHtml(entry.guidance)}</div>` : '<div class="settings-item-copy settings-item-copy-muted">No verifier guidance added yet.</div>'}
            </div>
            <div class="settings-item-actions">
              <button class="btn btn-secondary btn-inline settings-action-btn" type="button" data-action="toggle-chart" data-id="${escapeHtml(entry.id)}" data-enabled="${entry.enabled ? 'true' : 'false'}">
                <span>${entry.enabled ? 'Disable' : 'Enable'}</span>
              </button>
              ${entry.builtIn ? '' : `
                <button class="btn btn-secondary btn-inline settings-action-btn settings-action-danger" type="button" data-action="delete-chart" data-id="${escapeHtml(entry.id)}">
                  <span>Delete</span>
                </button>
              `}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function renderReviewRules(reviewRules = [], chartAccounts = []) {
  if (!Array.isArray(reviewRules) || reviewRules.length === 0) {
    reviewRuleList.innerHTML = '<div class="audit-empty">No saved review rules yet. Once you answer professional review questions, they will show up here.</div>';
    return;
  }

  const chartOptions = chartAccounts.map((entry) => `
    <option value="${escapeHtml(entry.id)}">${escapeHtml(buildChartAccountLabel(entry))}${entry.enabled ? '' : ' (disabled)'}</option>
  `).join('');

  reviewRuleList.innerHTML = reviewRules.map((rule) => `
    <div class="settings-item settings-item-rule" data-rule-id="${escapeHtml(rule.id)}">
      <div class="settings-item-main">
        <div class="settings-item-title">${escapeHtml(rule.bucketLabel || rule.id)}</div>
        <div class="settings-item-meta">
          <div class="review-meta-chip">${escapeHtml(formatRuleQuestionType(rule.questionType))}</div>
          <div class="review-meta-chip">${escapeHtml(rule.transactionType || 'unknown')}</div>
          <div class="review-meta-chip">${escapeHtml(`${rule.timesConfirmed || 1}x confirmed`)}</div>
          <div class="review-meta-chip">${rule.enabled ? 'Enabled' : 'Disabled'}</div>
        </div>
        <div class="settings-item-copy">Current mapping: ${escapeHtml(rule.classificationLabel)}</div>
        ${rule.answerLabel ? `<div class="settings-item-copy settings-item-copy-muted">Last answer: ${escapeHtml(rule.answerLabel)}</div>` : ''}
        ${Array.isArray(rule.sampleDescriptions) && rule.sampleDescriptions.length > 0 ? `<div class="settings-item-copy settings-item-copy-muted">Examples: ${escapeHtml(rule.sampleDescriptions.join(' | '))}</div>` : ''}
      </div>
      <div class="settings-rule-controls">
        <label class="settings-field settings-field-compact">
          <span>Reassign to</span>
          <select class="rule-manager-select" data-rule-id="${escapeHtml(rule.id)}" data-current-id="${escapeHtml(rule.classificationId || '')}">
            <option value="">Choose chart account</option>
            ${chartOptions}
          </select>
        </label>
        <div class="settings-item-actions">
          <button class="btn btn-primary btn-inline settings-action-btn" type="button" data-action="save-rule" data-id="${escapeHtml(rule.id)}">
            <span>Save Mapping</span>
          </button>
          <button class="btn btn-secondary btn-inline settings-action-btn" type="button" data-action="toggle-rule" data-id="${escapeHtml(rule.id)}" data-enabled="${rule.enabled ? 'true' : 'false'}">
            <span>${rule.enabled ? 'Disable' : 'Enable'}</span>
          </button>
          <button class="btn btn-secondary btn-inline settings-action-btn settings-action-danger" type="button" data-action="delete-rule" data-id="${escapeHtml(rule.id)}">
            <span>Delete</span>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  reviewRuleList.querySelectorAll('.rule-manager-select').forEach((select) => {
    select.value = select.dataset.currentId || '';
  });
}

function renderProfessionalSettings(settings) {
  professionalSettings = settings;

  settingsChartCount.textContent = (settings.summary?.activeChartAccountCount || 0).toLocaleString();
  settingsCustomChartCount.textContent = (settings.summary?.customChartAccountCount || 0).toLocaleString();
  settingsRuleCount.textContent = (settings.summary?.activeReviewRuleCount || 0).toLocaleString();
  settingsDisabledRuleCount.textContent = (settings.summary?.disabledReviewRuleCount || 0).toLocaleString();

  renderChartAccounts(settings.chartAccounts || []);
  renderReviewRules(settings.reviewRules || [], settings.chartAccounts || []);
  updateSettingsCompanyNote(settings);
}

async function loadProfessionalSettings({ silent = false } = {}) {
  if (!silent) {
    setSettingsStatus('Loading chart of accounts and saved review rules...', 'info');
  }

  try {
    const response = await fetch(withCompanyQuery('/api/professional-settings'));
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || 'Failed to load professional settings');
    }

    renderProfessionalSettings(payload);
    if (!silent) {
      setSettingsStatus('Professional chart and rule settings are up to date.', 'success');
    }
  } catch (err) {
    if (!silent) {
      setSettingsStatus(`Could not load professional settings: ${err.message}`, 'error');
    } else {
      console.error(err);
    }
  }
}

async function updateProfessionalSettingsRequest(url, options = {}, successMessage = 'Settings updated.') {
  setSettingsStatus('Saving professional settings...', 'info');

  const response = await fetch(withCompanyQuery(url), options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || 'Failed to update professional settings');
  }

  if (payload.settings) {
    renderProfessionalSettings(payload.settings);
  } else {
    await loadProfessionalSettings({ silent: true });
  }

  setSettingsStatus(successMessage, 'success');
  return payload;
}

function getQuickReportsByType(quickReports = {}) {
  return {
    sourceReports: Array.isArray(quickReports.sourceReports) ? quickReports.sourceReports : [],
    distributionReports: Array.isArray(quickReports.distributionReports) ? quickReports.distributionReports : [],
  };
}

function getAllQuickReports(quickReports = {}) {
  const { sourceReports, distributionReports } = getQuickReportsByType(quickReports);
  return [...sourceReports, ...distributionReports];
}

function getSelectedQuickReport(quickReports = {}) {
  const allReports = getAllQuickReports(quickReports);
  return allReports.find((report) => report.id === quickReportSelect.value) || allReports[0] || null;
}

function renderQuickReportRows(report) {
  quickReportTableBody.innerHTML = '';

  const rows = Array.isArray(report?.rows) ? report.rows : [];
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'statement-row row-detail';
    tr.innerHTML = `
      <td colspan="8"><span class="statement-label">No transactions were available for this report.</span></td>
    `;
    quickReportTableBody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.className = 'statement-row row-detail';
    tr.innerHTML = `
      <td>${escapeHtml(row.date || '')}</td>
      <td>${escapeHtml(row.transactionType || '')}</td>
      <td>${escapeHtml(row.name || '')}</td>
      <td>${escapeHtml(row.memo || '')}</td>
      <td>${escapeHtml(row.distributionAccount || '')}</td>
      <td>${escapeHtml(row.sourceAccount || '')}</td>
      <td>${escapeHtml(formatSignedMoney(row.amount || 0))}</td>
      <td>${escapeHtml(formatSignedMoney(row.runningBalance || 0))}</td>
    `;
    quickReportTableBody.appendChild(tr);
  });
}

function renderQuickReportSummary(report) {
  if (!report) {
    quickReportSummary.textContent = 'No quick reports are available for this professional statement yet.';
    return;
  }

  const rows = Array.isArray(report.rows) ? report.rows : [];
  const endingBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance || 0 : 0;
  const kindCopy = report.kind === 'source' ? 'Source account report' : 'Distribution account report';
  const subtitle = report.subtitle ? `${report.subtitle}. ` : '';
  const balanceLabel = report.balanceLabel ? `${report.balanceLabel}: ${formatSignedMoney(endingBalance)}. ` : '';
  const sourceFiles = Array.isArray(report.sourceFiles) ? report.sourceFiles : [];
  const sourcePreview = sourceFiles.slice(0, 3).join(', ');
  const sourceFileText = sourceFiles.length > 0
    ? `Source file${sourceFiles.length === 1 ? '' : 's'}: ${sourcePreview}${sourceFiles.length > 3 ? ` +${sourceFiles.length - 3} more.` : '.'} `
    : '';

  quickReportSummary.textContent = `${kindCopy}. ${subtitle}${report.transactionCount.toLocaleString()} transaction(s). Total movement: ${formatSignedMoney(report.total || 0)}. ${balanceLabel}${sourceFileText}${report.note || ''}`.trim();
}

function renderQuickReportSelector(quickReports = {}) {
  const { sourceReports, distributionReports } = getQuickReportsByType(quickReports);
  const previousSelection = quickReportSelect.value;

  quickReportSelect.innerHTML = '';

  const appendGroup = (label, reports) => {
    if (reports.length === 0) return;

    const optgroup = document.createElement('optgroup');
    optgroup.label = label;

    reports.forEach((report) => {
      const option = document.createElement('option');
      option.value = report.id;
      option.textContent = `${report.title} (${report.transactionCount.toLocaleString()})`;
      optgroup.appendChild(option);
    });

    quickReportSelect.appendChild(optgroup);
  };

  appendGroup('Source Account Reports', sourceReports);
  appendGroup('Distribution Account Reports', distributionReports);

  const allReports = [...sourceReports, ...distributionReports];
  if (allReports.length === 0) {
    quickReportSelect.disabled = true;
    renderQuickReportSummary(null);
    renderQuickReportRows(null);
    setQuickReportDownloadButtonIdle(null);
    return;
  }

  quickReportSelect.disabled = false;
  quickReportSelect.value = allReports.some((report) => report.id === previousSelection)
    ? previousSelection
    : allReports[0].id;
}

function renderQuickReports(quickReports = {}) {
  renderQuickReportSelector(quickReports);
  const selectedReport = getSelectedQuickReport(quickReports);
  renderQuickReportSummary(selectedReport);
  renderQuickReportRows(selectedReport);
  setQuickReportDownloadButtonIdle(selectedReport);
}

function showProfessionalResults(data) {
  pnlTotalIncomeEl.textContent = formatMoney(data.totalIncome);
  pnlGrossProfitEl.textContent = formatMoney(data.grossProfit);
  pnlTotalExpensesEl.textContent = formatMoney(data.totalExpenses);
  pnlNetIncomeEl.textContent = formatMoney(data.netIncome);
  pnlTotalCogsEl.textContent = formatMoney(data.totalCostOfGoodsSold);
  pnlNetOperatingIncomeEl.textContent = formatMoney(data.netOperatingIncome);
  pnlTotalOtherIncomeEl.textContent = formatMoney(data.totalOtherIncome);
  pnlTotalOtherExpensesEl.textContent = formatMoney(data.totalOtherExpenses);

  const reviewParts = [];
  const reviewMode = normalizeProfessionalReviewMode(data.reviewMode);

  if (data.companyName) {
    reviewParts.push(`Company profile: ${data.companyName}.`);
  }

  if (reviewMode === PROFESSIONAL_REVIEW_STRICT) {
    reviewParts.push('Strict review mode was enabled for this professional run.');
  } else {
    reviewParts.push('Standard review mode was enabled for this professional run.');
  }

  if (data.reviewSummary?.resolvedQuestions) {
    reviewParts.push(`Resolved ${data.reviewSummary.resolvedQuestions.toLocaleString()} review question(s) before finalizing this statement.`);
  }

  reviewParts.push(`Included ${data.includedTransactionCount.toLocaleString()} transaction(s) in the statement.`);

  if (data.excludedCount > 0) {
    reviewParts.push(`Excluded ${data.excludedCount.toLocaleString()} transaction(s) from the final professional statement.`);
  } else {
    reviewParts.push('No transactions needed to be excluded from the final professional statement.');
  }

  if (Array.isArray(data.excludedTransactions) && data.excludedTransactions.length > 0) {
    const preview = data.excludedTransactions
      .slice(0, 3)
      .map((item) => item.description)
      .join(', ');
    reviewParts.push(`Sample excluded items: ${preview}.`);
  }

  if (data.warning) {
    reviewParts.push(data.warning);
  }

  pnlReviewNote.textContent = reviewParts.join(' ');
  renderProfessionalAudit(data.audit || {});
  renderQuickReports(data.quickReports || {});
  renderPnlTable(data.statementRows || []);
  loadProfessionalSettings({ silent: true });
}

function renderPnlTable(rows) {
  pnlTableBody.innerHTML = '';

  if (rows.length === 0) {
    const tr = document.createElement('tr');
    tr.className = 'statement-row row-detail';
    tr.innerHTML = `
      <td><span class="statement-label">No professional P&amp;L rows were generated.</span></td>
      <td>${formatMoney(0)}</td>
    `;
    pnlTableBody.appendChild(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.className = `statement-row row-${row.type || 'detail'}`;

    const depth = Math.max(0, row.depth || 0);
    const amount = typeof row.total === 'number' ? formatMoney(row.total) : '';

    tr.innerHTML = `
      <td><span class="statement-label depth-${depth}">${escapeHtml(row.label)}</span></td>
      <td>${amount}</td>
    `;

    pnlTableBody.appendChild(tr);
  });
}

quickReportSelect.addEventListener('change', () => {
  if (reportData?.mode === 'professional') {
    renderQuickReports(reportData.quickReports || {});
  }
});

quickReportDownloadBtn.addEventListener('click', async () => {
  if (reportData?.mode !== 'professional') return;

  const selectedReport = getSelectedQuickReport(reportData.quickReports || {});
  if (!selectedReport) return;

  setQuickReportDownloadButtonLoading();

  try {
    const response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...reportData,
        exportTarget: {
          kind: 'quick-report',
          reportId: selectedReport.id,
        },
      }),
    });

    if (!response.ok) {
      let message = 'Failed to generate quick report';
      try {
        const errorPayload = await response.json();
        if (errorPayload?.error) message = errorPayload.error;
      } catch {
        // Ignore JSON parse failures and keep the generic message.
      }
      throw new Error(message);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildQuickReportFilename(selectedReport);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Error generating quick report: ${err.message}`);
  } finally {
    setQuickReportDownloadButtonIdle(getSelectedQuickReport(reportData.quickReports || {}));
  }
});

// ─── Download Report ────────────────────────────────────────────────────────

downloadBtn.addEventListener('click', async () => {
  if (!reportData) return;

  setDownloadButtonLoading();

  try {
    const response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportData),
    });

    if (!response.ok) throw new Error('Failed to generate report');

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = reportData.mode === 'professional' ? 'professional-profit-and-loss.pdf' : 'bank-statement-report.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Error generating report: ${err.message}`);
  } finally {
    setDownloadButtonIdle(currentReportMode());
  }
});

// ─── Reset ──────────────────────────────────────────────────────────────────

resetBtn.addEventListener('click', () => {
  stopStatusPolling();

  selectedFiles = [];
  reportData = null;
  renderedFileCount = 0;
  currentJobId = null;
  resetReviewState();
  setQuickReportDownloadButtonIdle(null);
  renderFileList();

  resultsSection.style.display = 'none';
  processingSection.style.display = 'none';
  uploadSection.style.display = 'block';

  progressBar.style.width = '0%';
  progressBar.style.background = 'var(--gradient-primary)';
  progressText.textContent = 'Preparing...';
  processingLog.innerHTML = '';

  hideAllResultViews();
  setDownloadButtonVisible(true);
  syncAnalysisModeUi();
});

// ─── Tab Navigation ─────────────────────────────────────────────────────────

document.querySelectorAll('.pnl-tab').forEach((tabBtn) => {
  tabBtn.addEventListener('click', () => {
    const targetId = tabBtn.dataset.tab;
    if (!targetId) return;

    // Deactivate all tabs and panels
    document.querySelectorAll('.pnl-tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.pnl-tab-content').forEach((p) => {
      p.classList.remove('active');
    });

    // Activate the clicked tab and its panel
    tabBtn.classList.add('active');
    tabBtn.setAttribute('aria-selected', 'true');
    const panel = document.getElementById(targetId);
    if (panel) {
      panel.classList.add('active');
      panel.style.animation = 'none';
      void panel.offsetHeight;
      panel.style.animation = 'fadeInUp 0.35s ease-out';
    }
  });
});

// ─── Init ───────────────────────────────────────────────────────────────────

syncAnalysisModeUi();
renderFileList();
resetReviewState();
setQuickReportDownloadButtonIdle(null);

async function initializeApp() {
  await loadCompanies({ preferredCompanyId: selectedCompanyId, silent: true });
  await loadProfessionalSettings({ silent: true });
}

initializeApp();
