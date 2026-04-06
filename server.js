import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Multer config — store files in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

// ─── Gemini AI extraction ──────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyDfU1ic1v5TFsAqY6_zurgBhcth9MvE3sQ';

if (!GEMINI_API_KEY) {
  console.warn('⚠️ WARNING: GEMINI_API_KEY is not set!');
}
const EXTRACTION_PROMPT = `You are an expert tax accountant and bank statement parser. Analyze this bank statement PDF and extract EVERY transaction.

For each transaction, return:
- date: the transaction date (as shown on statement)
- description: the transaction description/memo (keep original wording, but normalize: trim whitespace, remove extra spaces)
- amount: the absolute numeric amount (no currency symbols, no commas — just a number like 1234.56)
- type: either "deposit" or "deduction"
- category: Assign the transaction to exactly ONE of the following standard IRS Schedule C categories:
  [Advertising, Car and truck expenses, Commissions and fees, Contract labor (Subcontractors), Depletion / Depreciation, Employee benefit programs, Insurance, Interest, Legal and professional services, Office expense, Pension and profit-sharing plans, Rent or lease, Repairs and maintenance, Supplies, Taxes and licenses, Travel and meals, Utilities, Wages, Other expenses, Income]

IMPORTANT RULES:
1. Extract ALL transactions — do not skip any
2. A deposit is money coming IN. Use category "Income" or "Other expenses" (if refund).
3. A deduction is money going OUT. Choose the most accurate category from the list above.
4. If a transaction description appears multiple times, keep the EXACT same description text for all occurrences so they can be grouped later
5. Normalize descriptions (strip unique reference numbers)
6. Return ONLY a valid JSON array, no formatting marks

Example output:
[
  {"date": "01/15/2025", "description": "EMPLOYER INC DIRECT DEPOSIT", "amount": 3500.00, "type": "deposit", "category": "Income"},
  {"date": "01/16/2025", "description": "AMAZON.COM", "amount": 45.99, "type": "deduction", "category": "Office expense"}
]`;

async function extractTransactionsFromPDF(pdfBuffer) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const base64PDF = pdfBuffer.toString('base64');

  // Add retry logic for 503/429 errors
  let result;
  let retries = 3;
  while (retries > 0) {
    try {
      result = await model.generateContent([
        { text: EXTRACTION_PROMPT },
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64PDF,
          },
        },
      ]);
      break; 
    } catch (err) {
      if (err.message.includes('503') || err.message.includes('429')) {
        retries--;
        if (retries === 0) throw err;
        console.log(`    ⚠️ API busy, retrying in 5s... (${retries} retries left)`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        throw err;
      }
    }
  }

  const responseText = result.response.text();
  console.log('--- RAW AI RESPONSE ---');
  console.log(responseText.substring(0, 500) + '...');
  
  // Parse JSON from response (handle markdown fences if present)
  let jsonStr = responseText;
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1];
  }

  // Try to find the JSON array
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!arrayMatch) {
    console.error('FAILED TO PARSE JSON. RAW TEXT WAS:', responseText);
    throw new Error('Could not parse transaction data from AI response');
  }

  const transactions = JSON.parse(arrayMatch[0]);
  return transactions;
}

// ─── Aggregation logic ─────────────────────────────────────────────────────────

function aggregateTransactions(allTransactions) {
  const deposits = {};
  const deductions = {};

  for (const tx of allTransactions) {
    const desc = (tx.description || 'UNKNOWN').trim().toUpperCase();
    const amount = Math.abs(parseFloat(tx.amount) || 0);
    const type = (tx.type || '').toLowerCase();
    const category = (tx.category || 'Other expenses').trim();

    if (type === 'deposit') {
      if (!deposits[desc]) deposits[desc] = { description: desc, total: 0, count: 0, category: category };
      deposits[desc].total += amount;
      deposits[desc].count += 1;
    } else {
      if (!deductions[desc]) deductions[desc] = { description: desc, total: 0, count: 0, category: category };
      deductions[desc].total += amount;
      deductions[desc].count += 1;
    }
  }

  const depositList = Object.values(deposits).sort((a, b) => b.total - a.total);
  const deductionList = Object.values(deductions).sort((a, b) => b.total - a.total);

  const totalDeposits = depositList.reduce((sum, d) => sum + d.total, 0);
  const totalDeductions = deductionList.reduce((sum, d) => sum + d.total, 0);

  return {
    deposits: depositList,
    deductions: deductionList,
    totalDeposits: Math.round(totalDeposits * 100) / 100,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    net: Math.round((totalDeposits - totalDeductions) * 100) / 100,
    transactionCount: allTransactions.length,
  };
}

// ─── Background Jobs for long processing ──────────────────────────────────────

const jobs = {};

