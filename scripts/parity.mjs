// Phase 7.7 — Parity reporter.
//
// Reads every `data/flo-parity-run*.json` snapshot and prints a side-by-side
// comparison of how each historical run scored against the canonical Flo
// Marketing P&L produced by their accountant. Lets you see at a glance
// which runs got closer to reference and which regressed.
//
// This is a *reporter*, not a replayer. The dump files are post-classified
// snapshots — the raw extracted transactions are no longer in them, so
// we can't re-run the classifier against them. To enable a true
// re-classification harness, future extraction runs need to persist the
// raw Gemini/Claude output before any rules are applied; that is tracked
// as a follow-up to this script.
//
// Usage:
//   npm run parity                    # all snapshots in data/
//   npm run parity -- --groups        # also include per-group drift table
//   npm run parity -- file1 file2     # restrict to these files (basenames OK)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'data');

// Canonical Flo Marketing accountant figures. These are the gold values
// every parity run is being measured against — pulled from the Flo
// `ProfitandLoss.pdf` in `example of reports/`. Per-group references are
// the values that have shipped in newer parity-run summaries (any of
// `flo-parity-run-legal*.json` carry them under `summary.groups`).
const REFERENCE_TOTALS = {
  totalIncome: 1829927.75,
  totalCostOfGoodsSold: 1234241.75,
  totalExpenses: 259336.85,
  netIncome: 336349.15,
};

const REFERENCE_GROUPS = {
  Subcontractors: 757611.05,
  'Advertising and Promotion': 476630.70,
  'Legal & Professional Fees': 36088.95,
  'Meals and Entertainment': 17617.20,
  'Telephone Expense': 7198.09,
  'Bank Charge service': 1692.60,
  'Ask My Accountant': 41282.00,
};

const args = process.argv.slice(2);
const showGroups = args.includes('--groups');
const filterArgs = args.filter((arg) => !arg.startsWith('--'));

function listParityFiles() {
  if (!fs.existsSync(dataDir)) return [];
  return fs
    .readdirSync(dataDir)
    .filter((name) => /^flo-parity-run.*\.json$/.test(name))
    .sort();
}

function selectFiles(allFiles) {
  if (filterArgs.length === 0) return allFiles;
  const needles = filterArgs.map((arg) => path.basename(arg, '.json').toLowerCase());
  return allFiles.filter((name) => {
    const stem = path.basename(name, '.json').toLowerCase();
    return needles.some((needle) => stem === needle || stem.includes(needle));
  });
}

function loadRun(file) {
  const full = path.join(dataDir, file);
  const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
  const data = raw?.finalJob?.data || {};
  const summary = raw?.summary || {};

  const totals = {
    totalIncome: data.totalIncome ?? summary?.totals?.totalIncome ?? null,
    totalCostOfGoodsSold: data.totalCostOfGoodsSold ?? summary?.totals?.totalCostOfGoodsSold ?? null,
    totalExpenses: data.totalExpenses ?? summary?.totals?.totalExpenses ?? null,
    netIncome: data.netIncome ?? summary?.totals?.netIncome ?? null,
  };

  // Per-group app values come either from the older `data.sections` shape
  // (sections -> groups -> total) or from the newer `summary.groups` map.
  const groups = {};
  if (summary?.groups && typeof summary.groups === 'object') {
    for (const [name, entry] of Object.entries(summary.groups)) {
      if (entry && typeof entry.app === 'number') groups[name] = entry.app;
    }
  }
  if (Array.isArray(data.sections)) {
    for (const section of data.sections) {
      if (!Array.isArray(section?.groups)) continue;
      for (const group of section.groups) {
        if (!group?.name || typeof group.total !== 'number') continue;
        if (groups[group.name] == null) groups[group.name] = group.total;
      }
    }
  }

  return {
    file,
    finishedAt: raw?.finishedAt || null,
    transactionCount: data.transactionCount ?? null,
    totals,
    groups,
  };
}

function pctDelta(app, reference) {
  if (app == null || reference == null || reference === 0) return null;
  return ((app - reference) / reference) * 100;
}

function fmtPct(value, width = 7) {
  if (value == null) return ' '.repeat(width - 1) + '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`.padStart(width);
}

function fmtMoney(value, width = 14) {
  if (value == null) return ' '.repeat(width - 1) + '—';
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.padStart(width);
}

function pad(value, width, align = 'left') {
  const str = String(value ?? '');
  if (str.length >= width) return str.slice(0, width);
  return align === 'right' ? str.padStart(width) : str.padEnd(width);
}

