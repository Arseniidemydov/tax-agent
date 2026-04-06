// ─── DOM References ─────────────────────────────────────────────────────────

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const fileItems = document.getElementById('file-items');
const uploadBtn = document.getElementById('upload-btn');

const uploadSection = document.getElementById('upload-section');
const processingSection = document.getElementById('processing-section');
const resultsSection = document.getElementById('results-section');

const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const processingLog = document.getElementById('processing-log');

const totalDepositsEl = document.getElementById('total-deposits');
const totalDeductionsEl = document.getElementById('total-deductions');
const totalNetEl = document.getElementById('total-net');
const totalCountEl = document.getElementById('total-count');

const depositsTable = document.querySelector('#deposits-table tbody');
const deductionsTable = document.querySelector('#deductions-table tbody');

const downloadBtn = document.getElementById('download-btn');
const resetBtn = document.getElementById('reset-btn');

// ─── State ──────────────────────────────────────────────────────────────────

let selectedFiles = [];
let reportData = null;

// ─── File Helpers ───────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatMoney(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pdfIcon() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;
}

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
      <span class="file-item-name">${pdfIcon()} ${file.name}</span>
      <span class="file-item-size">${formatSize(file.size)}</span>
      <button class="file-item-remove" data-idx="${idx}" title="Remove">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;
    fileItems.appendChild(li);
  });

  // Remove buttons
  fileItems.querySelectorAll('.file-item-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.dataset.idx);
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
  const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
  addFiles(files);
});

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  addFiles(files);
  fileInput.value = '';
});

function addFiles(files) {
  // Avoid duplicates by name
  for (const file of files) {
    if (!selectedFiles.find(f => f.name === file.name)) {
      selectedFiles.push(file);
    }
  }
  renderFileList();
}

// ─── Upload & Process ───────────────────────────────────────────────────────

uploadBtn.addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

  // Switch to processing view
  uploadSection.style.display = 'none';
  processingSection.style.display = 'block';
  resultsSection.style.display = 'none';

  progressBar.style.width = '0%';
  progressText.textContent = `Uploading ${selectedFiles.length} file(s) and starting AI analysis...`;
  processingLog.innerHTML = '';

  addLogEntry('processing', `Starting upload of ${selectedFiles.length} PDF file(s)...`);

  const formData = new FormData();
  selectedFiles.forEach(f => formData.append('statements', f));

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Server error');
    }

    const { jobId } = await response.json();
    addLogEntry('success', `Upload accepted. Job ID: ${jobId}`);
    
    // Poll for status
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${jobId}`);
        if (!res.ok) throw new Error('Failed to get status');
        
        const job = await res.json();
        
        // Update progress bar
        progressBar.style.width = job.progress + '%';
        progressText.textContent = `Processing file ${job.currentFile} of ${job.totalFiles}...`;
        
        // Check for newly processed files to log
        const processedCount = processingLog.querySelectorAll('.success, .error').length - 2; // -2 for initial logs
        if (job.filesProcessed && job.filesProcessed.length > processedCount) {
          const newFiles = job.filesProcessed.slice(processedCount);
          newFiles.forEach(fr => {
            if (fr.status === 'success') {
              addLogEntry('success', `${fr.filename} — ${fr.transactionCount} transactions extracted`);
            } else {
              addLogEntry('error', `${fr.filename} — ${fr.error}`);
            }
          });
        }
        
        if (job.status === 'completed') {
          clearInterval(pollInterval);
          progressText.textContent = 'Analysis complete!';
          addLogEntry('success', `Total: ${job.data.transactionCount} transactions across all statements`);
          
          reportData = job.data;
          setTimeout(() => showResults(job.data), 1200);
        } else if (job.status === 'error') {
          clearInterval(pollInterval);
          throw new Error(job.error || 'Processing failed');
        }
      } catch (err) {
        clearInterval(pollInterval);
        handleUploadError(err);
      }
    }, 2000);

  } catch (err) {
    handleUploadError(err);
  }
});

function handleUploadError(err) {
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

// ─── Show Results ───────────────────────────────────────────────────────────

function showResults(data) {
  processingSection.style.display = 'none';
  resultsSection.style.display = 'block';

  // Summary cards
  totalDepositsEl.textContent = formatMoney(data.totalDeposits);
  totalDeductionsEl.textContent = formatMoney(data.totalDeductions);
  totalNetEl.textContent = formatMoney(data.net);
  totalCountEl.textContent = data.transactionCount.toLocaleString();

  // Deposits table
  depositsTable.innerHTML = '';
  data.deposits.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><span class="category-badge" style="font-size: 0.8rem; background: var(--bg-hover); padding: 2px 6px; border-radius: 4px; color: var(--text-secondary);">${escapeHtml(item.category || 'Other')}</span></td>
      <td>${escapeHtml(item.description)}</td>
      <td>${item.count}</td>
      <td>${formatMoney(item.total)}</td>
    `;
    depositsTable.appendChild(tr);
  });
  // Total row
  const depTotalTr = document.createElement('tr');
  depTotalTr.className = 'total-row';
  depTotalTr.innerHTML = `
    <td></td>
    <td></td>
    <td>TOTAL</td>
    <td>${data.deposits.reduce((s, d) => s + d.count, 0)}</td>
    <td>${formatMoney(data.totalDeposits)}</td>
  `;
  depositsTable.appendChild(depTotalTr);

  // Deductions table
  deductionsTable.innerHTML = '';
  data.deductions.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><span class="category-badge" style="font-size: 0.8rem; background: var(--bg-hover); padding: 2px 6px; border-radius: 4px; color: var(--text-secondary);">${escapeHtml(item.category || 'Other')}</span></td>
      <td>${escapeHtml(item.description)}</td>
      <td>${item.count}</td>
      <td>${formatMoney(item.total)}</td>
    `;
    deductionsTable.appendChild(tr);
  });
  const dedTotalTr = document.createElement('tr');
  dedTotalTr.className = 'total-row';
  dedTotalTr.innerHTML = `
    <td></td>
    <td></td>
    <td>TOTAL</td>
    <td>${data.deductions.reduce((s, d) => s + d.count, 0)}</td>
    <td>${formatMoney(data.totalDeductions)}</td>
  `;
  deductionsTable.appendChild(dedTotalTr);

  // Animate in
  resultsSection.style.animation = 'none';
  void resultsSection.offsetHeight; // trigger reflow
  resultsSection.style.animation = 'fadeInUp 0.6s ease-out';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── Download Report ────────────────────────────────────────────────────────

downloadBtn.addEventListener('click', async () => {
  if (!reportData) return;

  downloadBtn.disabled = true;
  downloadBtn.innerHTML = '<div class="spinner"></div><span>Generating PDF...</span>';

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
    a.download = 'bank-statement-report.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error generating report: ' + err.message);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      <span>Download PDF Report</span>
    `;
  }
});

// ─── Reset ──────────────────────────────────────────────────────────────────

resetBtn.addEventListener('click', () => {
  selectedFiles = [];
  reportData = null;
  renderFileList();
  resultsSection.style.display = 'none';
  processingSection.style.display = 'none';
  uploadSection.style.display = 'block';
  progressBar.style.width = '0%';
  progressBar.style.background = 'var(--gradient-primary)';
});