app.post('/api/upload', upload.array('statements', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No PDF files uploaded' });
    }

    const jobId = Date.now().toString();
    
    jobs[jobId] = {
      status: 'processing',
      progress: 0,
      totalFiles: req.files.length,
      currentFile: 0,
      filesProcessed: [],
      data: null,
      error: null
    };
    
    // Start processing in background
    processJob(jobId, req.files);
    
    res.json({ success: true, jobId });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/status/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

async function processJob(jobId, files) {
  const job = jobs[jobId];
  const allTransactions = [];
  
  console.log(`\n📄 [Job ${jobId}] Received ${files.length} PDF file(s) for processing...`);

  try {
    let filesCompleted = 0;

    const promises = files.map(async (file, i) => {
      console.log(`  ⏳ [Job ${jobId}] Started processing [${i + 1}/${files.length}]: ${file.originalname}`);

      try {
        const transactions = await extractTransactionsFromPDF(file.buffer);
        allTransactions.push(...transactions);
        job.filesProcessed.push({
          filename: file.originalname,
          status: 'success',
          transactionCount: transactions.length,
        });
        console.log(`  ✅ [Job ${jobId}] Extracted ${transactions.length} transactions from ${file.originalname}`);
      } catch (err) {
        console.error(`  ❌ [Job ${jobId}] Failed to process ${file.originalname}:`, err.message);
        job.filesProcessed.push({
          filename: file.originalname,
          status: 'error',
          error: err.message,
        });
      } finally {
        filesCompleted++;
        job.currentFile = filesCompleted;
        job.progress = Math.round((filesCompleted / files.length) * 100);
      }
    });

    await Promise.all(promises);

    const aggregated = aggregateTransactions(allTransactions);
    
    job.progress = 100;
    job.status = 'completed';
    job.data = aggregated;
    console.log(`🎉 [Job ${jobId}] Completed successfully with ${aggregated.transactionCount} total transactions.`);
    
  } catch (err) {
    console.error(`💥 [Job ${jobId}] Fatal error:`, err);
    job.status = 'error';
    job.error = err.message;
  }
}


// ─── PDF Report generation endpoint ─────────────────────────────────────────────

app.post('/api/report', (req, res) => {
  try {
    const { deposits, deductions, totalDeposits, totalDeductions, net, transactionCount } = req.body;

    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="bank-statement-report.pdf"');
    doc.pipe(res);

    // ── Header ──
    doc.fontSize(22).font('Helvetica-Bold').fillColor('#1a1a2e')
      .text('Bank Statement Analysis Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor('#666')
      .text(`Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
    doc.text(`Total transactions analyzed: ${transactionCount}`, { align: 'center' });
    doc.moveDown(1);

    // ── Summary Box ──
    const summaryY = doc.y;
    doc.rect(50, summaryY, 495, 70).fill('#f0f4ff');
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a2e')
      .text('Summary', 70, summaryY + 10);
    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(`Total Deposits: $${totalDeposits.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 70, summaryY + 30);
    doc.text(`Total Deductions: $${totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 250, summaryY + 30);
    doc.text(`Net: $${net.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 430, summaryY + 30);
    doc.text(`Deposit Categories: ${deposits.length}`, 70, summaryY + 48);
    doc.text(`Deduction Categories: ${deductions.length}`, 250, summaryY + 48);
    doc.y = summaryY + 85;

    // ── Helper: draw table ──
    function drawTable(title, items, total, color) {
      // Check page space
      if (doc.y > 650) doc.addPage();

      doc.fontSize(14).font('Helvetica-Bold').fillColor(color)
        .text(title, 50);
      doc.moveDown(0.4);

      // Table header
      const tableX = 50;
      let tableY = doc.y;
      doc.rect(tableX, tableY, 495, 22).fill(color);
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
      doc.text('#', tableX + 8, tableY + 6, { width: 30 });
      doc.text('Description', tableX + 40, tableY + 6, { width: 280 });
      doc.text('Count', tableX + 330, tableY + 6, { width: 50, align: 'right' });
      doc.text('Total Amount', tableX + 390, tableY + 6, { width: 100, align: 'right' });
      tableY += 22;

      // Table rows
      items.forEach((item, idx) => {
        if (tableY > 750) {
          doc.addPage();
          tableY = 50;
        }
        const bgColor = idx % 2 === 0 ? '#fafafa' : '#fff';
        doc.rect(tableX, tableY, 495, 20).fill(bgColor);
        doc.fontSize(8).font('Helvetica').fillColor('#333');
        doc.text(`${idx + 1}`, tableX + 8, tableY + 5, { width: 30 });
        doc.text(item.description, tableX + 40, tableY + 5, { width: 280 });
        doc.text(`${item.count}`, tableX + 330, tableY + 5, { width: 50, align: 'right' });
        doc.text(`$${item.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, tableX + 390, tableY + 5, { width: 100, align: 'right' });
        tableY += 20;
      });

      // Total row
      doc.rect(tableX, tableY, 495, 24).fill(color);
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#fff');
      doc.text('TOTAL', tableX + 40, tableY + 6, { width: 280 });
      doc.text(`$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, tableX + 390, tableY + 6, { width: 100, align: 'right' });
      doc.y = tableY + 40;
    }

    drawTable('Deposits', deposits, totalDeposits, '#2d6a4f');
    drawTable('Deductions', deductions, totalDeductions, '#c1121f');

    // ── Footer ──
    doc.moveDown(2);
    doc.fontSize(8).font('Helvetica').fillColor('#999')
      .text('This report was generated automatically by Tax Agent — AI-powered bank statement analyzer.', { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve Static Frontend (for Production) ───────────────────────────────────

app.use(express.static(path.join(process.cwd(), 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`\n🚀 Tax Agent server running on port ${PORT}`);
});

// Set server timeout to 30 minutes to support long Gemini API processing
server.setTimeout(30 * 60 * 1000);