function printHeader(title) {
  console.log('');
  console.log(title);
  console.log('-'.repeat(title.length));
}

function printReference() {
  printHeader('Reference (canonical Flo Marketing accountant figures)');
  console.log(`  Income:               ${fmtMoney(REFERENCE_TOTALS.totalIncome)}`);
  console.log(`  Cost of Goods Sold:   ${fmtMoney(REFERENCE_TOTALS.totalCostOfGoodsSold)}`);
  console.log(`  Expenses:             ${fmtMoney(REFERENCE_TOTALS.totalExpenses)}`);
  console.log(`  Net Income:           ${fmtMoney(REFERENCE_TOTALS.netIncome)}`);
}

function printTotalsTable(runs) {
  printHeader('Per-run drift vs reference');
  const headers = ['File', 'Income', 'COGS', 'Expenses', 'Net Inc.', 'Tx'];
  console.log(
    `  ${pad(headers[0], 36)} ${pad(headers[1], 9, 'right')} ${pad(headers[2], 9, 'right')} ${pad(headers[3], 9, 'right')} ${pad(headers[4], 9, 'right')} ${pad(headers[5], 6, 'right')}`,
  );

  let bestNetIdx = -1;
  let bestNetAbs = Infinity;
  for (let i = 0; i < runs.length; i += 1) {
    const delta = pctDelta(runs[i].totals.netIncome, REFERENCE_TOTALS.netIncome);
    if (delta != null && Math.abs(delta) < bestNetAbs) {
      bestNetAbs = Math.abs(delta);
      bestNetIdx = i;
    }
  }

  runs.forEach((run, idx) => {
    const inc = pctDelta(run.totals.totalIncome, REFERENCE_TOTALS.totalIncome);
    const cogs = pctDelta(run.totals.totalCostOfGoodsSold, REFERENCE_TOTALS.totalCostOfGoodsSold);
    const exp = pctDelta(run.totals.totalExpenses, REFERENCE_TOTALS.totalExpenses);
    const net = pctDelta(run.totals.netIncome, REFERENCE_TOTALS.netIncome);
    const marker = idx === bestNetIdx ? ' ←' : '';
    console.log(
      `  ${pad(run.file, 36)} ${fmtPct(inc, 9)} ${fmtPct(cogs, 9)} ${fmtPct(exp, 9)} ${fmtPct(net, 9)} ${pad(run.transactionCount ?? '—', 6, 'right')}${marker}`,
    );
  });
}

function printGroupsTable(runs) {
  const groupNames = Object.keys(REFERENCE_GROUPS);
  printHeader('Per-group drift vs reference (only the four high-drift buckets and surrounding context)');

  const colWidth = 9;
  const fileWidth = 36;
  const headerRow = ['File', ...groupNames.map((name) => name.split(' ')[0].slice(0, colWidth - 1))];
  console.log(`  ${pad(headerRow[0], fileWidth)}` + groupNames.map((_, i) => ` ${pad(headerRow[i + 1], colWidth, 'right')}`).join(''));

  for (const run of runs) {
    const cells = groupNames
      .map((name) => fmtPct(pctDelta(run.groups?.[name], REFERENCE_GROUPS[name]), colWidth))
      .join(' ');
    console.log(`  ${pad(run.file, fileWidth)} ${cells}`);
  }

  console.log('');
  console.log('  Group columns: Subc.  Adv.  Legal  Meals  Tel.  Bank  AMA');
}

function main() {
  const allFiles = listParityFiles();
  if (allFiles.length === 0) {
    console.error(`No flo-parity-run*.json files found in ${dataDir}`);
    console.error('The data/ directory is gitignored — these snapshots stay local. Capture');
    console.error('a fresh one by saving the result of a professional run to that path.');
    process.exit(1);
  }
  const selected = selectFiles(allFiles);
  if (selected.length === 0) {
    console.error('Filter matched no files. Available:');
    for (const file of allFiles) console.error(`  ${file}`);
    process.exit(1);
  }

  const runs = selected.map(loadRun);

  printReference();
  printTotalsTable(runs);
  if (showGroups) printGroupsTable(runs);

  console.log('');
  console.log('Notes:');
  console.log('  - This is a reporter, not a replayer. Runs are post-classified snapshots.');
  console.log('  - Pass --groups for the per-bucket drift table.');
  console.log('  - Pass file basenames as args to filter, e.g. `npm run parity -- legal legal-2`.');
}

main();
