import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

function parseEnvValue(rawValue) {
  const trimmed = rawValue.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadLocalEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const fileContents = fs.readFileSync(filePath, 'utf8');
  const lines = fileContents.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1);
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue;

    process.env[key] = parseEnvValue(rawValue);
  }
}

const projectRoot = process.cwd();
loadLocalEnvFile(path.join(projectRoot, '.env.local'));
loadLocalEnvFile(path.join(projectRoot, '.env'));

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
const GEMINI_TIMEOUT_MS = Number.parseInt(process.env.GEMINI_TIMEOUT_MS || '120000', 10);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = Number.parseInt(process.env.OPENAI_TIMEOUT_MS || '45000', 10);
const OPENAI_VERIFIER_MIN_CLUSTER_AMOUNT = Number.parseFloat(process.env.OPENAI_VERIFIER_MIN_CLUSTER_AMOUNT || '750');
const OPENAI_VERIFIER_AUTO_APPLY_CONFIDENCE = Number.parseFloat(process.env.OPENAI_VERIFIER_AUTO_APPLY_CONFIDENCE || '0.88');
const COMPANY_PROFILES_STORE_PATH = path.join(projectRoot, 'data', 'company-profiles.json');
const COMPANY_PROFILES_STORE_VERSION = 1;
const CHART_OF_ACCOUNTS_STORE_PATH = path.join(projectRoot, 'data', 'chart-of-accounts.json');
const CHART_OF_ACCOUNTS_STORE_VERSION = 1;
const REVIEW_RULES_STORE_PATH = path.join(projectRoot, 'data', 'review-rules.json');
const REVIEW_RULES_STORE_VERSION = 1;

const SIMPLE_MODE = 'simple';
const PROFESSIONAL_MODE = 'professional';
const PROFESSIONAL_REVIEW_STANDARD = 'standard';
const PROFESSIONAL_REVIEW_STRICT = 'strict';
const PNL_SECTION_ORDER = ['Income', 'Cost of Goods Sold', 'Expenses', 'Other Income', 'Other Expenses'];
const MAX_REVIEW_QUESTIONS = 6;
const STANDARD_REVIEW_RESERVED_NON_TRANSFER_QUESTIONS = 3;
const MAX_OPENAI_VERIFIER_CLUSTERS = 18;
const STRICT_REVIEW_MIN_CLUSTER_AMOUNT = Number.parseFloat(process.env.STRICT_REVIEW_MIN_CLUSTER_AMOUNT || '250');

const PROFESSIONAL_VERIFIER_CLASSIFICATIONS = [
  {
    id: 'income_sales',
    section: 'Income',
    group: 'Sales',
    account: 'Sales',
    guidance: 'Use for true business revenue and customer collections.',
  },
  {
    id: 'cogs_advertising_general',
    section: 'Cost of Goods Sold',
    group: 'Advertising and Promotion',
    account: 'Advertising and Promotion',
    guidance: 'Use for direct-response marketing and ad spend when a more specific ad account is not clear.',
  },
  {
    id: 'cogs_advertising_facebook',
    section: 'Cost of Goods Sold',
    group: 'Advertising and Promotion',
    account: 'Facebook',
    guidance: 'Use for Meta or Facebook ad spend.',
  },
  {
    id: 'cogs_advertising_google',
    section: 'Cost of Goods Sold',
    group: 'Advertising and Promotion',
    account: 'Google ADS',
    guidance: 'Use for Google Ads or AdWords spend.',
  },
  {
    id: 'cogs_advertising_lead_generation',
    section: 'Cost of Goods Sold',
    group: 'Advertising and Promotion',
    account: 'Lead Generation',
    guidance: 'Use for lead-generation vendors, media buying, and marketing payout rails such as Steven/ST vendor payments.',
  },
  {
    id: 'cogs_subcontractors',
    section: 'Cost of Goods Sold',
    group: 'Subcontractors',
    account: 'Subcontractors',
    guidance: 'Use for contractors, fulfillment partners, and vendors paid to deliver client work.',
  },
  {
    id: 'expenses_ask_my_accountant',
    section: 'Expenses',
    group: 'Ask My Accountant',
    account: 'Ask My Accountant',
    guidance: 'Use for suspense, uncategorized bookkeeping items, and business transactions that should be reviewed by an accountant.',
  },
  {
    id: 'expenses_auto',
    section: 'Expenses',
    group: 'Auto Expense',
    account: 'Auto Expense',
    guidance: 'Use for general car and truck costs when no more specific auto account fits.',
  },
  {
    id: 'expenses_auto_rental',
    section: 'Expenses',
    group: 'Auto Expense',
    account: 'Car Rental',
    guidance: 'Use for rental cars.',
  },
  {
    id: 'expenses_auto_fuel',
    section: 'Expenses',
    group: 'Auto Expense',
    account: 'Fuel',
    guidance: 'Use for gas and fuel purchases.',
  },
  {
    id: 'expenses_auto_tools_parking',
    section: 'Expenses',
    group: 'Auto Expense',
    account: 'Tools and Parking',
    guidance: 'Use for tolls, parking, valet, and similar vehicle-related charges.',
  },
  {
    id: 'expenses_bank_charges',
    section: 'Expenses',
    group: 'Bank Charge service',
    account: 'Bank Charge service',
    guidance: 'Use for bank fees and service charges, not for transfers or vendor payments.',
  },
  {
    id: 'expenses_business_permits',
    section: 'Expenses',
    group: 'Business and Permits',
    account: 'Business and Permits',
    guidance: 'Use for licenses, permits, and government filing fees.',
  },
  {
    id: 'expenses_computer_internet',
    section: 'Expenses',
    group: 'Computer and Internet',
    account: 'Computer and Internet',
    guidance: 'Use for internet service, hosting, software infrastructure, and computer-related services.',
  },
  {
    id: 'expenses_dues',
    section: 'Expenses',
    group: 'Dues and Subscription',
    account: 'Dues and Subscription',
    guidance: 'Use for subscriptions, memberships, and recurring software charges.',
  },
  {
    id: 'expenses_insurance',
    section: 'Expenses',
    group: 'Insurance Expense',
    account: 'Insurance Expense',
    guidance: 'Use for insurance premiums.',
  },
  {
    id: 'expenses_legal',
    section: 'Expenses',
    group: 'Legal & Professional Fees',
    account: 'Legal & Professional Fees',
    guidance: 'Use for attorneys, accountants, consultants, and other professional services.',
  },
  {
    id: 'expenses_meals',
    section: 'Expenses',
    group: 'Meals and Entertainment',
    account: 'Meals and Entertainment',
    guidance: 'Use for meals, entertainment, and client dining.',
  },
  {
    id: 'expenses_office',
    section: 'Expenses',
    group: 'Office Expense',
    account: 'Office Expense',
    guidance: 'Use for office supplies and routine admin purchases.',
  },
  {
    id: 'expenses_other',
    section: 'Expenses',
    group: 'Other Expense',
    account: 'Other Expense',
    guidance: 'Use only when no better operating expense bucket fits.',
  },
  {
    id: 'expenses_payroll',
    section: 'Expenses',
    group: 'Payroll',
    account: 'Wages',
    guidance: 'Use for wages and payroll.',
  },
  {
    id: 'expenses_remote_staffing',
    section: 'Expenses',
    group: 'Remote Staffing Fees',
    account: 'Remote Staffing Fees',
    guidance: 'Use for remote staffing agencies and outsourcing support teams.',
  },
  {
    id: 'expenses_repair',
    section: 'Expenses',
    group: 'Repair and Maintenance',
    account: 'Repair and Maintenance',
    guidance: 'Use for repairs and maintenance.',
  },
  {
    id: 'expenses_supplies',
    section: 'Expenses',
    group: 'Supplies',
    account: 'Supplies',
    guidance: 'Use for general supplies and operating materials.',
  },
  {
    id: 'expenses_telephone',
    section: 'Expenses',
    group: 'Telephone Expense',
    account: 'Telephone Expense',
    guidance: 'Use for cell phone, telecom, and voice service.',
  },
  {
    id: 'expenses_travel',
    section: 'Expenses',
    group: 'Travel Expense',
    account: 'Travel Expense',
    guidance: 'Use for general travel when a more specific travel account is not clear.',
  },
  {
    id: 'expenses_travel_airfare',
    section: 'Expenses',
    group: 'Travel Expense',
    account: 'Airfare',
    guidance: 'Use for airline tickets and flights.',
  },
  {
    id: 'expenses_travel_lodging',
    section: 'Expenses',
    group: 'Travel Expense',
    account: 'Lodging',
    guidance: 'Use for hotels and lodging.',
  },
  {
    id: 'expenses_travel_rideshare',
    section: 'Expenses',
    group: 'Travel Expense',
    account: 'Taxis & Rideshare',
    guidance: 'Use for taxis, Uber, Lyft, and rideshare.',
  },
  {
    id: 'expenses_utilities',
    section: 'Expenses',
    group: 'Utilities',
    account: 'Utilities',
    guidance: 'Use for utilities when a telecom or computer/internet bucket is not a better fit.',
  },
  {
    id: 'other_income_refunds',
    section: 'Other Income',
    group: 'Refunds and Credits',
    account: 'Refunds & Reversals',
    guidance: 'Use for refunds, reversals, and credits that belong in the P&L.',
  },
  {
    id: 'other_income_other',
    section: 'Other Income',
    group: 'Other Income',
    account: 'Other Income',
    guidance: 'Use for non-sales income that is still part of the P&L.',
  },
  {
    id: 'other_expenses_interest',
    section: 'Other Expenses',
    group: 'Interest Expense',
    account: 'Interest Expense',
    guidance: 'Use for interest charges.',
  },
  {
    id: 'ignore_transfer',
    section: 'Ignore',
    group: 'Transfers',
    account: 'Internal Transfer',
    guidance: 'Use for internal transfers, balance-sheet activity, owner movements, loan activity, and credit card payments.',
  },
  {
    id: 'ignore_adjustment',
    section: 'Ignore',
    group: 'Refund / Credit Adjustment',
    account: 'Refund / Credit Adjustment',
    guidance: 'Use for statement adjustments and non-operating refund credits that should stay out of the P&L.',
  },
];

const SCHEDULE_C_CATEGORIES = [
  'Advertising',
  'Car and truck expenses',
  'Commissions and fees',
  'Contract labor (Subcontractors)',
  'Depletion / Depreciation',
  'Employee benefit programs',
  'Insurance',
  'Interest',
  'Legal and professional services',
  'Office expense',
  'Pension and profit-sharing plans',
  'Rent or lease',
  'Repairs and maintenance',
  'Supplies',
  'Taxes and licenses',
  'Travel and meals',
  'Utilities',
  'Wages',
  'Other expenses',
  'Income',
];

const PROFESSIONAL_VERIFIER_CLASSIFICATION_BY_ID = Object.fromEntries(
  PROFESSIONAL_VERIFIER_CLASSIFICATIONS.map((classification) => [classification.id, classification]),
);

function createEmptyChartOfAccountsStore() {
  return {
    version: CHART_OF_ACCOUNTS_STORE_VERSION,
    updatedAt: null,
    accounts: [],
  };
}

function slugifyStoreId(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function createDefaultChartAccountEntries() {
  const timestamp = new Date().toISOString();
  return PROFESSIONAL_VERIFIER_CLASSIFICATIONS.map((classification, index) => ({
    id: classification.id,
    section: classification.section,
    group: classification.group,
    account: classification.account,
    guidance: coercePersistedRuleString(classification.guidance),
    enabled: true,
    builtIn: true,
    sortOrder: index,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

function normalizeChartOfAccountEntry(rawEntry, index = 0, defaultsById = new Map()) {
  if (!rawEntry || typeof rawEntry !== 'object') return null;

  const fallbackId = coercePersistedRuleString(rawEntry.id)
    || `custom_${slugifyStoreId(`${rawEntry.section || ''}_${rawEntry.group || ''}_${rawEntry.account || ''}`)}_${index + 1}`;
  const defaultEntry = defaultsById.get(fallbackId);
  const section = normalizePlSection(rawEntry.section || defaultEntry?.section);
  const group = normalizeWhitespace(rawEntry.group || defaultEntry?.group);
  const account = normalizeWhitespace(rawEntry.account || defaultEntry?.account || group);

  if (!fallbackId || !section || !group || !account) {
    return null;
  }

  return {
    id: fallbackId,
    section,
    group,
    account,
    guidance: coercePersistedRuleString(rawEntry.guidance || defaultEntry?.guidance),
    enabled: typeof rawEntry.enabled === 'boolean' ? rawEntry.enabled : true,
    builtIn: typeof rawEntry.builtIn === 'boolean' ? rawEntry.builtIn : Boolean(defaultEntry?.builtIn),
    sortOrder: Number.isFinite(Number(rawEntry.sortOrder)) ? Number(rawEntry.sortOrder) : index,
    createdAt: coercePersistedRuleString(rawEntry.createdAt) || defaultEntry?.createdAt || new Date().toISOString(),
    updatedAt: coercePersistedRuleString(rawEntry.updatedAt) || new Date().toISOString(),
  };
}

function compareChartAccountEntries(a, b) {
  const sectionIndexA = PNL_SECTION_ORDER.includes(a.section) ? PNL_SECTION_ORDER.indexOf(a.section) : PNL_SECTION_ORDER.length + 1;
  const sectionIndexB = PNL_SECTION_ORDER.includes(b.section) ? PNL_SECTION_ORDER.indexOf(b.section) : PNL_SECTION_ORDER.length + 1;
  if (sectionIndexA !== sectionIndexB) return sectionIndexA - sectionIndexB;
  if ((a.sortOrder || 0) !== (b.sortOrder || 0)) return (a.sortOrder || 0) - (b.sortOrder || 0);
  return buildClassificationLabel(a.section, a.group, a.account).localeCompare(buildClassificationLabel(b.section, b.group, b.account));
}

function mergeChartAccountEntries(rawAccounts = []) {
  const defaults = createDefaultChartAccountEntries();
  const defaultsById = new Map(defaults.map((entry) => [entry.id, entry]));
  const entriesById = new Map();

  rawAccounts.forEach((rawEntry, index) => {
    const normalized = normalizeChartOfAccountEntry(rawEntry, index, defaultsById);
    if (!normalized) return;
    entriesById.set(normalized.id, normalized);
  });

  defaults.forEach((entry) => {
    if (!entriesById.has(entry.id)) {
      entriesById.set(entry.id, entry);
    }
  });

  return Array.from(entriesById.values()).sort(compareChartAccountEntries);
}

function loadChartOfAccountsStore(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      ...createEmptyChartOfAccountsStore(),
      accounts: mergeChartAccountEntries([]),
    };
  }

  try {
    const rawPayload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      version: Number.parseInt(rawPayload?.version || `${CHART_OF_ACCOUNTS_STORE_VERSION}`, 10) || CHART_OF_ACCOUNTS_STORE_VERSION,
      updatedAt: coercePersistedRuleString(rawPayload?.updatedAt) || null,
      accounts: mergeChartAccountEntries(Array.isArray(rawPayload?.accounts) ? rawPayload.accounts : []),
    };
  } catch (err) {
    console.error(`Could not load chart of accounts from ${filePath}:`, err.message);
    return {
      ...createEmptyChartOfAccountsStore(),
      accounts: mergeChartAccountEntries([]),
    };
  }
}

function writeChartOfAccountsStore(filePath, store) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

const legacyChartOfAccountsStore = loadChartOfAccountsStore(CHART_OF_ACCOUNTS_STORE_PATH);

function getCompanyChartOfAccountsStore(companyProfile = null) {
  return companyProfile?.chartOfAccounts && typeof companyProfile.chartOfAccounts === 'object'
    ? companyProfile.chartOfAccounts
    : createEmptyChartOfAccountsStore();
}

function getConfiguredProfessionalVerifierClassifications(companyProfile = null, { includeDisabled = false } = {}) {
  const chartStore = getCompanyChartOfAccountsStore(companyProfile);
  const accounts = Array.isArray(chartStore?.accounts) ? chartStore.accounts : [];
  return accounts
    .filter((account) => includeDisabled || account.enabled !== false)
    .map((account) => ({
      id: account.id,
      section: account.section,
      group: account.group,
      account: account.account,
      guidance: account.guidance,
      enabled: account.enabled !== false,
      builtIn: Boolean(account.builtIn),
      sortOrder: account.sortOrder || 0,
    }));
}

function getConfiguredProfessionalVerifierClassificationById(id, companyProfile = null) {
  if (!id) return null;
  return getConfiguredProfessionalVerifierClassifications(companyProfile, { includeDisabled: true })
    .find((classification) => classification.id === id) || null;
}

function findChartAccountIdForClassification(classification, companyProfile = null) {
  if (!classification) return '';

  const section = normalizePlSection(classification.section || classification.plSection);
  const group = normalizeWhitespace(classification.group || classification.plGroup);
  const account = normalizeWhitespace(classification.account || classification.plAccount || group);

  const exactMatch = getConfiguredProfessionalVerifierClassifications(companyProfile, { includeDisabled: true })
    .find((entry) => entry.section === section && entry.group === group && entry.account === account);

  return exactMatch?.id || '';
}

function serializeChartAccountEntry(entry) {
  return {
    id: entry.id,
    section: entry.section,
    group: entry.group,
    account: entry.account,
    guidance: entry.guidance || '',
    enabled: entry.enabled !== false,
    builtIn: Boolean(entry.builtIn),
    sortOrder: entry.sortOrder || 0,
    classificationLabel: buildClassificationLabel(entry.section, entry.group, entry.account),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function coercePersistedRuleString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createEmptyReviewRuleStore() {
  return {
    version: REVIEW_RULES_STORE_VERSION,
    updatedAt: null,
    rules: [],
  };
}

function normalizePersistedReviewRule(rawRule, index = 0) {
  if (!rawRule || typeof rawRule !== 'object') return null;

  const ruleType = coercePersistedRuleString(rawRule.ruleType);
  const bucketKey = coercePersistedRuleString(rawRule.bucketKey);
  const bucketLabel = coercePersistedRuleString(rawRule.bucketLabel);
  const transactionType = coercePersistedRuleString(rawRule.transactionType) || 'unknown';
  const questionType = coercePersistedRuleString(rawRule.questionType);
  const answerKey = coercePersistedRuleString(rawRule.answerKey);
  const answerLabel = coercePersistedRuleString(rawRule.answerLabel);
  const classification = rawRule.classification && typeof rawRule.classification === 'object'
    ? {
      plSection: coercePersistedRuleString(rawRule.classification.plSection),
      plGroup: coercePersistedRuleString(rawRule.classification.plGroup),
      plAccount: coercePersistedRuleString(rawRule.classification.plAccount),
      category: coercePersistedRuleString(rawRule.classification.category),
    }
    : null;

  if (!ruleType || !bucketKey || !classification?.plSection || !classification?.plGroup || !classification?.plAccount) {
    return null;
  }

  return {
    id: coercePersistedRuleString(rawRule.id) || `review_rule_${index + 1}`,
    ruleType,
    bucketKey,
    bucketLabel,
    transactionType,
    questionType,
    answerKey,
    answerLabel,
    classification,
    sampleDescriptions: Array.isArray(rawRule.sampleDescriptions)
      ? rawRule.sampleDescriptions.map((value) => coercePersistedRuleString(value)).filter(Boolean).slice(0, 3)
      : [],
    enabled: typeof rawRule.enabled === 'boolean' ? rawRule.enabled : true,
    classificationId: coercePersistedRuleString(rawRule.classificationId) || findChartAccountIdForClassification(classification),
    timesConfirmed: Math.max(1, Number.parseInt(rawRule.timesConfirmed || '1', 10) || 1),
    createdAt: coercePersistedRuleString(rawRule.createdAt) || new Date().toISOString(),
    updatedAt: coercePersistedRuleString(rawRule.updatedAt) || new Date().toISOString(),
  };
}

function loadReviewRuleStore(filePath) {
  if (!fs.existsSync(filePath)) {
    return createEmptyReviewRuleStore();
  }

  try {
    const rawPayload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const rawRules = Array.isArray(rawPayload?.rules) ? rawPayload.rules : [];

    return {
      version: Number.parseInt(rawPayload?.version || `${REVIEW_RULES_STORE_VERSION}`, 10) || REVIEW_RULES_STORE_VERSION,
      updatedAt: coercePersistedRuleString(rawPayload?.updatedAt) || null,
      rules: rawRules
        .map((rule, index) => normalizePersistedReviewRule(rule, index))
        .filter(Boolean),
    };
  } catch (err) {
    console.error(`Could not load persisted review rules from ${filePath}:`, err.message);
    return createEmptyReviewRuleStore();
  }
}

function writeReviewRuleStore(filePath, store) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

const legacyReviewRuleStore = loadReviewRuleStore(REVIEW_RULES_STORE_PATH);

function createEmptyCompanyProfilesStore() {
  return {
    version: COMPANY_PROFILES_STORE_VERSION,
    updatedAt: null,
    defaultCompanyId: null,
    companies: [],
  };
}

function normalizeCompanyId(value) {
  return slugifyStoreId(value || '');
}

function createInitialCompanyProfile({
  id = 'default_company',
  name = 'Default Company',
  chartAccounts = [],
  reviewRules = [],
} = {}) {
  const timestamp = new Date().toISOString();
  return {
    id: normalizeCompanyId(id) || 'default_company',
    name: normalizeWhitespace(name) || 'Default Company',
    createdAt: timestamp,
    updatedAt: timestamp,
    chartOfAccounts: {
      version: CHART_OF_ACCOUNTS_STORE_VERSION,
      updatedAt: timestamp,
      accounts: mergeChartAccountEntries(chartAccounts),
    },
    reviewRules: {
      version: REVIEW_RULES_STORE_VERSION,
      updatedAt: timestamp,
      rules: reviewRules
        .map((rule, index) => normalizePersistedReviewRule(rule, index))
        .filter(Boolean),
    },
  };
}

function normalizeCompanyProfile(rawProfile, index = 0) {
  if (!rawProfile || typeof rawProfile !== 'object') return null;

  const normalizedId = normalizeCompanyId(rawProfile.id) || `company_${index + 1}`;
  const normalizedName = normalizeWhitespace(rawProfile.name) || `Company ${index + 1}`;
  const chartAccountsPayload = Array.isArray(rawProfile.chartOfAccounts?.accounts)
    ? rawProfile.chartOfAccounts.accounts
    : Array.isArray(rawProfile.chartAccounts)
      ? rawProfile.chartAccounts
      : [];
  const reviewRulesPayload = Array.isArray(rawProfile.reviewRules?.rules)
    ? rawProfile.reviewRules.rules
    : Array.isArray(rawProfile.reviewRules)
      ? rawProfile.reviewRules
      : [];

  return {
    id: normalizedId,
    name: normalizedName,
    createdAt: coercePersistedRuleString(rawProfile.createdAt) || new Date().toISOString(),
    updatedAt: coercePersistedRuleString(rawProfile.updatedAt) || new Date().toISOString(),
    chartOfAccounts: {
      version: Number.parseInt(rawProfile.chartOfAccounts?.version || `${CHART_OF_ACCOUNTS_STORE_VERSION}`, 10) || CHART_OF_ACCOUNTS_STORE_VERSION,
      updatedAt: coercePersistedRuleString(rawProfile.chartOfAccounts?.updatedAt) || null,
      accounts: mergeChartAccountEntries(chartAccountsPayload),
    },
    reviewRules: {
      version: Number.parseInt(rawProfile.reviewRules?.version || `${REVIEW_RULES_STORE_VERSION}`, 10) || REVIEW_RULES_STORE_VERSION,
      updatedAt: coercePersistedRuleString(rawProfile.reviewRules?.updatedAt) || null,
      rules: reviewRulesPayload
        .map((rule, ruleIndex) => normalizePersistedReviewRule(rule, ruleIndex))
        .filter(Boolean),
    },
  };
}

function buildSeedCompanyProfiles() {
  const legacyChartAccounts = Array.isArray(legacyChartOfAccountsStore?.accounts)
    ? legacyChartOfAccountsStore.accounts
    : [];
  const legacyReviewRules = Array.isArray(legacyReviewRuleStore?.rules)
    ? legacyReviewRuleStore.rules
    : [];

  return [
    createInitialCompanyProfile({
      id: 'default_company',
      name: 'Default Company',
      chartAccounts: legacyChartAccounts,
      reviewRules: legacyReviewRules,
    }),
  ];
}

function loadCompanyProfilesStore(filePath) {
  if (!fs.existsSync(filePath)) {
    const companies = buildSeedCompanyProfiles();
    return {
      ...createEmptyCompanyProfilesStore(),
      defaultCompanyId: companies[0]?.id || null,
      companies,
    };
  }

  try {
    const rawPayload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const companies = Array.isArray(rawPayload?.companies)
      ? rawPayload.companies
        .map((company, index) => normalizeCompanyProfile(company, index))
        .filter(Boolean)
      : [];
    const hydratedCompanies = companies.length > 0 ? companies : buildSeedCompanyProfiles();
    const requestedDefaultCompanyId = normalizeCompanyId(rawPayload?.defaultCompanyId);
    const defaultCompanyId = hydratedCompanies.some((company) => company.id === requestedDefaultCompanyId)
      ? requestedDefaultCompanyId
      : hydratedCompanies[0]?.id || null;

    return {
      version: Number.parseInt(rawPayload?.version || `${COMPANY_PROFILES_STORE_VERSION}`, 10) || COMPANY_PROFILES_STORE_VERSION,
      updatedAt: coercePersistedRuleString(rawPayload?.updatedAt) || null,
      defaultCompanyId,
      companies: hydratedCompanies,
    };
  } catch (err) {
    console.error(`Could not load company profiles from ${filePath}:`, err.message);
    const companies = buildSeedCompanyProfiles();
    return {
      ...createEmptyCompanyProfilesStore(),
      defaultCompanyId: companies[0]?.id || null,
      companies,
    };
  }
}

function writeCompanyProfilesStore(filePath, store) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2));
}

let companyProfilesStore = loadCompanyProfilesStore(COMPANY_PROFILES_STORE_PATH);

function getCompanyProfiles() {
  return Array.isArray(companyProfilesStore?.companies) ? companyProfilesStore.companies : [];
}

function getDefaultCompanyProfile() {
  const companies = getCompanyProfiles();
  return companies.find((company) => company.id === companyProfilesStore?.defaultCompanyId) || companies[0] || null;
}

function resolveCompanyProfile(companyId = '') {
  const normalizedId = normalizeCompanyId(companyId);
  if (normalizedId) {
    const matched = getCompanyProfiles().find((company) => company.id === normalizedId);
    if (matched) return matched;
  }

  return getDefaultCompanyProfile();
}

function getCompanyProfileOrThrow(companyId = '') {
  const companyProfile = resolveCompanyProfile(companyId);
  if (!companyProfile) {
    throw new Error('Company profile not found');
  }
  return companyProfile;
}

function saveCompanyProfilesStore() {
  const normalizedCompanies = getCompanyProfiles()
    .map((company, index) => normalizeCompanyProfile(company, index))
    .filter(Boolean);
  const defaultCompanyId = normalizedCompanies.some((company) => company.id === companyProfilesStore?.defaultCompanyId)
    ? companyProfilesStore.defaultCompanyId
    : normalizedCompanies[0]?.id || null;

  companyProfilesStore = {
    version: COMPANY_PROFILES_STORE_VERSION,
    updatedAt: new Date().toISOString(),
    defaultCompanyId,
    companies: normalizedCompanies,
  };

  writeCompanyProfilesStore(COMPANY_PROFILES_STORE_PATH, companyProfilesStore);
}

function updateCompanyProfileStore(companyId, updater) {
  const companies = [...getCompanyProfiles()];
  const targetId = getCompanyProfileOrThrow(companyId).id;
  const companyIndex = companies.findIndex((company) => company.id === targetId);
  if (companyIndex === -1) {
    throw new Error('Company profile not found');
  }

  const currentCompany = companies[companyIndex];
  const nextCompany = updater(currentCompany);
  companies[companyIndex] = normalizeCompanyProfile({
    ...nextCompany,
    id: currentCompany.id,
    createdAt: currentCompany.createdAt,
    updatedAt: new Date().toISOString(),
  }, companyIndex);
  companyProfilesStore = {
    ...companyProfilesStore,
    companies,
  };
  saveCompanyProfilesStore();
  return companies[companyIndex];
}

function serializeCompanyProfileSummary(companyProfile) {
  const chartAccounts = getConfiguredProfessionalVerifierClassifications(companyProfile, { includeDisabled: true });
  const reviewRules = Array.isArray(companyProfile?.reviewRules?.rules) ? companyProfile.reviewRules.rules : [];

  return {
    id: companyProfile.id,
    name: companyProfile.name,
    isDefault: companyProfilesStore?.defaultCompanyId === companyProfile.id,
    activeChartAccountCount: chartAccounts.filter((entry) => entry.enabled !== false).length,
    customChartAccountCount: chartAccounts.filter((entry) => !entry.builtIn).length,
    activeReviewRuleCount: reviewRules.filter((rule) => rule.enabled !== false).length,
    totalReviewRuleCount: reviewRules.length,
    createdAt: companyProfile.createdAt,
    updatedAt: companyProfile.updatedAt,
  };
}

function getCompaniesPayload(selectedCompanyId = '') {
  const resolvedCompany = resolveCompanyProfile(selectedCompanyId);
  const defaultCompany = getDefaultCompanyProfile();

  return {
    companies: getCompanyProfiles().map(serializeCompanyProfileSummary),
    defaultCompanyId: defaultCompany?.id || null,
    selectedCompanyId: resolvedCompany?.id || null,
  };
}

function createCompanyProfile(rawPayload = {}) {
  const name = normalizeWhitespace(rawPayload?.name);
  if (!name) {
    throw new Error('Company name is required');
  }

  const normalizedName = name.slice(0, 120);
  const companies = [...getCompanyProfiles()];
  const nameFingerprint = normalizedName.toUpperCase();
  if (companies.some((company) => company.name.toUpperCase() === nameFingerprint)) {
    throw new Error('A company with that name already exists');
  }

  const timestamp = new Date().toISOString();
  const baseId = normalizeCompanyId(`company_${normalizedName}`) || `company_${companies.length + 1}`;
  let nextId = baseId;
  let suffix = 2;
  while (companies.some((company) => company.id === nextId)) {
    nextId = `${baseId}_${suffix}`;
    suffix += 1;
  }

  const newCompany = normalizeCompanyProfile({
    id: nextId,
    name: normalizedName,
    createdAt: timestamp,
    updatedAt: timestamp,
    chartOfAccounts: {
      version: CHART_OF_ACCOUNTS_STORE_VERSION,
      updatedAt: timestamp,
      accounts: createDefaultChartAccountEntries(),
    },
    reviewRules: createEmptyReviewRuleStore(),
  }, companies.length);

  companyProfilesStore = {
    ...companyProfilesStore,
    defaultCompanyId: companyProfilesStore?.defaultCompanyId || newCompany.id,
    companies: [...companies, newCompany],
  };
  saveCompanyProfilesStore();
  return newCompany;
}

const CATEGORY_TO_PNL_DEFAULTS = {
  Advertising: { section: 'Cost of Goods Sold', group: 'Advertising and Promotion', account: 'Advertising and Promotion' },
  'Car and truck expenses': { section: 'Expenses', group: 'Auto Expense', account: 'Auto Expense' },
  'Commissions and fees': { section: 'Expenses', group: 'Commissions and Fees', account: 'Commissions and Fees' },
  'Contract labor (Subcontractors)': { section: 'Cost of Goods Sold', group: 'Subcontractors', account: 'Subcontractors' },
  'Depletion / Depreciation': { section: 'Expenses', group: 'Depreciation', account: 'Depreciation' },
  'Employee benefit programs': { section: 'Expenses', group: 'Employee Benefits', account: 'Employee Benefits' },
  Insurance: { section: 'Expenses', group: 'Insurance Expense', account: 'Insurance Expense' },
  Interest: { section: 'Other Expenses', group: 'Interest Expense', account: 'Interest Expense' },
  'Legal and professional services': { section: 'Expenses', group: 'Legal & Professional Fees', account: 'Legal & Professional Fees' },
  'Office expense': { section: 'Expenses', group: 'Office Expense', account: 'Office Expense' },
  'Pension and profit-sharing plans': { section: 'Expenses', group: 'Pension and Profit Sharing', account: 'Pension and Profit Sharing' },
  'Rent or lease': { section: 'Expenses', group: 'Rent and Lease', account: 'Rent and Lease' },
  'Repairs and maintenance': { section: 'Expenses', group: 'Repair and Maintenance', account: 'Repair and Maintenance' },
  Supplies: { section: 'Expenses', group: 'Supplies', account: 'Supplies' },
  'Taxes and licenses': { section: 'Expenses', group: 'Business and Permits', account: 'Business and Permits' },
  'Travel and meals': { section: 'Expenses', group: 'Travel Expense', account: 'Travel and Meals' },
  Utilities: { section: 'Expenses', group: 'Utilities', account: 'Utilities' },
  Wages: { section: 'Expenses', group: 'Payroll', account: 'Wages' },
  'Other expenses': { section: 'Expenses', group: 'Other Expense', account: 'Other Expense' },
  Income: { section: 'Income', group: 'Sales', account: 'Sales' },
};

const SIMPLE_EXTRACTION_PROMPT = `You are an expert tax accountant and bank statement parser. Analyze this bank statement PDF and extract EVERY transaction plus statement-level metadata.

Return exactly ONE valid JSON object with this shape:
{
  "statementMeta": {
    "institution": "",
    "accountName": "",
    "accountType": "",
    "accountLast4": "",
    "statementStartDate": "",
    "statementEndDate": "",
    "openingBalance": null,
    "closingBalance": null,
    "currency": "USD"
  },
  "transactions": [
    {
      "date": "",
      "description": "",
      "amount": 0,
      "type": "deposit",
      "category": "Income"
    }
  ]
}

For statementMeta:
- institution: bank or card issuer name if visible
- accountName: the statement's account label if visible
- accountType: one of "Checking", "Savings", "Credit Card", "Loan", or "Other"
- accountLast4: last 4 digits only when visible
- statementStartDate and statementEndDate: use MM/DD/YYYY when visible
- openingBalance and closingBalance: numeric values when visible, otherwise null
- currency: 3-letter code like "USD" when visible, otherwise "USD"

For each transaction, return:
- date: the transaction date exactly as shown or normalized to MM/DD/YYYY when possible
- description: the transaction description/memo (keep original wording, but normalize whitespace)
- amount: the absolute numeric amount (no currency symbols, no commas - just a number like 1234.56)
- type: either "deposit" or "deduction"
- category: assign the transaction to exactly ONE of the following standard IRS Schedule C categories:
  [${SCHEDULE_C_CATEGORIES.join(', ')}]

IMPORTANT RULES:
1. Extract ALL transactions - do not skip any
2. A deposit is money coming IN. Use category "Income" or "Other expenses" (if refund).
3. A deduction is money going OUT. Choose the most accurate category from the list above.
4. If a transaction description appears multiple times, keep the EXACT same description text for all occurrences so they can be grouped later
5. Normalize descriptions only enough to remove extra whitespace or obvious unique references
6. If statement metadata is not visible, use empty strings or nulls instead of guessing
7. Return ONLY the JSON object, no markdown, no prose.

Example output:
{
  "statementMeta": {
    "institution": "Chase",
    "accountName": "Business Complete Checking",
    "accountType": "Checking",
    "accountLast4": "8277",
    "statementStartDate": "01/01/2025",
    "statementEndDate": "01/31/2025",
    "openingBalance": 12450.32,
    "closingBalance": 18320.10,
    "currency": "USD"
  },
  "transactions": [
    {"date": "01/15/2025", "description": "EMPLOYER INC DIRECT DEPOSIT", "amount": 3500.00, "type": "deposit", "category": "Income"},
    {"date": "01/16/2025", "description": "AMAZON.COM", "amount": 45.99, "type": "deduction", "category": "Office expense"}
  ]
}`;

const PROFESSIONAL_EXTRACTION_PROMPT = `You are an expert bookkeeper and bank statement parser preparing a professional cash-basis profit and loss statement. Analyze this bank statement PDF and extract EVERY transaction plus statement-level metadata.

Return exactly ONE valid JSON object with this shape:
{
  "statementMeta": {
    "institution": "",
    "accountName": "",
    "accountType": "",
    "accountLast4": "",
    "statementStartDate": "",
    "statementEndDate": "",
    "openingBalance": null,
    "closingBalance": null,
    "currency": "USD"
  },
  "transactions": [
    {
      "date": "",
      "description": "",
      "amount": 0,
      "type": "deposit",
      "category": "",
      "plSection": "",
      "plGroup": "",
      "plAccount": ""
    }
  ]
}

For statementMeta:
- institution: bank or card issuer name if visible
- accountName: the statement's account label if visible
- accountType: one of "Checking", "Savings", "Credit Card", "Loan", or "Other"
- accountLast4: last 4 digits only when visible
- statementStartDate and statementEndDate: use MM/DD/YYYY when visible
- openingBalance and closingBalance: numeric values when visible, otherwise null
- currency: 3-letter code like "USD" when visible, otherwise "USD"

For each transaction, return:
- date: the transaction date exactly as shown or normalized to MM/DD/YYYY when possible
- description: the transaction description or memo (normalize whitespace and remove obvious unique reference numbers)
- amount: the absolute numeric amount (no currency symbols, no commas - just a number like 1234.56)
- type: either "deposit" or "deduction"
- category: choose exactly ONE of these Schedule C categories:
  [${SCHEDULE_C_CATEGORIES.join(', ')}]
- plSection: choose exactly ONE of ["Income", "Cost of Goods Sold", "Expenses", "Other Income", "Other Expenses", "Ignore"]
- plGroup: a concise parent P&L line such as "Sales", "Advertising and Promotion", "Subcontractors", "Travel Expense", "Office Expense", "Bank Charge service"
- plAccount: a concise detail account under that group such as "Sales", "Facebook", "Google ADS", "Lead Generation", "Airfare", "Lodging", "Taxi & Rideshare", or the same text as plGroup when no detail split is needed

IMPORTANT RULES:
1. Extract ALL transactions - do not skip any
2. Deposits are not always sales. Refunds, loan proceeds, owner contributions, and internal transfers must not be classified as sales.
3. Deductions are not always P&L expenses. Credit card payments, internal transfers, owner draws, and balance-sheet activity should use plSection "Ignore".
4. Use cash-basis P&L logic. Direct fulfillment costs like subcontractors may be Cost of Goods Sold. Overhead should usually be Expenses.
5. Keep plGroup and plAccount naming consistent across repeated vendors so the final statement can group them cleanly.
6. If statement metadata is not visible, use empty strings or nulls instead of guessing.
7. Return ONLY the JSON object, no markdown, no prose.

Example output:
{
  "statementMeta": {
    "institution": "Chase",
    "accountName": "Ink Business Preferred",
    "accountType": "Credit Card",
    "accountLast4": "9286",
    "statementStartDate": "01/01/2025",
    "statementEndDate": "01/31/2025",
    "openingBalance": 8421.15,
    "closingBalance": 10122.78,
    "currency": "USD"
  },
  "transactions": [
    {"date": "01/15/2025", "description": "CLIENT PAYMENT STRIPE", "amount": 12000.00, "type": "deposit", "category": "Income", "plSection": "Income", "plGroup": "Sales", "plAccount": "Sales"},
    {"date": "01/16/2025", "description": "FACEBK ADS", "amount": 4500.00, "type": "deduction", "category": "Advertising", "plSection": "Expenses", "plGroup": "Advertising and Promotion", "plAccount": "Facebook"},
    {"date": "01/17/2025", "description": "ONLINE TRANSFER TO SAVINGS", "amount": 3000.00, "type": "deduction", "category": "Other expenses", "plSection": "Ignore", "plGroup": "Transfers", "plAccount": "Internal Transfer"}
  ]
}`;

const IGNORE_PATTERNS = [
  /\bTRANSFER\b/i,
  /\bXFER\b/i,
  /\bPAYMENT THANK YOU\b/i,
  /\bCREDIT CARD PAYMENT\b/i,
  /\bCARDMEMBER SERVICE\b/i,
  /\bAMEX EPAYMENT\b/i,
  /\bLOAN PROCEEDS?\b/i,
  /\bCAPITAL CONTRIBUTION\b/i,
  /\bOWNER (DRAW|DISTRIBUTION|PAYMENT)\b/i,
  /\bINTERNAL TRANSFER\b/i,
];

const REVIEW_FINGERPRINT_STOPWORDS = new Set([
  'THE',
  'AND',
  'FOR',
  'WITH',
  'FROM',
  'THIS',
  'THAT',
  'YOUR',
]);

const TRANSFER_FINGERPRINT_STOPWORDS = new Set([
  ...REVIEW_FINGERPRINT_STOPWORDS,
  'ONLINE',
  'DOMESTIC',
  'INTERNATIONAL',
  'WIRE',
  'TRANSFER',
  'TRANSFERS',
  'FUNDS',
  'PAYMENT',
  'PAYMENTS',
  'VIA',
  'BANK',
  'BANKING',
  'SAME',
  'DAY',
  'COMMUNITY',
  'FSB',
  'BANK',
  'NEW',
  'YORK',
  'MELLON',
  'BANCO',
  'DEL',
  'PACIFICO',
  'GUAYAQUIL',
  'ECUADOR',
  'THANK',
  'YOU',
  'ACCOUNT',
  'ACCT',
]);

const TRANSFER_BENEFICIARY_PATTERNS = [
  /\bBEN(?:EFICIARY)?\s*:?\s*(.+?)(?=\b(?:REF|REFERENCE|A\/C|ACCOUNT|ACCT|ABA|SWIFT|ROUTING|IMAD|OMAD|TRN|FED REF)\b[: ]|$)/i,
  /\bB\/O\s*:?\s*(.+?)(?=\b(?:REF|REFERENCE|A\/C|ACCOUNT|ACCT|ABA|SWIFT|ROUTING|IMAD|OMAD|TRN|FED REF)\b[: ]|$)/i,
  /\bTO\s+(.+?)(?=\b(?:REF|REFERENCE|A\/C|ACCOUNT|ACCT|ABA|SWIFT|ROUTING|IMAD|OMAD|TRN|FED REF)\b[: ]|$)/i,
];

const TRANSFER_REFERENCE_PATTERNS = [
  /\bREF(?:ERENCE)?\s*:?\s*(.+?)$/i,
];

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF files are allowed'));
  },
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn('WARNING: GEMINI_API_KEY is not set!');
}

function normalizeAnalysisMode(value) {
  return value === PROFESSIONAL_MODE ? PROFESSIONAL_MODE : SIMPLE_MODE;
}

function normalizeProfessionalReviewMode(value) {
  return value === PROFESSIONAL_REVIEW_STRICT
    ? PROFESSIONAL_REVIEW_STRICT
    : PROFESSIONAL_REVIEW_STANDARD;
}

function isStrictProfessionalReviewMode(value) {
  return normalizeProfessionalReviewMode(value) === PROFESSIONAL_REVIEW_STRICT;
}

function normalizeWhitespace(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function roundCurrency(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function formatCurrency(value) {
  return `$${(Number(value) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedCurrency(value) {
  const amount = Number(value) || 0;
  const absolute = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-$${absolute}` : `$${absolute}`;
}

function normalizeDescription(value) {
  return normalizeWhitespace(value) || 'UNKNOWN';
}

function toDisplayTitleCase(value) {
  const uppercaseWords = new Set([
    'ACH',
    'ADS',
    'AMA',
    'ATM',
    'BOA',
    'CC',
    'CK',
    'LLC',
    'LP',
    'PPC',
    'POS',
    'SA',
    'SEM',
    'USA',
  ]);

  return normalizeWhitespace(value)
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const cleanedWord = word.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');
      const upperWord = cleanedWord.toUpperCase();

      if (!cleanedWord) return word;
      if (uppercaseWords.has(upperWord) || /^[A-Z0-9]{2,5}$/.test(cleanedWord)) {
        return upperWord;
      }

      return cleanedWord.charAt(0).toUpperCase() + cleanedWord.slice(1).toLowerCase();
    })
    .join(' ');
}

function canonicalizeInstitutionName(value = '') {
  const normalized = normalizeWhitespace(value);
  const upperValue = normalized.toUpperCase();

  if (!upperValue) return '';
  if (/JP\s*MORGAN|JPMORGAN|CHASE/.test(upperValue)) return 'Chase';
  if (/SAPPHIRE|INK\s+BUSINESS|INK\b|CHASE BUSINESS/.test(upperValue)) return 'Chase';
  if (/AMEX|AMERICAN EXPRESS/.test(upperValue)) return 'Amex';
  if (/WELLS FARGO/.test(upperValue)) return 'Wells Fargo';
  if (/BANK OF AMERICA|BOFA/.test(upperValue)) return 'Bank of America';
  if (/BANCO DEL PACIFICO/.test(upperValue)) return 'Banco del Pacifico';
  if (/CAPITAL ONE/.test(upperValue)) return 'Capital One';
  return toDisplayTitleCase(normalized);
}

function getSourceFileBaseLabel(sourceFile = '') {
  return normalizeWhitespace(path.parse(sourceFile || '').name.replace(/[-_]+/g, ' '));
}

function cleanSourceFileStem(sourceFile = '') {
  return normalizeWhitespace(
    getSourceFileBaseLabel(sourceFile)
      .replace(/^\d{10,}\s+/, ' ')
      .replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/gi, ' ')
      .replace(/\b(?:JAN|JANUARY|FEB|FEBRUARY|MAR|MARCH|APR|APRIL|MAY|JUN|JUNE|JUL|JULY|AUG|AUGUST|SEP|SEPT|SEPTEMBER|OCT|OCTOBER|NOV|NOVEMBER|DEC|DECEMBER)\b/gi, ' ')
      .replace(/\b20\d{2}\b/g, ' ')
      .replace(/\b(?:COPY|FINAL|UPDATED|UPDATE|DRAFT|EXPORT|DOWNLOADED)\b/gi, ' ')
      .replace(/\b(?:REPORT|REPORTS|STATEMENT|STATEMENTS|DOCUMENT|DOCUMENTS|FILE|FILES)\b/gi, ' ')
  );
}

function inferYearFromSourceFile(sourceFile = '') {
  const upperSource = normalizeWhitespace(sourceFile).toUpperCase();
  const match = upperSource.match(/\b(20\d{2})\b/);
  return match ? parseInt(match[1], 10) : null;
}

function normalizeTransactionDate(value, sourceFile = '') {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';

  if (/^\d{1,2}\/\d{1,2}$/.test(normalized)) {
    const inferredYear = inferYearFromSourceFile(sourceFile);
    if (inferredYear) {
      const [month, day] = normalized.split('/');
      return `${month.padStart(2, '0')}/${day.padStart(2, '0')}/${inferredYear}`;
    }
  }

  return normalized;
}

function normalizeFingerprintSource(value) {
  return normalizeWhitespace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function tokenizeFingerprint(value, stopwords = REVIEW_FINGERPRINT_STOPWORDS) {
  const normalized = normalizeFingerprintSource(value)
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\b(?:IMAD|OMAD|TRN|TRACE|CONFIRMATION|CONF|REFERENCE|REF|ACCOUNT|ACCT|A\/C|ROUTING|ABA|SWIFT)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ');

  const tokens = [];
  const seen = new Set();

  for (const token of normalized.split(/\s+/)) {
    if (!token || token.length < 3 || /^\d+$/.test(token) || stopwords.has(token) || seen.has(token)) {
      continue;
    }

    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

function buildDescriptionFingerprint(value) {
  return tokenizeFingerprint(value).slice(0, 12).join(' ');
}

function extractRegexSegment(value, patterns) {
  const source = normalizeWhitespace(value);

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match?.[1]) continue;

    const cleaned = normalizeWhitespace(match[1]).replace(/^[\s:;,-]+|[\s:;,-]+$/g, '');
    if (cleaned) return cleaned;
  }

  return '';
}

function buildTransferBeneficiary(value) {
  return extractRegexSegment(value, TRANSFER_BENEFICIARY_PATTERNS);
}

function buildTransferReference(value) {
  return extractRegexSegment(value, TRANSFER_REFERENCE_PATTERNS);
}

function buildTransferFingerprint(value) {
  const beneficiary = buildTransferBeneficiary(value);
  const beneficiaryFingerprint = beneficiary
    ? tokenizeFingerprint(beneficiary, TRANSFER_FINGERPRINT_STOPWORDS).slice(0, 8).join(' ')
    : '';

  if (beneficiaryFingerprint) {
    return {
      key: `BEN::${beneficiaryFingerprint}`,
      label: beneficiary,
    };
  }

  const reference = buildTransferReference(value);
  const referenceFingerprint = reference
    ? tokenizeFingerprint(reference, TRANSFER_FINGERPRINT_STOPWORDS).slice(0, 8).join(' ')
    : '';

  if (referenceFingerprint) {
    return {
      key: `REF::${referenceFingerprint}`,
      label: reference,
    };
  }

  const genericFingerprint = tokenizeFingerprint(value, TRANSFER_FINGERPRINT_STOPWORDS).slice(0, 10).join(' ');
  return {
    key: genericFingerprint ? `GEN::${genericFingerprint}` : `RAW::${normalizeFingerprintSource(value)}`,
    label: beneficiary || reference || normalizeDescription(value),
  };
}

function buildReviewBucketInfo(signalType, tx) {
  if (signalType === 'transfer_review') {
    return buildTransferFingerprint(tx.description);
  }

  const descriptionFingerprint = buildDescriptionFingerprint(tx.description);
  return {
    key: descriptionFingerprint || normalizeFingerprintSource(tx.description),
    label: normalizeDescription(tx.description),
  };
}

function buildReviewRuleCompositeKey(ruleType, bucketKey, transactionType = 'unknown') {
  return `${ruleType}::${transactionType || 'unknown'}::${bucketKey}`;
}

function buildPersistedReviewRuleMatch(questionType, tx) {
  if (!tx || !questionType) return null;

  if (questionType === 'transfer_review') {
    const bucketInfo = buildReviewBucketInfo('transfer_review', tx);
    return bucketInfo.key
      ? {
        ruleType: 'transfer_cluster',
        bucketKey: bucketInfo.key,
        bucketLabel: bucketInfo.label,
        transactionType: tx.type || 'unknown',
      }
      : null;
  }

  if (questionType === 'refund_review') {
    const bucketInfo = buildReviewBucketInfo('refund_review', tx);
    return bucketInfo.key
      ? {
        ruleType: 'refund_cluster',
        bucketKey: bucketInfo.key,
        bucketLabel: bucketInfo.label,
        transactionType: tx.type || 'unknown',
      }
      : null;
  }

  if (['category_conflict', 'generic_review', 'verifier_category_review'].includes(questionType)) {
    const bucketInfo = buildReviewBucketInfo('verifier_category_review', tx);
    return bucketInfo.key
      ? {
        ruleType: 'classification_cluster',
        bucketKey: bucketInfo.key,
        bucketLabel: bucketInfo.label,
        transactionType: tx.type || 'unknown',
      }
      : null;
  }

  return null;
}

function buildPersistedReviewRuleCandidates(tx) {
  const candidates = [];
  const transferCandidate = buildPersistedReviewRuleMatch('transfer_review', tx);
  const refundCandidate = buildPersistedReviewRuleMatch('refund_review', tx);
  const classificationCandidate = buildPersistedReviewRuleMatch('verifier_category_review', tx);

  if (transferCandidate) candidates.push(transferCandidate);
  if (tx.type === 'deposit' && refundCandidate) candidates.push(refundCandidate);
  if (classificationCandidate) candidates.push(classificationCandidate);

  return candidates;
}

function getCompanyReviewRuleStore(companyProfile = null) {
  return companyProfile?.reviewRules && typeof companyProfile.reviewRules === 'object'
    ? companyProfile.reviewRules
    : createEmptyReviewRuleStore();
}

function findPersistedReviewRuleForTransaction(tx, companyProfile = null) {
  const reviewRuleStore = getCompanyReviewRuleStore(companyProfile);
  const rules = Array.isArray(reviewRuleStore?.rules)
    ? reviewRuleStore.rules.filter((rule) => rule.enabled !== false)
    : [];
  if (rules.length === 0) return null;

  for (const candidate of buildPersistedReviewRuleCandidates(tx)) {
    const compositeKey = buildReviewRuleCompositeKey(candidate.ruleType, candidate.bucketKey, candidate.transactionType);
    const matchedRule = rules.find((rule) => buildReviewRuleCompositeKey(rule.ruleType, rule.bucketKey, rule.transactionType) === compositeKey);
    if (matchedRule) {
      return {
        ...candidate,
        rule: matchedRule,
      };
    }
  }

  return null;
}

function canonicalizePersistedRuleClassification(classification, tx) {
  if (!classification || typeof classification !== 'object') return null;

  if (classification.plSection === 'Ignore') {
    return {
      plSection: 'Ignore',
      plGroup: normalizeWhitespace(classification.plGroup) || 'Transfers',
      plAccount: normalizeWhitespace(classification.plAccount) || 'Internal Transfer',
      category: normalizeWhitespace(classification.category),
    };
  }

  const canonical = canonicalizeProfitAndLossGrouping(
    classification.plSection,
    classification.plGroup,
    classification.plAccount,
    tx.description,
  );

  return {
    plSection: canonical.section,
    plGroup: canonical.group,
    plAccount: canonical.account,
    category: normalizeWhitespace(classification.category),
  };
}

function applyPersistedReviewRules(transactions, companyProfile = null) {
  const reviewRuleStore = getCompanyReviewRuleStore(companyProfile);
  const appliedRuleIds = new Set();
  let appliedTransactionCount = 0;

  for (const tx of transactions) {
    const matched = findPersistedReviewRuleForTransaction(tx, companyProfile);
    if (!matched?.rule) continue;

    const nextClassification = canonicalizePersistedRuleClassification(matched.rule.classification, tx);
    if (!nextClassification) continue;

    tx.plSection = nextClassification.plSection;
    tx.plGroup = nextClassification.plGroup;
    tx.plAccount = nextClassification.plAccount;
    if (nextClassification.category) {
      tx.category = nextClassification.category;
    }

    tx.classificationMeta = {
      ...tx.classificationMeta,
      savedRuleApplied: true,
      savedRuleId: matched.rule.id,
      savedRuleType: matched.rule.ruleType,
      savedRuleQuestionType: matched.rule.questionType,
      savedRuleBucketKey: matched.rule.bucketKey,
      savedRuleBucketLabel: matched.rule.bucketLabel || matched.bucketLabel,
      savedRuleAnswerKey: matched.rule.answerKey,
      savedRuleAnswerLabel: matched.rule.answerLabel,
      inferenceSource: 'saved_review_rule',
      inferenceReason: `saved_review_rule:${matched.rule.id}`,
      finalSection: nextClassification.plSection,
      finalGroup: nextClassification.plGroup,
      finalAccount: nextClassification.plAccount,
    };

    appliedTransactionCount += 1;
    appliedRuleIds.add(matched.rule.id);
  }

  return {
    availableRuleCount: Array.isArray(reviewRuleStore?.rules) ? reviewRuleStore.rules.length : 0,
    appliedTransactionCount,
    appliedRuleCount: appliedRuleIds.size,
    appliedRuleIds: Array.from(appliedRuleIds),
  };
}

function upsertPersistedReviewRule(rulePayload, companyId) {
  const companyProfile = getCompanyProfileOrThrow(companyId);
  const reviewRuleStore = getCompanyReviewRuleStore(companyProfile);
  const rules = Array.isArray(reviewRuleStore?.rules) ? [...reviewRuleStore.rules] : [];
  const compositeKey = buildReviewRuleCompositeKey(rulePayload.ruleType, rulePayload.bucketKey, rulePayload.transactionType);
  const existingIndex = rules.findIndex((rule) => buildReviewRuleCompositeKey(rule.ruleType, rule.bucketKey, rule.transactionType) === compositeKey);
  const timestamp = new Date().toISOString();

  if (existingIndex >= 0) {
    const existingRule = rules[existingIndex];
    rules[existingIndex] = {
      ...existingRule,
      ...rulePayload,
      id: existingRule.id,
      createdAt: existingRule.createdAt,
      updatedAt: timestamp,
      enabled: typeof rulePayload.enabled === 'boolean' ? rulePayload.enabled : existingRule.enabled !== false,
      timesConfirmed: (existingRule.timesConfirmed || 1) + 1,
    };
    const updatedCompany = updateCompanyProfileStore(companyId, (currentCompany) => ({
      ...currentCompany,
      reviewRules: {
        ...getCompanyReviewRuleStore(currentCompany),
        updatedAt: timestamp,
        rules,
      },
    }));
    const updatedRules = getCompanyReviewRuleStore(updatedCompany).rules;
    return { action: 'updated', rule: updatedRules[existingIndex] };
  }

  const newRule = {
    ...rulePayload,
    id: `review_rule_${Date.now()}_${rules.length + 1}`,
    enabled: typeof rulePayload.enabled === 'boolean' ? rulePayload.enabled : true,
    createdAt: timestamp,
    updatedAt: timestamp,
    timesConfirmed: 1,
  };

  updateCompanyProfileStore(companyId, (currentCompany) => ({
    ...currentCompany,
    reviewRules: {
      ...getCompanyReviewRuleStore(currentCompany),
      updatedAt: timestamp,
      rules: [...rules, newRule],
    },
  }));
  return { action: 'created', rule: newRule };
}

function persistAppliedReviewRules(reviewState, answers) {
  const companyProfile = getCompanyProfileOrThrow(reviewState.companyId);
  const answerMap = new Map(normalizeReviewAnswersPayload(answers).map((answer) => [answer.questionId, answer.optionKey]));
  let createdRuleCount = 0;
  let updatedRuleCount = 0;

  for (const question of reviewState.questions) {
    const selectedOptionKey = answerMap.get(question.id);
    if (!selectedOptionKey) continue;

    const selectedOption = question.options.find((option) => option.key === selectedOptionKey);
    if (!selectedOption?.override) continue;

    const firstTransaction = question.transactionIndexes
      .map((transactionIndex) => reviewState.transactions[transactionIndex])
      .find(Boolean);
    const match = buildPersistedReviewRuleMatch(question.type, firstTransaction);
    if (!match?.bucketKey) continue;

    const normalizedClassification = canonicalizePersistedRuleClassification(selectedOption.override, firstTransaction);
    if (!normalizedClassification) continue;
    const classificationId = findChartAccountIdForClassification(normalizedClassification, companyProfile);

    const outcome = upsertPersistedReviewRule({
      ruleType: match.ruleType,
      bucketKey: match.bucketKey,
      bucketLabel: question.clusterLabel || match.bucketLabel || question.title,
      transactionType: match.transactionType,
      questionType: question.type,
      answerKey: selectedOption.key,
      answerLabel: selectedOption.label,
      classificationId,
      classification: normalizedClassification,
      sampleDescriptions: Array.isArray(question.sampleDescriptions) ? question.sampleDescriptions.slice(0, 3) : [],
    }, reviewState.companyId);

    if (outcome.action === 'created') createdRuleCount += 1;
    if (outcome.action === 'updated') updatedRuleCount += 1;
  }

  return {
    createdRuleCount,
    updatedRuleCount,
    savedRuleCount: createdRuleCount + updatedRuleCount,
    availableRuleCount: Array.isArray(getCompanyReviewRuleStore(getCompanyProfileOrThrow(reviewState.companyId))?.rules)
      ? getCompanyReviewRuleStore(getCompanyProfileOrThrow(reviewState.companyId)).rules.length
      : 0,
  };
}

function serializeReviewRule(rule, companyProfile = null) {
  const classificationId = rule.classificationId || findChartAccountIdForClassification(rule.classification, companyProfile);
  return {
    id: rule.id,
    ruleType: rule.ruleType,
    bucketKey: rule.bucketKey,
    bucketLabel: rule.bucketLabel || '',
    transactionType: rule.transactionType || 'unknown',
    questionType: rule.questionType || '',
    answerKey: rule.answerKey || '',
    answerLabel: rule.answerLabel || '',
    classificationId,
    classification: rule.classification,
    classificationLabel: buildClassificationLabel(
      rule.classification?.plSection,
      rule.classification?.plGroup,
      rule.classification?.plAccount,
    ),
    sampleDescriptions: Array.isArray(rule.sampleDescriptions) ? rule.sampleDescriptions : [],
    enabled: rule.enabled !== false,
    timesConfirmed: rule.timesConfirmed || 1,
    createdAt: rule.createdAt || null,
    updatedAt: rule.updatedAt || null,
  };
}

function getProfessionalSettingsPayload(companyProfile = null) {
  const resolvedCompanyProfile = companyProfile || getDefaultCompanyProfile();
  const chartAccounts = getConfiguredProfessionalVerifierClassifications(resolvedCompanyProfile, { includeDisabled: true }).map(serializeChartAccountEntry);
  const reviewRuleStore = getCompanyReviewRuleStore(resolvedCompanyProfile);
  const reviewRules = (Array.isArray(reviewRuleStore?.rules) ? reviewRuleStore.rules : [])
    .map((rule) => serializeReviewRule(rule, resolvedCompanyProfile))
    .sort((a, b) => {
      if ((a.enabled === false) !== (b.enabled === false)) return a.enabled === false ? 1 : -1;
      if ((b.timesConfirmed || 0) !== (a.timesConfirmed || 0)) return (b.timesConfirmed || 0) - (a.timesConfirmed || 0);
      return (a.bucketLabel || a.id).localeCompare(b.bucketLabel || b.id);
    });

  return {
    company: serializeCompanyProfileSummary(resolvedCompanyProfile),
    summary: {
      activeChartAccountCount: chartAccounts.filter((entry) => entry.enabled).length,
      totalChartAccountCount: chartAccounts.length,
      customChartAccountCount: chartAccounts.filter((entry) => !entry.builtIn).length,
      activeReviewRuleCount: reviewRules.filter((rule) => rule.enabled).length,
      totalReviewRuleCount: reviewRules.length,
      disabledReviewRuleCount: reviewRules.filter((rule) => !rule.enabled).length,
    },
    chartAccounts,
    reviewRules,
    updatedAt: new Date().toISOString(),
  };
}

function toggleChartAccountEnabled(id, enabled, companyId) {
  const companyProfile = getCompanyProfileOrThrow(companyId);
  const chartStore = getCompanyChartOfAccountsStore(companyProfile);
  const accounts = Array.isArray(chartStore?.accounts) ? [...chartStore.accounts] : [];
  const index = accounts.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new Error('Chart account not found');
  }

  accounts[index] = {
    ...accounts[index],
    enabled: Boolean(enabled),
    updatedAt: new Date().toISOString(),
  };
  const updatedCompany = updateCompanyProfileStore(companyId, (currentCompany) => ({
    ...currentCompany,
    chartOfAccounts: {
      ...getCompanyChartOfAccountsStore(currentCompany),
      updatedAt: new Date().toISOString(),
      accounts,
    },
  }));
  return serializeChartAccountEntry(getCompanyChartOfAccountsStore(updatedCompany).accounts[index]);
}

function upsertChartAccount(rawPayload, companyId) {
  const companyProfile = getCompanyProfileOrThrow(companyId);
  const section = normalizePlSection(rawPayload?.section);
  const group = normalizeWhitespace(rawPayload?.group);
  const account = normalizeWhitespace(rawPayload?.account) || group;
  const guidance = coercePersistedRuleString(rawPayload?.guidance);
  const existingId = coercePersistedRuleString(rawPayload?.id);

  if (!section || !group || !account) {
    throw new Error('Section, group, and account are required');
  }

  const timestamp = new Date().toISOString();
  const chartStore = getCompanyChartOfAccountsStore(companyProfile);
  const accounts = Array.isArray(chartStore?.accounts) ? [...chartStore.accounts] : [];

  if (existingId) {
    const index = accounts.findIndex((entry) => entry.id === existingId);
    if (index === -1) {
      throw new Error('Chart account not found');
    }

    const existing = accounts[index];
    accounts[index] = {
      ...existing,
      section: existing.builtIn ? existing.section : section,
      group: existing.builtIn ? existing.group : group,
      account: existing.builtIn ? existing.account : account,
      guidance,
      enabled: typeof rawPayload?.enabled === 'boolean' ? rawPayload.enabled : existing.enabled !== false,
      updatedAt: timestamp,
    };
    const updatedCompany = updateCompanyProfileStore(companyId, (currentCompany) => ({
      ...currentCompany,
      chartOfAccounts: {
        ...getCompanyChartOfAccountsStore(currentCompany),
        updatedAt: timestamp,
        accounts,
      },
    }));
    return serializeChartAccountEntry(getCompanyChartOfAccountsStore(updatedCompany).accounts[index]);
  }

  const duplicate = accounts.find((entry) => (
    entry.section === section
    && entry.group === group
    && entry.account === account
  ));
  if (duplicate) {
    throw new Error('That chart account already exists');
  }

  const customIdBase = slugifyStoreId(`${section}_${group}_${account}`) || 'custom_account';
  let nextId = `custom_${customIdBase}`;
  let suffix = 2;
  while (accounts.some((entry) => entry.id === nextId)) {
    nextId = `custom_${customIdBase}_${suffix}`;
    suffix += 1;
  }

  const entry = {
    id: nextId,
    section,
    group,
    account,
    guidance,
    enabled: typeof rawPayload?.enabled === 'boolean' ? rawPayload.enabled : true,
    builtIn: false,
    sortOrder: accounts.length + 100,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  updateCompanyProfileStore(companyId, (currentCompany) => ({
    ...currentCompany,
    chartOfAccounts: {
      ...getCompanyChartOfAccountsStore(currentCompany),
      updatedAt: timestamp,
      accounts: [...accounts, entry],
    },
  }));
  return serializeChartAccountEntry(entry);
}

function deleteChartAccount(id, companyId) {
  const companyProfile = getCompanyProfileOrThrow(companyId);
  const chartStore = getCompanyChartOfAccountsStore(companyProfile);
  const accounts = Array.isArray(chartStore?.accounts) ? [...chartStore.accounts] : [];
  const index = accounts.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new Error('Chart account not found');
  }
  if (accounts[index].builtIn) {
    throw new Error('Built-in chart accounts cannot be deleted');
  }

  const [removed] = accounts.splice(index, 1);
  updateCompanyProfileStore(companyId, (currentCompany) => ({
    ...currentCompany,
    chartOfAccounts: {
      ...getCompanyChartOfAccountsStore(currentCompany),
      updatedAt: new Date().toISOString(),
      accounts,
    },
  }));
  return serializeChartAccountEntry(removed);
}

function updateReviewRuleManagerState(ruleId, rawPayload = {}, companyId) {
  const companyProfile = getCompanyProfileOrThrow(companyId);
  const reviewRuleStore = getCompanyReviewRuleStore(companyProfile);
  const rules = Array.isArray(reviewRuleStore?.rules) ? [...reviewRuleStore.rules] : [];
  const index = rules.findIndex((rule) => rule.id === ruleId);
  if (index === -1) {
    throw new Error('Saved review rule not found');
  }

  const existing = rules[index];
  const nextRule = {
    ...existing,
    updatedAt: new Date().toISOString(),
  };

  if (typeof rawPayload.enabled === 'boolean') {
    nextRule.enabled = rawPayload.enabled;
  }

  const classificationId = coercePersistedRuleString(rawPayload.classificationId);
  if (classificationId) {
    const chartClassification = getConfiguredProfessionalVerifierClassificationById(classificationId, companyProfile);
    if (!chartClassification) {
      throw new Error('Selected chart account was not found');
    }

    nextRule.classificationId = classificationId;
    nextRule.classification = {
      plSection: chartClassification.section,
      plGroup: chartClassification.group,
      plAccount: chartClassification.account,
      category: coercePersistedRuleString(existing.classification?.category),
    };
    nextRule.answerKey = 'manager_rule_mapping';
    nextRule.answerLabel = `Manager set: ${buildClassificationLabel(chartClassification.section, chartClassification.group, chartClassification.account)}`;
  }

  rules[index] = normalizePersistedReviewRule(nextRule, index);
  const updatedCompany = updateCompanyProfileStore(companyId, (currentCompany) => ({
    ...currentCompany,
    reviewRules: {
      ...getCompanyReviewRuleStore(currentCompany),
      updatedAt: new Date().toISOString(),
      rules,
    },
  }));
  return serializeReviewRule(getCompanyReviewRuleStore(updatedCompany).rules[index], updatedCompany);
}

function deleteReviewRule(ruleId, companyId) {
  const companyProfile = getCompanyProfileOrThrow(companyId);
  const reviewRuleStore = getCompanyReviewRuleStore(companyProfile);
  const rules = Array.isArray(reviewRuleStore?.rules) ? [...reviewRuleStore.rules] : [];
  const index = rules.findIndex((rule) => rule.id === ruleId);
  if (index === -1) {
    throw new Error('Saved review rule not found');
  }

  const [removed] = rules.splice(index, 1);
  updateCompanyProfileStore(companyId, (currentCompany) => ({
    ...currentCompany,
    reviewRules: {
      ...getCompanyReviewRuleStore(currentCompany),
      updatedAt: new Date().toISOString(),
      rules,
    },
  }));
  return serializeReviewRule(removed, companyProfile);
}

function buildSimpleReportBucketInfo(tx) {
  const description = normalizeDescription(tx.description);
  const descriptionFingerprint = buildDescriptionFingerprint(description);
  const fallbackKey = descriptionFingerprint || normalizeFingerprintSource(description);

  if (looksLikeTransferOrBalanceSheet(tx)) {
    const transferFingerprint = buildTransferFingerprint(description);
    if (transferFingerprint.key && !transferFingerprint.key.startsWith('RAW::')) {
      return {
        key: transferFingerprint.key,
        label: transferFingerprint.key.startsWith('BEN::')
          ? `Transfer to ${normalizeDescription(transferFingerprint.label)}`
          : description,
      };
    }
  }

  return {
    key: fallbackKey,
    label: description,
  };
}

function scoreSimpleBucketLabel(value) {
  const description = normalizeDescription(value);
  return {
    digitCount: (description.match(/\d/g) || []).length,
    meaningfulTokenCount: (description.match(/\b[A-Za-z]{3,}\b/g) || []).length,
    length: description.length,
  };
}

function pickPreferredSimpleBucketLabel(currentLabel, candidateLabel) {
  if (!currentLabel) return normalizeDescription(candidateLabel);

  const current = normalizeDescription(currentLabel);
  const candidate = normalizeDescription(candidateLabel);
  const currentScore = scoreSimpleBucketLabel(current);
  const candidateScore = scoreSimpleBucketLabel(candidate);

  if (candidateScore.digitCount !== currentScore.digitCount) {
    return candidateScore.digitCount < currentScore.digitCount ? candidate : current;
  }

  if (candidateScore.meaningfulTokenCount !== currentScore.meaningfulTokenCount) {
    return candidateScore.meaningfulTokenCount > currentScore.meaningfulTokenCount ? candidate : current;
  }

  if (candidateScore.length !== currentScore.length) {
    return candidateScore.length < currentScore.length ? candidate : current;
  }

  return current;
}

function normalizeCategory(value, type) {
  const normalized = normalizeWhitespace(value).toLowerCase();
  const matched = SCHEDULE_C_CATEGORIES.find((category) => category.toLowerCase() === normalized);

  if (matched) return matched;
  return type === 'deposit' ? 'Income' : 'Other expenses';
}

function parseSignedNumericValue(value) {
  if (value == null || value === '') return null;

  const raw = normalizeWhitespace(value);
  if (!raw) return null;

  const hasParentheses = /^\(.*\)$/.test(raw);
  const cleaned = raw
    .replace(/[,$]/g, '')
    .replace(/[^\d().-]/g, '');
  const parsed = Number.parseFloat(cleaned.replace(/[()]/g, ''));

  if (!Number.isFinite(parsed)) return null;
  const signed = hasParentheses ? -Math.abs(parsed) : parsed;
  return roundCurrency(signed);
}

function formatDateObject(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = String(date.getFullYear());
  return `${month}/${day}/${year}`;
}

function normalizeAccountType(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (!normalized) return '';
  if (/(credit\s*card|card account|visa|mastercard|amex|american express|\bcc\b)/i.test(normalized)) return 'Credit Card';
  if (/(checking|business checking|operating account|\bck\b|\bchk\b)/i.test(normalized)) return 'Checking';
  if (/(savings|money market)/i.test(normalized)) return 'Savings';
  if (/(loan|line of credit|loc)/i.test(normalized)) return 'Loan';
  if (/other/i.test(normalized)) return 'Other';

  return toDisplayTitleCase(normalized);
}

function normalizeCurrencyCode(value) {
  const normalized = normalizeWhitespace(value).toUpperCase();
  if (/^[A-Z]{3}$/.test(normalized)) return normalized;
  return 'USD';
}

function normalizeStatementDate(value, sourceFile = '') {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return '';

  const normalizedTransactionDate = normalizeTransactionDate(normalized, sourceFile);
  const parsed = parsePotentialDate(normalizedTransactionDate) || parsePotentialDate(normalized);
  if (parsed) return formatDateObject(parsed);

  const fallbackDate = new Date(normalized);
  if (!Number.isNaN(fallbackDate.getTime())) {
    return formatDateObject(fallbackDate);
  }

  return '';
}

function inferStatementPeriodFromTransactions(rawTransactions, sourceFile = '') {
  if (!Array.isArray(rawTransactions)) {
    return { statementStartDate: '', statementEndDate: '' };
  }

  const dates = rawTransactions
    .map((tx) => normalizeStatementDate(tx?.date, sourceFile))
    .map((date) => parsePotentialDate(date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (dates.length === 0) {
    return { statementStartDate: '', statementEndDate: '' };
  }

  return {
    statementStartDate: formatDateObject(dates[0]),
    statementEndDate: formatDateObject(dates[dates.length - 1]),
  };
}

function getStatementMetaCandidate(rawMeta, keys) {
  if (!rawMeta || typeof rawMeta !== 'object') return '';

  for (const key of keys) {
    if (rawMeta[key] != null && rawMeta[key] !== '') return rawMeta[key];
  }

  return '';
}

function getExtractionPrompt(analysisMode) {
  return analysisMode === PROFESSIONAL_MODE ? PROFESSIONAL_EXTRACTION_PROMPT : SIMPLE_EXTRACTION_PROMPT;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function parseStructuredExtractionPayload(responseText) {
  let cleaned = String(responseText || '').trim();
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    cleaned = fencedMatch[1].trim();
  }

  const candidates = [];
  const pushCandidate = (candidate) => {
    const normalized = String(candidate || '').trim();
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  pushCandidate(cleaned);

  const objectStart = cleaned.indexOf('{');
  const objectEnd = cleaned.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd > objectStart) {
    pushCandidate(cleaned.slice(objectStart, objectEnd + 1));
  }

  const arrayStart = cleaned.indexOf('[');
  const arrayEnd = cleaned.lastIndexOf(']');
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    pushCandidate(cleaned.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Keep trying the next candidate.
    }
  }

  throw new Error('Could not parse structured extraction data from AI response');
}

function sanitizeStatementMetadata(rawMeta, sourceFile = '', rawTransactions = []) {
  const normalizedMeta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
  const inferredPeriod = inferStatementPeriodFromTransactions(rawTransactions, sourceFile);
  const institution = canonicalizeInstitutionName(
    getStatementMetaCandidate(normalizedMeta, ['institution', 'bank', 'bankName', 'issuer', 'financialInstitution']),
  );
  const accountName = toDisplayTitleCase(
    getStatementMetaCandidate(normalizedMeta, ['accountName', 'accountLabel', 'accountTitle', 'account', 'statementName']),
  );
  const accountType = normalizeAccountType(
    getStatementMetaCandidate(normalizedMeta, ['accountType', 'type', 'accountKind', 'statementType']),
  );
  const accountLast4 = extractLastFourAccountDigits(
    getStatementMetaCandidate(normalizedMeta, ['accountLast4', 'last4', 'accountNumber', 'accountNo', 'cardLast4', 'cardNumber']),
  );
  const statementStartDate = normalizeStatementDate(
    getStatementMetaCandidate(normalizedMeta, ['statementStartDate', 'startDate', 'periodStart', 'statementFrom']),
    sourceFile,
  ) || inferredPeriod.statementStartDate;
  const statementEndDate = normalizeStatementDate(
    getStatementMetaCandidate(normalizedMeta, ['statementEndDate', 'endDate', 'periodEnd', 'statementTo']),
    sourceFile,
  ) || inferredPeriod.statementEndDate;
  const openingBalance = parseSignedNumericValue(
    getStatementMetaCandidate(normalizedMeta, ['openingBalance', 'beginningBalance', 'startingBalance', 'startBalance']),
  );
  const closingBalance = parseSignedNumericValue(
    getStatementMetaCandidate(normalizedMeta, ['closingBalance', 'endingBalance', 'endBalance', 'statementBalance']),
  );
  const currency = normalizeCurrencyCode(
    getStatementMetaCandidate(normalizedMeta, ['currency', 'currencyCode', 'statementCurrency']) || 'USD',
  );

  return {
    sourceFile: normalizeWhitespace(sourceFile),
    institution,
    accountName,
    accountType,
    accountLast4,
    statementStartDate,
    statementEndDate,
    openingBalance,
    closingBalance,
    currency,
  };
}

function normalizeExtractionResult(parsedPayload, sourceFile = '') {
  if (Array.isArray(parsedPayload)) {
    return {
      statementMeta: sanitizeStatementMetadata({}, sourceFile, parsedPayload),
      transactions: parsedPayload,
    };
  }

  if (!parsedPayload || typeof parsedPayload !== 'object') {
    throw new Error('AI response did not contain a valid statement payload');
  }

  const transactions = Array.isArray(parsedPayload.transactions)
    ? parsedPayload.transactions
    : Array.isArray(parsedPayload.items)
      ? parsedPayload.items
      : Array.isArray(parsedPayload.data)
        ? parsedPayload.data
        : [];

  if (!Array.isArray(transactions) || transactions.length === 0) {
    const nestedArray = Object.values(parsedPayload).find((value) => Array.isArray(value));
    if (Array.isArray(nestedArray)) {
      return {
        statementMeta: sanitizeStatementMetadata(
          parsedPayload.statementMeta || parsedPayload.metadata || parsedPayload.statement || {},
          sourceFile,
          nestedArray,
        ),
        transactions: nestedArray,
      };
    }
  }

  return {
    statementMeta: sanitizeStatementMetadata(
      parsedPayload.statementMeta || parsedPayload.metadata || parsedPayload.statement || {},
      sourceFile,
      transactions,
    ),
    transactions,
  };
}

async function extractStatementDataFromPDF(pdfBuffer, analysisMode, fileName = 'statement.pdf') {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
  const prompt = getExtractionPrompt(analysisMode);
  const base64PDF = pdfBuffer.toString('base64');

  let result;
  let retries = 3;

  while (retries > 0) {
    try {
      const startedAt = Date.now();
      console.log(`    Sending ${analysisMode} extraction request to Gemini for ${fileName} using model ${GEMINI_MODEL} (${Math.round(pdfBuffer.length / 1024)} KB, timeout ${Math.round(GEMINI_TIMEOUT_MS / 1000)}s)`);

      result = await withTimeout(
        model.generateContent([
          { text: prompt },
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64PDF,
            },
          },
        ]),
        GEMINI_TIMEOUT_MS,
        `Gemini request timed out after ${Math.round(GEMINI_TIMEOUT_MS / 1000)}s for ${fileName}`,
      );

      console.log(`    Gemini responded for ${fileName} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
      break;
    } catch (err) {
      const isRetriable = err.message.includes('503') || err.message.includes('429') || err.message.includes('timed out');
      if (isRetriable) {
        retries -= 1;
        if (retries === 0) throw err;
        console.log(`    Gemini request failed for ${fileName}: ${err.message}`);
        console.log(`    Retrying in 5s... (${retries} retries left)`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } else {
        throw err;
      }
    }
  }

  const responseText = result.response.text();
  console.log('--- RAW AI RESPONSE ---');
  console.log(`${responseText.substring(0, 500)}...`);

  try {
    const parsedPayload = parseStructuredExtractionPayload(responseText);
    return normalizeExtractionResult(parsedPayload, fileName);
  } catch (err) {
    console.error('FAILED TO PARSE JSON. RAW TEXT WAS:', responseText);
    throw err;
  }
}

function sanitizeTransactions(rawTransactions) {
  if (!Array.isArray(rawTransactions)) return [];

  return rawTransactions
    .filter((tx) => tx && typeof tx === 'object')
    .map((tx) => {
      const sourceFile = normalizeWhitespace(tx.sourceFile);
      const type = normalizeWhitespace(tx.type).toLowerCase() === 'deposit' ? 'deposit' : 'deduction';
      const amount = Math.abs(parseFloat(String(tx.amount ?? '').replace(/,/g, '')) || 0);

      return {
        date: normalizeTransactionDate(tx.date, sourceFile),
        description: normalizeDescription(tx.description),
        amount,
        type,
        category: normalizeCategory(tx.category, type),
        plSection: normalizeWhitespace(tx.plSection || tx.section || tx.pnlSection),
        plGroup: normalizeWhitespace(tx.plGroup || tx.group || tx.pnlGroup),
        plAccount: normalizeWhitespace(tx.plAccount || tx.account || tx.pnlAccount),
        sourceFile,
        sourceStatementMeta: sanitizeStatementMetadata(tx.sourceStatementMeta, sourceFile),
      };
    })
    .filter((tx) => tx.amount > 0);
}

function parsePotentialDate(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const date = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(normalized)) {
    const [monthStr, dayStr, yearStr] = normalized.split('/');
    const month = parseInt(monthStr, 10) - 1;
    const day = parseInt(dayStr, 10);
    let year = parseInt(yearStr, 10);
    if (yearStr.length === 2) year += year < 70 ? 2000 : 1900;
    const date = new Date(year, month, day);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const fallbackDate = new Date(normalized);
  if (!Number.isNaN(fallbackDate.getTime())) {
    return fallbackDate;
  }

  return null;
}

function buildPeriodLabel(transactions) {
  const dates = transactions
    .map((tx) => parsePotentialDate(tx.date))
    .filter(Boolean)
    .sort((a, b) => a - b);

  if (dates.length === 0) return '';

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `${formatter.format(dates[0])} - ${formatter.format(dates[dates.length - 1])}`;
}

function buildSimpleDepositDeductionReport(transactions) {
  const deposits = {};
  const deductions = {};

  for (const tx of transactions) {
    const bucketInfo = buildSimpleReportBucketInfo(tx);
    const bucket = tx.type === 'deposit' ? deposits : deductions;

    if (!bucket[bucketInfo.key]) {
      bucket[bucketInfo.key] = {
        description: bucketInfo.label,
        total: 0,
        count: 0,
        category: tx.category,
      };
    } else {
      bucket[bucketInfo.key].description = pickPreferredSimpleBucketLabel(
        bucket[bucketInfo.key].description,
        bucketInfo.label,
      );
    }

    bucket[bucketInfo.key].total += tx.amount;
    bucket[bucketInfo.key].count += 1;
  }

  const depositList = Object.values(deposits)
    .map((item) => ({ ...item, total: roundCurrency(item.total) }))
    .sort((a, b) => b.total - a.total);

  const deductionList = Object.values(deductions)
    .map((item) => ({ ...item, total: roundCurrency(item.total) }))
    .sort((a, b) => b.total - a.total);

  const totalDeposits = roundCurrency(depositList.reduce((sum, item) => sum + item.total, 0));
  const totalDeductions = roundCurrency(deductionList.reduce((sum, item) => sum + item.total, 0));

  return {
    mode: SIMPLE_MODE,
    periodLabel: buildPeriodLabel(transactions),
    deposits: depositList,
    deductions: deductionList,
    totalDeposits,
    totalDeductions,
    net: roundCurrency(totalDeposits - totalDeductions),
    transactionCount: transactions.length,
  };
}

function looksLikeTransferOrBalanceSheet(tx) {
  if (tx.type === 'deduction' && isKnownLegalTrustWireDescription(tx.description)) {
    return false;
  }

  return IGNORE_PATTERNS.some((pattern) => pattern.test(tx.description));
}

function normalizePlSection(value) {
  const normalized = normalizeWhitespace(value).toLowerCase();

  if (!normalized) return '';
  if (['income', 'revenue', 'sales'].includes(normalized)) return 'Income';
  if (['cost of goods sold', 'cost-of-goods-sold', 'cogs', 'cost of sales'].includes(normalized)) return 'Cost of Goods Sold';
  if (['expense', 'expenses', 'operating expense', 'operating expenses'].includes(normalized)) return 'Expenses';
  if (['other income', 'non-operating income'].includes(normalized)) return 'Other Income';
  if (['other expense', 'other expenses', 'non-operating expense', 'non-operating expenses'].includes(normalized)) return 'Other Expenses';
  if (['ignore', 'exclude', 'excluded', 'transfer', 'balance sheet', 'balance-sheet', 'liability', 'asset', 'equity', 'not pnl'].includes(normalized)) return 'Ignore';
  return '';
}

function isAskMyAccountantDescription(description = '') {
  return /\bRTP\/?\s*SAME\s*DAY\b/i.test(description)
    || ((/ACH PAYMENT/i.test(description) || /ONLINE ACH PAYMENT/i.test(description)) && /\bST(?: 0791)?\b/i.test(description) && !/REALTIME VENDOR/i.test(description));
}

function isKnownAutoFinancingDescription(description = '') {
  return /MBFS\.COM|AUDI FINCL|AUDI DEBIT|FLOPAY.*MBFS|AUTO PAY MBFS|AUTO DEBIT AUDI|AUTO PAY MBFS\.COM/i.test(description);
}

function isMarketingPayoutRail(description = '') {
  return (
    /\b(?:REAL[\s-]?TIME|VENDOR(?:\s+PAYMENT|\s+PMT)?)\b/i.test(description)
    && /\b(?:ALL\s*AMERICAN\s*MARKETING|ALLAMERICANMARKETING|LEGAT\s*MARKETING|LEGATMARKETING|MOVE\s*AROUND|MOVEAROUND)\b/i.test(description)
  );
}

function isTelephoneExpenseDescription(description = '') {
  return /AT&T|ATT\b|VERIZON|T-?MOBILE|VONAGE|RINGCENTRAL|OPENPHONE/i.test(description);
}

function isComputerInternetDescription(description = '') {
  return /COMCAST|XFINITY|INTERNET|GOOGLE WORKSPACE|GSUITE|WORKSPACE|MICROSOFT 365|HOSTING|DOMAIN|WEBFLOW|NOTION|SLACK/i.test(description);
}

function isDuesSubscriptionDescription(description = '') {
  return /PATH SOCIAL|SUBSCRIPTION|SUBSCRIPT|MEMBERSHIP|LINKEDIN|ADOBE|CANVA/i.test(description);
}

function isBusinessPermitDescription(description = '') {
  return /IRS|USATAXPMT|PERMIT|LICENSE|GOV\.UK|BOATTESTS|IMMIGRATION|VISA|ETA/i.test(description);
}

function isInsuranceExpenseDescription(description = '') {
  return /GEICO|INSURANCE|ALLIANZ/i.test(description);
}

function isRepairMaintenanceDescription(description = '') {
  return /LEYANI CLEANING|CLEANING|PLUMBING|PAVING|REPAIR|MAINTENANCE|MAINT\b/i.test(description);
}

function isSuppliesDescription(description = '') {
  return /TARGET|STAPLES|OFFICE DEPOT|OFFICEMAX|SUPPLIES|CVS\/PHARMACY|PHARMACY|MIAMI GARDENS SQ/i.test(description);
}

function isKnownLegalTrustWireDescription(description = '') {
  return /FORBES\s+HARE|NEVIS\s+TRUST|CAYMAN\s+(?:NATIONAL|REVOCABLE)|TRUST\s+COMPANY|LAWRENCE\s+CAPLAN|ATG\s+LAW|LAW\s+FIRM|ATTORNEY|LEGAL/i.test(description);
}

function isLegalProfessionalDescription(description = '') {
  return isKnownLegalTrustWireDescription(description)
    || /CPA|ACCOUNTANT|CONSULT(?:ING)?|ADVISORY|PROFESSIONAL SERVICES?/i.test(description);
}

function isPotentialLegalProfessionalDescription(description = '') {
  return isLegalProfessionalDescription(description)
    || /CYBER ?NEX SOLUTIONS CORP|CYBERNEX SOLUTIONS CORP|RETAINER|COMPLIANCE|ADVISORY/i.test(description);
}

function isRemoteStaffingDescription(description = '') {
  return /REMOTE STAFF|REMOTE STAFFING|OUTSOURC|UPWORK|LAURAS?\s+AND\s+ASSOCIATES/i.test(description);
}

function isMealsAndEntertainmentDescription(description = '') {
  return /UBER\s*\*\s*EATS|UBER EATS|STARBUCKS|JUICE|PURA VIDA|MAYAMI|BODEGA|WENDY|CHICK-?FIL-?A|MORTON|STEAKHOUSE|BAR\b|GRILL|CAFE|RESTAURANT|DINER|SEAFOOD|BURGER|PIZZA|TWIN PEAKS|JOE THE JUICE|MARKET|GOURMET/i.test(description);
}

function isTravelExpenseDescription(description = '') {
  return /UBER\s*\*\s*TRIP|UBER TRIP|LYFT|TAXI|RIDESHARE|AIRBNB|HOTEL|LODGE|MARRIOTT|HILTON|HYATT|BOOKING|AIRFARE|AIRLINES|DELTA|UNITED|JETBLUE|SOUTHWEST|AMERICAN AIR|SPIRIT|AVIANCA|RH TOURS|PRESTIGEFLY|TRAVEL BUSINESS-CLASS/i.test(description);
}

function isAutoExpenseDescription(description = '') {
  return /HERTZ|AVIS|ENTERPRISE|RENT-A-CAR|FUEL|GAS\b|SHELL|CHEVRON|EXXON|MARATHON|PARK|PARKING|PRKING|VALET|CAR WASH|FLPARKING|PARKRECEIPTS|PARK RECEIPTS|PY \*AVENTURA MALL VALET|ERACTOLL/i.test(description);
}

function isKnownSubcontractorVendor(description = '') {
  if (isMarketingPayoutRail(description)) return false;

  return /EXPRESSO|LEGAT\s*MARKETING|LEGATMARKETING|ALL\s*AMERICAN\s*MARKETING|ALLAMERICANMARKETING|MOVE\s*AROUND|MOVEAROUND|DENNI DIAZ|ERANOVUM|KATIE TUTOR|TATA\b|LEO SIGNER|ANA BELKIS|KISAE|VANESSA LOPEZ|RAY RAY|YEAN\b|AIDELY|VERO(?:\(|\b)|PERCY PONCE|ISABEL\b|SANTIAGO\b|TREZIL|LUIS CARLOS|YORDAN BARRERA|YEHUDIS|JAVIER\b|DIEGO\b|AUSTIN\b|TAMIR\b|MARLENE\b|HUGO\b|VALET JOSE/i.test(description);
}

function isLeadGenerationVendor(description = '') {
  if (/STEVEN TOLEDO|STEVEN V TOLEDO/i.test(description)) return false;

  return /\bST 0791\b/i.test(description)
    || /\bSTEVEN 2751\b/i.test(description)
    || isMarketingPayoutRail(description)
    || /\bONLINE REALTIME VENDOR PAYMENT TO STEVEN\b/i.test(description)
    || /\bREALTIME VENDOR PAYMENT TO STEVEN\b/i.test(description)
    || /\bREALTIME VENDOR PAYMENT TO STEVEN 2751\b/i.test(description)
    || /\bONLINE REALTIME VENDOR PAYMENT TO STEVEN 2751\b/i.test(description)
    || /\bONLINE REALTIME VENDOR PAYMENT TO ST\b/i.test(description)
    || /\bREALTIME VENDOR PAYMENT TO ST\b/i.test(description)
    || /\bVENDOR PAYMENT TO ST 0791\b/i.test(description)
    || /\bONLINE VENDOR PMT ST 0791\b/i.test(description)
    || /\bONLINE ACH PAYMENT TO ST 0791\b/i.test(description);
}

function isNonOperatingRefundAdjustment(description = '') {
  return /\bFEDWIRE CREDIT\b.*\b(REFUND|EFUND)\b/i.test(description)
    || /\bYACHT CHARTER CREDIT REFUND\b/i.test(description)
    || /\bTRIPR EFUND\b/i.test(description);
}

function isDirectCostAdvertisingSignal(tx, candidate, description = '') {
  return tx.category === 'Advertising'
    || /FACEBK|FACEBOOK|META|GOOGLE.*(ADS|ADWORDS|SEM|PPC)|FB\.ME\/ADS|LEAD|MEDIA\b|MARKETING\b/i.test(description)
    || candidate.group === 'Advertising and Promotion';
}

function buildAdvertisingAccount(description = '') {
  if (/FACEBK|FACEBOOK|META/i.test(description)) return 'Facebook';
  if (/GOOGLE/i.test(description) && /(ADS|ADWORDS|SEM|PPC)/i.test(description)) return 'Google ADS';
  if (isLeadGenerationVendor(description) || /LEAD|MEDIA\b|REALTIME VENDOR|VENDOR PAYMENT/i.test(description)) return 'Lead Generation';
  return 'Advertising and Promotion';
}

function canonicalizeProfitAndLossGrouping(section, group, account, description) {
  let nextSection = section;
  let nextGroup = normalizeWhitespace(group) || '';
  let nextAccount = normalizeWhitespace(account) || nextGroup;

  if (nextSection === 'Expenses') {
    if (/^(AUTOMOBILE EXPENSE|CAR & TRUCK|CAR AND TRUCK|VEHICLE EXPENSE|AUTO EXPENSE)$/i.test(nextGroup)) nextGroup = 'Auto Expense';
    else if (/^(INSURANCE)$/i.test(nextGroup)) nextGroup = 'Insurance Expense';
    else if (/^(PROFESSIONAL FEES|PROFESSIONAL SERVICES|LEGAL AND PROFESSIONAL|LEGAL AND PROFESSIONAL FEES)$/i.test(nextGroup)) nextGroup = 'Legal & Professional Fees';
    else if (/^(REPAIRS AND MAINTENANCE|MAINTENANCE|FACILITIES)$/i.test(nextGroup)) nextGroup = 'Repair and Maintenance';
    else if (/^(TAXES AND LICENSES|TAXES|BUSINESS EXPENSES)$/i.test(nextGroup)) nextGroup = 'Business and Permits';
    else if (/^(OTHER BUSINESS EXPENSE|OTHER BUSINESS EXPENSES|GENERAL EXPENSES|GENERAL EXPENSE|GENERAL AND ADMINISTRATIVE|BUSINESS SERVICES|OTHER EXPENSES|MISCELLANEOUS|MISCELLANEOUS EXPENSE|GENERAL|OTHER|PERSONAL)$/i.test(nextGroup)) nextGroup = 'Other Expense';
    else if (/^(OPERATING EXPENSES|OPERATIONS)$/i.test(nextGroup)) nextGroup = 'Other Expense';
    else if (/^(TRAVEL AND MEALS)$/i.test(nextGroup)) nextGroup = isMealsAndEntertainmentDescription(description) ? 'Meals and Entertainment' : 'Travel Expense';
    else if (/^(WAGES|PAYROLL|PAYROLL EXPENSE|WAGES AND SALARIES|WAGES & SALARIES)$/i.test(nextGroup)) nextGroup = 'Payroll';
    else if (/^(BANK CHARGE|BANK CHARGES|BANK FEES)$/i.test(nextGroup) && !/RETURNED NSF|DEPOSITED ITEM RETURNED|NSF/i.test(description)) nextGroup = 'Bank Charge service';
    else if (/^(SUBCONTRACTORS?)$/i.test(nextGroup)) nextSection = 'Cost of Goods Sold';
  }

  if (
    !nextAccount
    || nextAccount === group
    || /^(WAGES|WAGES AND SALARIES|PAYROLL EXPENSE)$/i.test(normalizeWhitespace(nextAccount))
  ) {
    nextAccount = nextGroup;
  }

  if (nextSection === 'Cost of Goods Sold' && /^(SUBCONTRACTORS?)$/i.test(nextGroup)) {
    nextGroup = 'Subcontractors';
    nextAccount = 'Subcontractors';
  }

  return refineProfitAndLossAccount(nextSection, nextGroup, nextAccount, description);
}

function applyStrongClassificationRules(tx, candidate) {
  const description = tx.description.toUpperCase();
  const candidateLabel = `${candidate.section} ${candidate.group} ${candidate.account}`.toUpperCase();
  const combined = `${description} ${candidateLabel}`;

  if (tx.type === 'deposit') {
    if (isNonOperatingRefundAdjustment(description)) {
      return {
        classification: { section: 'Ignore', group: 'Refund / Credit Adjustment', account: 'Refund / Credit Adjustment' },
        source: 'rule',
        reason: 'non_operating_refund_adjustment',
      };
    }

    if (/TRAVEL CREDIT|BANK REWARD|REWARD/i.test(description)) {
      return {
        classification: { section: 'Other Income', group: 'Other Income', account: 'Other Income' },
        source: 'rule',
        reason: 'deposit_credit_or_reward',
      };
    }

    return null;
  }

  if (isKnownLegalTrustWireDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Legal & Professional Fees', account: 'Legal & Professional Fees' },
      source: 'rule',
      reason: 'legal_trust_wire_pattern',
    };
  }

  if (isAskMyAccountantDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Ask My Accountant', account: 'Ask My Accountant' },
      source: 'rule',
      reason: 'ask_my_accountant_pattern',
    };
  }

  if (/ONLINE ACH PAYMENT TO ST\b/i.test(description) && tx.amount >= 40000 && !/REALTIME/i.test(description)) {
    return {
      classification: { section: 'Expenses', group: 'Ask My Accountant', account: 'Ask My Accountant' },
      source: 'rule',
      reason: 'ask_my_accountant_large_st_wire',
    };
  }

  if (isCreditCardPaymentDescription(description)) {
    return {
      classification: { section: 'Ignore', group: 'Transfers', account: 'Credit Card Payment' },
      source: 'rule',
      reason: 'credit_card_payment',
    };
  }

  if (isKnownAutoFinancingDescription(description)) {
    return {
      classification: { section: 'Ignore', group: 'Transfers', account: 'Vehicle Financing' },
      source: 'rule',
      reason: 'auto_financing_payment',
    };
  }

  if (/CYBERNEX/i.test(description)) {
    return {
      classification: { section: 'Expenses', group: 'Computer and Internet', account: 'Computer and Internet' },
      source: 'rule',
      reason: 'cybernex_computer_internet',
    };
  }

  if (isLeadGenerationVendor(description)) {
    return {
      classification: { section: 'Cost of Goods Sold', group: 'Advertising and Promotion', account: 'Lead Generation' },
      source: 'rule',
      reason: 'lead_generation_vendor',
    };
  }

  if (isKnownSubcontractorVendor(combined)) {
    return {
      classification: { section: 'Cost of Goods Sold', group: 'Subcontractors', account: 'Subcontractors' },
      source: 'rule',
      reason: 'known_subcontractor_vendor',
    };
  }

  if (isDuesSubscriptionDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Dues and Subscription', account: 'Dues and Subscription' },
      source: 'rule',
      reason: 'subscription_pattern',
    };
  }

  if (isDirectCostAdvertisingSignal(tx, candidate, description)) {
    return {
      classification: {
        section: 'Cost of Goods Sold',
        group: 'Advertising and Promotion',
        account: buildAdvertisingAccount(description),
      },
      source: 'rule',
      reason: 'direct_cost_advertising',
    };
  }

  if (isRemoteStaffingDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Remote Staffing Fees', account: 'Remote Staffing Fees' },
      source: 'rule',
      reason: 'remote_staffing_pattern',
    };
  }

  if (isLegalProfessionalDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Legal & Professional Fees', account: 'Legal & Professional Fees' },
      source: 'rule',
      reason: 'legal_professional_pattern',
    };
  }

  if (isBusinessPermitDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Business and Permits', account: 'Business and Permits' },
      source: 'rule',
      reason: 'business_permit_pattern',
    };
  }

  if (isTelephoneExpenseDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Telephone Expense', account: 'Telephone Expense' },
      source: 'rule',
      reason: 'telephone_pattern',
    };
  }

  if (isComputerInternetDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Computer and Internet', account: 'Computer and Internet' },
      source: 'rule',
      reason: 'computer_internet_pattern',
    };
  }

  if (isInsuranceExpenseDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Insurance Expense', account: 'Insurance Expense' },
      source: 'rule',
      reason: 'insurance_pattern',
    };
  }

  if (isRepairMaintenanceDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Repair and Maintenance', account: 'Repair and Maintenance' },
      source: 'rule',
      reason: 'repair_maintenance_pattern',
    };
  }

  if (isAutoExpenseDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Auto Expense', account: 'Auto Expense' },
      source: 'rule',
      reason: 'auto_expense_pattern',
    };
  }

  if (isMealsAndEntertainmentDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Meals and Entertainment', account: 'Meals and Entertainment' },
      source: 'rule',
      reason: 'meals_entertainment_pattern',
    };
  }

  if (isTravelExpenseDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Travel Expense', account: 'Travel Expense' },
      source: 'rule',
      reason: 'travel_expense_pattern',
    };
  }

  if (isSuppliesDescription(description)) {
    return {
      classification: { section: 'Expenses', group: 'Supplies', account: 'Supplies' },
      source: 'rule',
      reason: 'supplies_pattern',
    };
  }

  return null;
}

function refineProfitAndLossAccount(section, group, account, description) {
  const upperDescription = description.toUpperCase();

  if (group === 'Advertising and Promotion') {
    if (/FACEBK|FACEBOOK|META/.test(upperDescription)) {
      return { section, group, account: 'Facebook' };
    }
    if (/GOOGLE/.test(upperDescription) && /(ADS|ADWORDS|SEM|PPC)/.test(upperDescription)) {
      return { section, group, account: 'Google ADS' };
    }
    if (/LEAD/.test(upperDescription)) {
      return { section, group, account: 'Lead Generation' };
    }
  }

  if (group === 'Meals and Entertainment') {
    return { section, group, account: 'Meals and Entertainment' };
  }

  if (group === 'Travel Expense') {
    if (/AIRBNB|HOTEL|LODGE|MARRIOTT|HILTON|BOOKING|HYATT|INN\b/.test(upperDescription)) {
      return { section, group, account: 'Lodging' };
    }
    if (/UBER|LYFT|TAXI|RIDESHARE|CAB\b/.test(upperDescription)) {
      return { section, group, account: 'Taxis & Rideshare' };
    }
    if (/AIRFARE|AIRLINES|DELTA|UNITED|JETBLUE|SOUTHWEST|AMERICAN AIR|SPIRIT\b/.test(upperDescription)) {
      return { section, group, account: 'Airfare' };
    }
  }

  if (group === 'Auto Expense') {
    if (/HERTZ|AVIS|ENTERPRISE|RENTAL/.test(upperDescription)) {
      return { section, group, account: 'Car Rental' };
    }
    if (/FUEL|GAS|SHELL|CHEVRON|EXXON|MOBIL|BP\b/.test(upperDescription)) {
      return { section, group, account: 'Fuel' };
    }
    if (/PARK|PARKING|TOOL|TOLL|VALET/.test(upperDescription)) {
      return { section, group, account: 'Tools and Parking' };
    }
    if (/REPAIR|MAINT|WASH/.test(upperDescription)) {
      return { section, group, account: 'Repair and Maintenance' };
    }
  }

  if (group === 'Utilities') {
    if (/VERIZON|AT&T|ATT\b|T-?MOBILE|PHONE|VONAGE/.test(upperDescription)) {
      return { section, group: 'Telephone Expense', account: 'Telephone Expense' };
    }
    if (/COMCAST|SPECTRUM|INTERNET|GOOGLE WORKSPACE|MICROSOFT 365|HOSTING/.test(upperDescription)) {
      return { section, group: 'Computer and Internet', account: 'Computer and Internet' };
    }
  }

  if (group === 'Other Expense') {
    if (/FEE|SERVICE CHARGE|BANK CHARGE|NSF/.test(upperDescription)) {
      return { section: 'Expenses', group: 'Bank Charge service', account: 'Bank Charge service' };
    }
    if (/PERMIT|LICENSE/.test(upperDescription)) {
      return { section: 'Expenses', group: 'Business and Permits', account: 'Business and Permits' };
    }
    if (/UPWORK|REMOTE|OUTSOURC/.test(upperDescription)) {
      return { section: 'Expenses', group: 'Remote Staffing Fees', account: 'Remote Staffing Fees' };
    }
  }

  return { section, group, account };
}

function inferProfitAndLossClassification(tx) {
  const transferSignalDetected = looksLikeTransferOrBalanceSheet(tx);

  if (transferSignalDetected) {
    return {
      section: 'Ignore',
      group: 'Transfers',
      account: 'Internal Transfer',
      source: 'rule',
      reason: 'transfer_signal',
      transferSignalDetected,
    };
  }

  if (tx.type === 'deposit') {
    if (tx.category === 'Income') {
      return {
        section: 'Income',
        group: 'Sales',
        account: 'Sales',
        source: 'rule',
        reason: 'deposit_income_category',
        transferSignalDetected,
      };
    }

    if (/REFUND|REVERSAL|CREDIT/.test(tx.description.toUpperCase())) {
      return {
        section: 'Other Income',
        group: 'Refunds and Credits',
        account: 'Refunds and Credits',
        source: 'rule',
        reason: 'deposit_refund_signal',
        transferSignalDetected,
      };
    }

    return {
      section: 'Other Income',
      group: 'Other Income',
      account: 'Other Income',
      source: 'rule',
      reason: 'deposit_fallback_other_income',
      transferSignalDetected,
    };
  }

  const defaults = CATEGORY_TO_PNL_DEFAULTS[tx.category] || CATEGORY_TO_PNL_DEFAULTS['Other expenses'];
  const refinedDefaults = refineProfitAndLossAccount(defaults.section, defaults.group, defaults.account, tx.description);

  return {
    ...refinedDefaults,
    source: 'schedule_c_default',
    reason: `category_default:${tx.category}`,
    transferSignalDetected,
  };
}

function normalizeProfitAndLossTransaction(tx) {
  const inferred = inferProfitAndLossClassification(tx);
  const modelSection = normalizePlSection(tx.plSection);
  const modelGroup = normalizeWhitespace(tx.plGroup);
  const modelAccount = normalizeWhitespace(tx.plAccount);
  const chosenSection = modelSection || inferred.section;
  const seedGroup = modelGroup || inferred.group;
  const seedAccount = modelAccount || inferred.account || seedGroup;

  const classificationMeta = {
    inferenceSource: inferred.source,
    inferenceReason: inferred.reason,
    transferSignalDetected: Boolean(inferred.transferSignalDetected),
    modelSectionProvided: Boolean(modelSection),
    modelGroupProvided: Boolean(modelGroup),
    modelAccountProvided: Boolean(modelAccount),
    usedFallbackSection: !modelSection,
    usedHeuristicRefinement: false,
    forcedRuleApplied: false,
    savedRuleApplied: false,
  };

  const seededCandidate = {
    section: chosenSection,
    group: seedGroup,
    account: seedAccount,
  };
  const forcedRule = applyStrongClassificationRules(tx, seededCandidate);
  const ruleCandidate = forcedRule?.classification || seededCandidate;
  const canonicalCandidate = canonicalizeProfitAndLossGrouping(
    ruleCandidate.section,
    ruleCandidate.group,
    ruleCandidate.account,
    tx.description,
  );
  const usedHeuristicRefinement = (
    canonicalCandidate.section !== ruleCandidate.section
    || canonicalCandidate.group !== ruleCandidate.group
    || canonicalCandidate.account !== ruleCandidate.account
  ) && (
      canonicalCandidate.section !== chosenSection
      || canonicalCandidate.group !== seedGroup
      || canonicalCandidate.account !== seedAccount
    );

  return {
    ...tx,
    plSection: canonicalCandidate.section,
    plGroup: canonicalCandidate.group,
    plAccount: canonicalCandidate.account,
    classificationMeta: {
      ...classificationMeta,
      usedHeuristicRefinement,
      forcedRuleApplied: Boolean(forcedRule),
      inferenceSource: forcedRule?.source || classificationMeta.inferenceSource,
      inferenceReason: forcedRule?.reason || classificationMeta.inferenceReason,
      finalSection: canonicalCandidate.section,
      finalGroup: canonicalCandidate.group,
      finalAccount: canonicalCandidate.account,
    },
  };
}

function buildClassificationLabel(section, group, account) {
  return [section || 'Unassigned', group || 'Unassigned', account || 'Unassigned'].join(' / ');
}

function buildVerifierClassificationLabel(classificationId, companyProfile = null) {
  const classification = getConfiguredProfessionalVerifierClassificationById(classificationId, companyProfile);
  return classification
    ? buildClassificationLabel(classification.section, classification.group, classification.account)
    : '';
}

function isGenericProfitAndLossClassification(tx) {
  return ['Other Expense', 'Other Income', 'Uncategorized'].includes(tx.plGroup)
    || ['Other Expense', 'Other Income', 'Uncategorized'].includes(tx.plAccount);
}

function buildClassificationOverride(classification) {
  return {
    plSection: classification.section,
    plGroup: classification.group,
    plAccount: classification.account,
  };
}

function isVerifierPriorityGroup(group = '') {
  return [
    'Advertising and Promotion',
    'Ask My Accountant',
    'Bank Charge service',
    'Computer and Internet',
    'Legal & Professional Fees',
    'Other Expense',
    'Subcontractors',
    'Telephone Expense',
  ].includes(group);
}

function createReviewOption(key, label, description, override, meta = {}) {
  return { key, label, description, override, ...meta };
}

function getProfessionalReviewQuestionLimit(reviewMode) {
  return isStrictProfessionalReviewMode(reviewMode) ? Number.POSITIVE_INFINITY : MAX_REVIEW_QUESTIONS;
}

function sortProfessionalReviewQuestions(a, b) {
  return a.priority - b.priority || b.totalAmount - a.totalAmount;
}

function selectProfessionalReviewQuestions(baseQuestions, verifierQuestions, reviewMode) {
  const limit = getProfessionalReviewQuestionLimit(reviewMode);
  const allQuestions = [...baseQuestions, ...verifierQuestions].sort(sortProfessionalReviewQuestions);

  if (!Number.isFinite(limit)) {
    return allQuestions;
  }

  const transferQuestions = baseQuestions
    .filter((question) => question.type === 'transfer_review')
    .sort(sortProfessionalReviewQuestions);
  const nonTransferQuestions = [
    ...baseQuestions.filter((question) => question.type !== 'transfer_review'),
    ...verifierQuestions,
  ].sort(sortProfessionalReviewQuestions);

  const reservedNonTransferSlots = Math.min(
    STANDARD_REVIEW_RESERVED_NON_TRANSFER_QUESTIONS,
    nonTransferQuestions.length,
    limit,
  );
  const selectedNonTransfer = nonTransferQuestions.slice(0, reservedNonTransferSlots);
  const selectedTransfer = transferQuestions.slice(0, Math.max(0, limit - selectedNonTransfer.length));
  const selected = [...selectedNonTransfer, ...selectedTransfer];
  const selectedIds = new Set(selected.map((question) => question.id));

  if (selected.length < limit) {
    const leftovers = allQuestions.filter((question) => !selectedIds.has(question.id));
    selected.push(...leftovers.slice(0, limit - selected.length));
  }

  return selected.sort(sortProfessionalReviewQuestions);
}

function buildTransferReviewSignal(tx) {
  const fallback = tx.type === 'deposit'
    ? { plSection: 'Other Income', plGroup: 'Other Income', plAccount: 'Other Income' }
    : { plSection: 'Expenses', plGroup: 'Other Expense', plAccount: 'Other Expense' };

  return {
    type: 'transfer_review',
    priority: 1,
    title: `Is "${tx.description}" part of the P&L?`,
    prompt: 'These transactions look like transfer or balance-sheet activity, but the current professional statement would include them.',
    reason: 'Transfer-style wording detected in the bank memo.',
    options: [
      createReviewOption(
        'ignore_transfer',
        'Exclude as transfer or balance-sheet activity',
        'Do not include these transactions in the P&L.',
        { plSection: 'Ignore', plGroup: 'Transfers', plAccount: 'Internal Transfer' },
      ),
      createReviewOption(
        'keep_current',
        `Keep current guess: ${tx.plGroup || tx.plSection}`,
        `Use the existing ${tx.plSection || 'current'} classification from the model.`,
        { plSection: tx.plSection, plGroup: tx.plGroup, plAccount: tx.plAccount },
      ),
      createReviewOption(
        'treat_as_operating_item',
        tx.type === 'deposit' ? 'Treat as other income' : 'Treat as operating expense',
        tx.type === 'deposit' ? 'Keep this in the P&L as other income.' : 'Keep this in the P&L as an operating expense.',
        fallback,
      ),
    ],
  };
}

function buildRefundReviewSignal(tx) {
  return {
    type: 'refund_review',
    priority: 2,
    title: `How should we treat "${tx.description}"?`,
    prompt: 'These deposits look like refunds, reversals, or credits, but the current professional statement would classify them differently.',
    reason: 'Refund-style wording conflicts with the current P&L classification.',
    options: [
      createReviewOption(
        'refund_credit',
        'Treat as refund or credit',
        'Place these transactions in Other Income under Refunds & Reversals.',
        { plSection: 'Other Income', plGroup: 'Refunds and Credits', plAccount: 'Refunds & Reversals' },
      ),
      createReviewOption(
        'sales_income',
        'Treat as actual income',
        'Include these transactions in Income as Sales.',
        { plSection: 'Income', plGroup: 'Sales', plAccount: 'Sales' },
      ),
      createReviewOption(
        'exclude',
        'Exclude from the P&L',
        'Treat these transactions as non-P&L activity.',
        { plSection: 'Ignore', plGroup: 'Transfers', plAccount: 'Internal Transfer' },
      ),
    ],
  };
}

function buildCategoryConflictReviewSignal(tx, recommended) {
  return {
    type: 'category_conflict',
    priority: 3,
    title: `How should we classify "${tx.description}"?`,
    prompt: `The extracted tax category says "${tx.category}", but the current professional statement would place these transactions in ${tx.plSection}.`,
    reason: `Schedule C category suggests ${recommended.section} / ${recommended.group}, while the current guess is ${tx.plSection} / ${tx.plGroup}.`,
    options: [
      createReviewOption(
        'move_to_recommended',
        `Move to ${recommended.group}`,
        `Follow the extracted "${tx.category}" category and place these transactions in ${recommended.section}.`,
        { plSection: recommended.section, plGroup: recommended.group, plAccount: recommended.account, category: tx.category },
      ),
      createReviewOption(
        'keep_current',
        `Keep current guess: ${tx.plGroup || tx.plSection}`,
        `Use the model's current ${tx.plSection} classification.`,
        { plSection: tx.plSection, plGroup: tx.plGroup, plAccount: tx.plAccount, category: tx.category },
      ),
      createReviewOption(
        'exclude',
        'Exclude from the P&L',
        'Do not include these transactions in the professional statement.',
        { plSection: 'Ignore', plGroup: 'Transfers', plAccount: 'Internal Transfer', category: tx.category },
      ),
    ],
  };
}

function buildGenericReviewSignal(tx) {
  const deductionOptions = [
    createReviewOption(
      'operating_expense',
      'Treat as operating expense',
      'Include these transactions in Expenses as Other Expense.',
      { plSection: 'Expenses', plGroup: 'Other Expense', plAccount: 'Other Expense' },
    ),
    createReviewOption(
      'cost_of_goods_sold',
      'Treat as direct cost / COGS',
      'Include these transactions in Cost of Goods Sold as Direct Costs.',
      { plSection: 'Cost of Goods Sold', plGroup: 'Direct Costs', plAccount: 'Direct Costs' },
    ),
    createReviewOption(
      'exclude',
      'Exclude from the P&L',
      'Treat these as transfer or non-P&L activity.',
      { plSection: 'Ignore', plGroup: 'Transfers', plAccount: 'Internal Transfer' },
    ),
  ];

  const depositOptions = [
    createReviewOption(
      'sales_income',
      'Treat as income',
      'Include these transactions in Income as Sales.',
      { plSection: 'Income', plGroup: 'Sales', plAccount: 'Sales' },
    ),
    createReviewOption(
      'other_income',
      'Treat as other income',
      'Include these transactions in Other Income.',
      { plSection: 'Other Income', plGroup: 'Other Income', plAccount: 'Other Income' },
    ),
    createReviewOption(
      'exclude',
      'Exclude from the P&L',
      'Treat these as transfer or non-P&L activity.',
      { plSection: 'Ignore', plGroup: 'Transfers', plAccount: 'Internal Transfer' },
    ),
  ];

  return {
    type: 'generic_review',
    priority: 4,
    title: `How should we classify "${tx.description}"?`,
    prompt: 'The current professional statement could only place these transactions in a generic account, so they need a human decision.',
    reason: `Current guess is ${tx.plSection} / ${tx.plGroup}.`,
    options: tx.type === 'deposit' ? depositOptions : deductionOptions,
  };
}

function getProfessionalReviewSignal(tx) {
  const upperDescription = tx.description.toUpperCase();
  const forcedRuleApplied = Boolean(tx.classificationMeta?.forcedRuleApplied);

  if (tx.classificationMeta?.savedRuleApplied) {
    return null;
  }

  if (looksLikeTransferOrBalanceSheet(tx) && tx.plSection !== 'Ignore' && !forcedRuleApplied) {
    return buildTransferReviewSignal(tx);
  }

  if (tx.type === 'deposit' && /(REFUND|REVERSAL|CREDIT)/.test(upperDescription) && tx.plSection !== 'Other Income' && tx.plSection !== 'Ignore') {
    return buildRefundReviewSignal(tx);
  }

  if (tx.type === 'deduction') {
    const defaultClassification = CATEGORY_TO_PNL_DEFAULTS[tx.category];

    if (
      defaultClassification
      && tx.plSection
      && tx.plSection !== defaultClassification.section
      && !tx.classificationMeta?.forcedRuleApplied
    ) {
      const accountSeed = tx.plAccount && tx.plAccount !== tx.plGroup ? tx.plAccount : defaultClassification.account;
      const recommended = refineProfitAndLossAccount(defaultClassification.section, defaultClassification.group, accountSeed, tx.description);
      return buildCategoryConflictReviewSignal(tx, recommended);
    }
  }

  if (isGenericProfitAndLossClassification(tx)) {
    return buildGenericReviewSignal(tx);
  }

  return null;
}

function incrementCountMap(map, key, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + amount);
}

function getSortedCountEntries(map) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function clampVerifierConfidence(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0.5;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return Number(parsed.toFixed(2));
}

function buildProfessionalVerifierCandidates(transactions, reviewMode = PROFESSIONAL_REVIEW_STANDARD) {
  const strictReview = isStrictProfessionalReviewMode(reviewMode);
  const clusters = new Map();

  transactions.forEach((tx, index) => {
    if (!tx || tx.plSection === 'Ignore') return;

    const bucketInfo = buildReviewBucketInfo('verifier_category_review', tx);
    const clusterKey = bucketInfo.key || normalizeFingerprintSource(tx.description);
    if (!clusterKey) return;

    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, {
        key: clusterKey,
        label: bucketInfo.label || normalizeDescription(tx.description),
        transactionIndexes: [],
        transactionCount: 0,
        totalAmount: 0,
        currentClassifications: new Map(),
        scheduleCategories: new Map(),
        types: new Map(),
        baseSignalTypes: new Set(),
        sampleDescriptions: new Set(),
        sourceFiles: new Set(),
        genericCount: 0,
        forcedRuleCount: 0,
        savedRuleCount: 0,
        legalSignalCount: 0,
        priorityGroupCount: 0,
      });
    }

    const cluster = clusters.get(clusterKey);
    const signal = getProfessionalReviewSignal(tx);
    cluster.transactionIndexes.push(index);
    cluster.transactionCount += 1;
    cluster.totalAmount = roundCurrency(cluster.totalAmount + tx.amount);
    incrementCountMap(cluster.currentClassifications, buildClassificationLabel(tx.plSection, tx.plGroup, tx.plAccount));
    incrementCountMap(cluster.scheduleCategories, tx.category || 'Uncategorized');
    incrementCountMap(cluster.types, tx.type || 'unknown');
    if (signal?.type) cluster.baseSignalTypes.add(signal.type);
    if (tx.sourceFile) cluster.sourceFiles.add(tx.sourceFile);
    cluster.sampleDescriptions.add(tx.description);
    if (isGenericProfitAndLossClassification(tx)) cluster.genericCount += 1;
    if (tx.classificationMeta?.forcedRuleApplied) cluster.forcedRuleCount += 1;
    if (tx.classificationMeta?.savedRuleApplied) cluster.savedRuleCount += 1;
    if (isPotentialLegalProfessionalDescription(tx.description)) cluster.legalSignalCount += 1;
    if (isVerifierPriorityGroup(tx.plGroup)) cluster.priorityGroupCount += 1;
  });

  return Array.from(clusters.values())
    .map((cluster) => {
      const currentClassificationOptions = getSortedCountEntries(cluster.currentClassifications);
      const scheduleCategoryOptions = getSortedCountEntries(cluster.scheduleCategories);
      const typeOptions = getSortedCountEntries(cluster.types);
      const dominantClassificationLabel = currentClassificationOptions[0]?.[0] || 'Unassigned / Unassigned / Unassigned';
      const [currentSection = 'Expenses', currentGroup = 'Other Expense', currentAccount = currentGroup] = dominantClassificationLabel.split(' / ');
      const dominantType = typeOptions[0]?.[0] || 'deduction';
      const hasClassificationConflict = currentClassificationOptions.length > 1;
      const hasScheduleCategoryConflict = scheduleCategoryOptions.length > 1;
      const highImpact = cluster.totalAmount >= OPENAI_VERIFIER_MIN_CLUSTER_AMOUNT;
      const hasTransferStyleQuestion = cluster.baseSignalTypes.has('transfer_review') || cluster.baseSignalTypes.has('refund_review');
      const allForcedRule = cluster.transactionCount > 0 && cluster.forcedRuleCount === cluster.transactionCount;
      const allSavedRule = cluster.transactionCount > 0 && cluster.savedRuleCount === cluster.transactionCount;
      const hasLegalLikeSignal = cluster.legalSignalCount > 0;
      const strictMaterialCluster = strictReview && cluster.totalAmount >= STRICT_REVIEW_MIN_CLUSTER_AMOUNT;
      const shouldVerify = !hasTransferStyleQuestion && !allForcedRule && !allSavedRule && (
        cluster.genericCount > 0
        || hasClassificationConflict
        || hasScheduleCategoryConflict
        || cluster.baseSignalTypes.has('category_conflict')
        || cluster.baseSignalTypes.has('generic_review')
        || (hasLegalLikeSignal && cluster.totalAmount >= 250)
        || highImpact
        || (cluster.priorityGroupCount > 0 && cluster.totalAmount >= 250)
        || strictMaterialCluster
      );
      const priorityScore = (
        (hasClassificationConflict ? 5000 : 0)
        + (cluster.baseSignalTypes.has('category_conflict') ? 3500 : 0)
        + (cluster.genericCount > 0 ? 2500 : 0)
        + (hasScheduleCategoryConflict ? 2000 : 0)
        + (hasLegalLikeSignal ? 1800 : 0)
        + (cluster.priorityGroupCount > 0 ? 1500 : 0)
        + (highImpact ? 1000 : 0)
        + (strictMaterialCluster ? 900 : 0)
        + Math.min(cluster.totalAmount, 500000) / 100
      );

      return {
        key: cluster.key,
        label: cluster.label,
        dominantType,
        transactionIndexes: cluster.transactionIndexes,
        transactionCount: cluster.transactionCount,
        totalAmount: roundCurrency(cluster.totalAmount),
        currentClassificationLabel: dominantClassificationLabel,
        currentClassification: {
          section: currentSection,
          group: currentGroup,
          account: currentAccount,
        },
        currentClassificationOptions: currentClassificationOptions.slice(0, 3).map(([label, count]) => ({ label, count })),
        scheduleCategoryOptions: scheduleCategoryOptions.slice(0, 3).map(([label, count]) => ({ label, count })),
        baseSignalTypes: Array.from(cluster.baseSignalTypes),
        sampleDescriptions: Array.from(cluster.sampleDescriptions).slice(0, 3),
        sourceFiles: Array.from(cluster.sourceFiles),
        hasClassificationConflict,
        hasScheduleCategoryConflict,
        hasLegalLikeSignal,
        highImpact,
        strictMaterialCluster,
        shouldVerify,
        priorityScore,
      };
    })
    .filter((cluster) => cluster.shouldVerify)
    .sort((a, b) => b.priorityScore - a.priorityScore || b.totalAmount - a.totalAmount)
    .slice(0, MAX_OPENAI_VERIFIER_CLUSTERS);
}

async function requestProfessionalVerifierDecisions(candidates, companyProfile = null) {
  const configuredClassifications = getConfiguredProfessionalVerifierClassifications(companyProfile);
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['clusterDecisions'],
    properties: {
      clusterDecisions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['clusterKey', 'classificationId', 'confidence', 'needsUserConfirmation', 'reason', 'alternatives'],
          properties: {
            clusterKey: { type: 'string', minLength: 1 },
            classificationId: { type: 'string', minLength: 1 },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            needsUserConfirmation: { type: 'boolean' },
            reason: { type: 'string' },
            alternatives: {
              type: 'array',
              items: { type: 'string' },
              maxItems: 2,
            },
          },
        },
      },
    },
  };

  const prompt = [
    'You are a senior bookkeeper performing a second-pass category review for bank-statement clusters before a professional cash-basis P&L is built.',
    'Choose exactly one classificationId from the allowed chart of accounts for each cluster.',
    'Do not invent new accounts, sections, or ids.',
    'Use ignore_transfer for internal transfers, credit-card payments, balance-sheet activity, owner movements, or loan activity.',
    'Trust-company wires, attorney payments, law firms, retainers, and professional advisory/consulting vendors can still be Legal & Professional Fees even when the bank memo contains wire or transfer wording.',
    'Use expenses_ask_my_accountant when the item is business-related but still unclear or should stay in a suspense bucket.',
    'Use cogs_subcontractors for contractors or vendors paid to deliver client work.',
    'Use cogs_advertising_lead_generation for lead-gen and direct-response marketing payout rails such as Steven/ST vendor payments.',
    'Schedule C category is a hint, not the final source of truth.',
    'If the evidence is mixed, the amount is large, or the current guess could reasonably be wrong, set needsUserConfirmation to true.',
    'Keep reasons short and specific.',
    '',
    'ALLOWED_CLASSIFICATIONS:',
    JSON.stringify(configuredClassifications, null, 2),
    '',
    'CLUSTERS_TO_REVIEW:',
    JSON.stringify(candidates.map((cluster) => ({
      clusterKey: cluster.key,
      label: cluster.label,
      dominantType: cluster.dominantType,
      transactionCount: cluster.transactionCount,
      totalAmount: cluster.totalAmount,
      currentClassificationOptions: cluster.currentClassificationOptions,
      scheduleCategoryOptions: cluster.scheduleCategoryOptions,
      baseSignalTypes: cluster.baseSignalTypes,
      sourceFiles: cluster.sourceFiles,
      sampleDescriptions: cluster.sampleDescriptions,
      flags: {
        hasClassificationConflict: cluster.hasClassificationConflict,
        hasScheduleCategoryConflict: cluster.hasScheduleCategoryConflict,
        hasLegalLikeSignal: cluster.hasLegalLikeSignal,
        highImpact: cluster.highImpact,
      },
    })), null, 2),
  ].join('\n');

  const response = await withTimeout(
    openai.responses.create({
      model: OPENAI_MODEL,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          name: 'professional_pl_cluster_decisions',
          strict: true,
          schema,
        },
      },
    }),
    OPENAI_TIMEOUT_MS,
    `OpenAI verifier timed out after ${Math.round(OPENAI_TIMEOUT_MS / 1000)} seconds`,
  );

  const payload = parseStructuredExtractionPayload(response.output_text || '');
  return Array.isArray(payload?.clusterDecisions) ? payload.clusterDecisions : [];
}

async function runProfessionalOpenAiVerifier(
  transactions,
  reviewMode = PROFESSIONAL_REVIEW_STANDARD,
  companyProfile = null,
) {
  const strictReview = isStrictProfessionalReviewMode(reviewMode);
  const summary = {
    enabled: Boolean(openai),
    model: openai ? OPENAI_MODEL : null,
    reviewMode: normalizeProfessionalReviewMode(reviewMode),
    strictReview,
    evaluatedClusterCount: 0,
    autoAppliedClusterCount: 0,
    reviewSuggestedClusterCount: 0,
    warning: null,
    reviewSuggestions: [],
  };

  if (!openai) {
    return summary;
  }

  const candidates = buildProfessionalVerifierCandidates(transactions, reviewMode);
  summary.evaluatedClusterCount = candidates.length;

  if (candidates.length === 0) {
    return summary;
  }

  const candidateByKey = new Map(candidates.map((candidate) => [candidate.key, candidate]));

  try {
    const decisions = await requestProfessionalVerifierDecisions(candidates, companyProfile);

    for (const rawDecision of decisions) {
      const clusterKey = normalizeWhitespace(rawDecision?.clusterKey);
      const candidate = clusterKey ? candidateByKey.get(clusterKey) : null;
      if (!candidate) continue;

      const classificationId = normalizeWhitespace(rawDecision?.classificationId);
      const classification = getConfiguredProfessionalVerifierClassificationById(classificationId, companyProfile);
      if (!classification) continue;

      const confidence = clampVerifierConfidence(rawDecision?.confidence);
      const reason = normalizeWhitespace(rawDecision?.reason);
      const alternatives = Array.from(new Set(
        Array.isArray(rawDecision?.alternatives)
          ? rawDecision.alternatives.map((value) => normalizeWhitespace(value)).filter(Boolean)
          : [],
      ))
        .filter((value) => value !== classificationId && getConfiguredProfessionalVerifierClassificationById(value, companyProfile))
        .slice(0, 2);
      const suggestedLabel = buildClassificationLabel(classification.section, classification.group, classification.account);
      const currentLabel = candidate.currentClassificationLabel;
      const shouldAskUser = strictReview
        || Boolean(rawDecision?.needsUserConfirmation)
        || confidence < OPENAI_VERIFIER_AUTO_APPLY_CONFIDENCE;
      const shouldAutoApply = !strictReview && !shouldAskUser && suggestedLabel !== currentLabel;

      for (const transactionIndex of candidate.transactionIndexes) {
        const transaction = transactions[transactionIndex];
        if (!transaction) continue;

        transaction.classificationMeta = {
          ...transaction.classificationMeta,
          verifierConsidered: true,
          verifierModel: OPENAI_MODEL,
          verifierClusterKey: candidate.key,
          verifierClusterLabel: candidate.label,
          verifierSuggestedClassificationId: classification.id,
          verifierSuggestedSection: classification.section,
          verifierSuggestedGroup: classification.group,
          verifierSuggestedAccount: classification.account,
          verifierCurrentClassification: currentLabel,
          verifierConfidence: confidence,
          verifierReason: reason,
          verifierAlternatives: alternatives,
          verifierNeedsUserConfirmation: shouldAskUser,
          verifierAutoApplied: shouldAutoApply,
        };

        if (shouldAutoApply) {
          transaction.plSection = classification.section;
          transaction.plGroup = classification.group;
          transaction.plAccount = classification.account;
          transaction.classificationMeta.inferenceSource = 'openai_verifier';
          transaction.classificationMeta.inferenceReason = `openai_verifier:${classification.id}`;
          transaction.classificationMeta.finalSection = classification.section;
          transaction.classificationMeta.finalGroup = classification.group;
          transaction.classificationMeta.finalAccount = classification.account;
        }
      }

      if (shouldAutoApply) {
        summary.autoAppliedClusterCount += 1;
      } else if (shouldAskUser) {
        summary.reviewSuggestions.push({
          key: candidate.key,
          label: candidate.label,
          suggestedClassificationId: classification.id,
          suggestedClassificationLabel: suggestedLabel,
          suggestedClassification: classification,
          currentClassificationLabel: currentLabel,
          currentClassification: candidate.currentClassification,
          confidence,
          reason,
          alternatives,
          transactionIndexes: candidate.transactionIndexes,
          transactionCount: candidate.transactionCount,
          totalAmount: candidate.totalAmount,
          sampleDescriptions: candidate.sampleDescriptions,
          sourceFiles: candidate.sourceFiles,
          strictConfirmationOnly: strictReview && suggestedLabel === currentLabel,
        });
      }
    }
  } catch (err) {
    console.error('OpenAI verifier failed:', err.message);
    summary.warning = `OpenAI verifier was unavailable, so this run fell back to Gemini extraction plus local rules only: ${err.message}`;
  }

  summary.reviewSuggestedClusterCount = summary.reviewSuggestions.length;
  return summary;
}

function buildProfessionalVerifierReviewQuestions(
  verifierState,
  reviewMode = PROFESSIONAL_REVIEW_STANDARD,
  companyProfile = null,
) {
  const strictReview = isStrictProfessionalReviewMode(reviewMode);

  if (!Array.isArray(verifierState?.reviewSuggestions) || verifierState.reviewSuggestions.length === 0) {
    return [];
  }

  return verifierState.reviewSuggestions.map((suggestion, index) => {
    const classification = suggestion.suggestedClassification;
    const suggestedShortLabel = classification.account && classification.account !== classification.group
      ? classification.account
      : classification.group;
    const currentShortLabel = suggestion.currentClassificationLabel.split(' / ').slice(-1)[0] || suggestion.currentClassificationLabel;
    const suggestionsMatchCurrent = suggestion.suggestedClassificationLabel === suggestion.currentClassificationLabel;
    const options = [];

    if (suggestionsMatchCurrent) {
      options.push(
        createReviewOption(
          'confirm_current',
          `Confirm current guess: ${currentShortLabel}`,
          `Keep this cluster in ${suggestion.currentClassificationLabel}.`,
          buildClassificationOverride(suggestion.currentClassification),
          { recommended: true },
        ),
      );
    } else {
      options.push(
        createReviewOption(
          'use_openai_suggestion',
          `Use OpenAI suggestion: ${suggestedShortLabel}`,
          `Move this cluster to ${suggestion.suggestedClassificationLabel}.`,
          buildClassificationOverride(classification),
          { recommended: true },
        ),
        createReviewOption(
          'keep_current',
          `Keep current guess: ${currentShortLabel}`,
          `Leave this cluster in ${suggestion.currentClassificationLabel}.`,
          buildClassificationOverride(suggestion.currentClassification),
        ),
      );
    }

    const alternativeId = suggestion.alternatives.find((value) => buildVerifierClassificationLabel(value, companyProfile) !== suggestion.currentClassificationLabel);
    const alternativeClassification = getConfiguredProfessionalVerifierClassificationById(alternativeId, companyProfile);
    if (alternativeClassification && alternativeClassification.id !== classification.id) {
      options.push(
        createReviewOption(
          'use_alternative',
          `Alternative: ${alternativeClassification.account !== alternativeClassification.group ? alternativeClassification.account : alternativeClassification.group}`,
          `Use ${buildClassificationLabel(alternativeClassification.section, alternativeClassification.group, alternativeClassification.account)} instead.`,
          buildClassificationOverride(alternativeClassification),
        ),
      );
    }

    if (classification.section !== 'Ignore') {
      options.push(
        createReviewOption(
          'exclude',
          'Exclude from the P&L',
          'Treat this cluster as transfer or non-P&L activity.',
          { plSection: 'Ignore', plGroup: 'Transfers', plAccount: 'Internal Transfer' },
        ),
      );
    }

    return {
      id: `review_verifier_${index + 1}`,
      type: 'verifier_category_review',
      priority: strictReview ? 2 : 2.5,
      title: suggestion.label
        ? suggestionsMatchCurrent
          ? `Should we confirm "${suggestion.label}"?`
          : `Should "${suggestion.label}" be reclassified?`
        : 'Should we accept the OpenAI category suggestion for this cluster?',
      prompt: suggestionsMatchCurrent
        ? strictReview
          ? `Strict review is on, so this material or ambiguous cluster still needs your confirmation even though OpenAI agrees with the current professional classification of ${suggestion.currentClassificationLabel}.`
          : `OpenAI agrees with the current professional classification of ${suggestion.currentClassificationLabel}, but this cluster still needs confirmation.`
        : `OpenAI reviewed this cluster against the closed professional chart of accounts and suggests ${suggestion.suggestedClassificationLabel}.`,
      reason: suggestion.reason
        ? `${Math.round(suggestion.confidence * 100)}% confidence. ${suggestion.reason}`
        : `${Math.round(suggestion.confidence * 100)}% confidence from the second-pass verifier.`,
      currentClassification: suggestion.currentClassificationLabel,
      suggestedClassification: suggestion.suggestedClassificationLabel,
      verifierConfidence: suggestion.confidence,
      options,
      transactionIndexes: suggestion.transactionIndexes,
      transactionCount: suggestion.transactionCount,
      totalAmount: suggestion.totalAmount,
      sampleDescriptions: suggestion.sampleDescriptions,
      sourceFiles: suggestion.sourceFiles,
      clusterLabel: suggestion.label,
    };
  });
}

function buildProfessionalReviewQuestions(transactions, reviewMode = PROFESSIONAL_REVIEW_STANDARD) {
  const strictReview = isStrictProfessionalReviewMode(reviewMode);
  const questionBuckets = new Map();

  transactions.forEach((tx, index) => {
    const signal = getProfessionalReviewSignal(tx);
    if (!signal) return;

    const bucketInfo = buildReviewBucketInfo(signal.type, tx);
    const bucketKey = `${signal.type}::${bucketInfo.key}`;

    if (!questionBuckets.has(bucketKey)) {
      questionBuckets.set(bucketKey, {
        id: '',
        type: signal.type,
        priority: signal.priority,
        title: signal.title,
        prompt: signal.prompt,
        reason: signal.reason,
        options: signal.options,
        transactionIndexes: [],
        transactionCount: 0,
        totalAmount: 0,
        sampleDescriptions: new Set(),
        sourceFiles: new Set(),
        clusterLabel: bucketInfo.label,
        currentClassification: buildClassificationLabel(tx.plSection, tx.plGroup, tx.plAccount),
      });
    }

    const bucket = questionBuckets.get(bucketKey);
    bucket.transactionIndexes.push(index);
    bucket.transactionCount += 1;
    bucket.totalAmount += tx.amount;
    bucket.sampleDescriptions.add(tx.description);
    if (tx.sourceFile) bucket.sourceFiles.add(tx.sourceFile);
  });

  return Array.from(questionBuckets.values())
    .map((bucket, idx) => ({
      ...bucket,
      id: `review_${idx + 1}`,
      title: bucket.type === 'transfer_review'
        ? (bucket.clusterLabel
          ? `How should we treat transfer(s) for ${bucket.clusterLabel}?`
          : 'How should we treat these transfer-like transactions?')
        : bucket.title,
      totalAmount: roundCurrency(bucket.totalAmount),
      sampleDescriptions: Array.from(bucket.sampleDescriptions).slice(0, 3),
      sourceFiles: Array.from(bucket.sourceFiles),
    }))
    .filter((bucket) => strictReview || bucket.transactionCount > 1 || bucket.totalAmount >= 250)
    .sort((a, b) => a.priority - b.priority || b.totalAmount - a.totalAmount)
    .slice(0, getProfessionalReviewQuestionLimit(reviewMode));
}

function getPublicReviewQuestion(question) {
  return {
    id: question.id,
    title: question.title,
    clusterLabel: question.clusterLabel,
    prompt: question.prompt,
    reason: question.reason,
    currentClassification: question.currentClassification,
    suggestedClassification: question.suggestedClassification || '',
    verifierConfidence: question.verifierConfidence ?? null,
    transactionCount: question.transactionCount,
    totalAmount: question.totalAmount,
    sampleDescriptions: question.sampleDescriptions,
    sourceFiles: question.sourceFiles,
    options: question.options.map((option) => ({
      key: option.key,
      label: option.label,
      description: option.description,
      recommended: Boolean(option.recommended),
    })),
  };
}

async function buildProfessionalReviewState(
  transactions,
  fileErrorCount = 0,
  statementMetas = [],
  reviewMode = PROFESSIONAL_REVIEW_STANDARD,
  companyProfile = null,
) {
  const normalizedReviewMode = normalizeProfessionalReviewMode(reviewMode);
  const strictReview = isStrictProfessionalReviewMode(normalizedReviewMode);
  const normalizedTransactions = transactions.map(normalizeProfitAndLossTransaction);
  const persistedRuleSummary = applyPersistedReviewRules(normalizedTransactions, companyProfile);
  const verifierSummary = await runProfessionalOpenAiVerifier(normalizedTransactions, normalizedReviewMode, companyProfile);
  const verifierQuestions = buildProfessionalVerifierReviewQuestions(verifierSummary, normalizedReviewMode, companyProfile);
  const verifierQuestionTransactionIndexes = new Set(verifierQuestions.flatMap((question) => question.transactionIndexes));
  const baseQuestions = buildProfessionalReviewQuestions(normalizedTransactions, normalizedReviewMode)
    .filter((question) => {
      if (!['generic_review', 'category_conflict'].includes(question.type)) {
        return true;
      }

      return !question.transactionIndexes.some((index) => verifierQuestionTransactionIndexes.has(index));
    });
  const questions = selectProfessionalReviewQuestions(baseQuestions, verifierQuestions, normalizedReviewMode);
  const warningParts = [];
  if (fileErrorCount > 0) {
    warningParts.push(`${fileErrorCount} file(s) failed during extraction. Review answers will only affect successfully processed statements.`);
  }
  if (verifierSummary.warning) {
    warningParts.push(verifierSummary.warning);
  }
  const warning = warningParts.length > 0 ? warningParts.join(' ') : null;
  const verifierSummaryText = verifierSummary.enabled && verifierSummary.evaluatedClusterCount > 0
    ? strictReview
      ? ` OpenAI reviewed ${verifierSummary.evaluatedClusterCount.toLocaleString()} high-impact or material cluster(s) and held ${verifierSummary.reviewSuggestedClusterCount.toLocaleString()} for your confirmation.`
      : ` OpenAI reviewed ${verifierSummary.evaluatedClusterCount.toLocaleString()} high-impact cluster(s) and auto-applied ${verifierSummary.autoAppliedClusterCount.toLocaleString()} confident mapping(s).`
    : '';
  const persistedRuleText = persistedRuleSummary.appliedRuleCount > 0
    ? ` Saved review rules auto-applied ${persistedRuleSummary.appliedRuleCount.toLocaleString()} cluster decision(s) before review.`
    : '';
  const strictReviewText = strictReview
    ? ' Strict review is on, so the professional P&L will pause for any material or unclear cluster instead of auto-applying verifier remaps.'
    : '';

  return {
    companyId: companyProfile?.id || null,
    transactions: normalizedTransactions,
    reviewMode: normalizedReviewMode,
    statementMetas: buildReportStatementMetas(statementMetas),
    persistedRuleSummary,
    verifierSummary,
    questions,
    publicReview: {
      companyId: companyProfile?.id || null,
      companyName: companyProfile?.name || '',
      reviewMode: normalizedReviewMode,
      totalQuestions: questions.length,
      summary: `We found ${questions.length} clarification question(s) before finalizing the professional P&L.${strictReviewText}${persistedRuleText}${verifierSummaryText}`,
      warning,
      questions: questions.map(getPublicReviewQuestion),
    },
  };
}

function normalizeReviewAnswersPayload(answers) {
  if (Array.isArray(answers)) {
    return answers;
  }

  if (answers && typeof answers === 'object') {
    return Object.entries(answers)
      .filter(([questionId, optionKey]) => questionId && typeof optionKey === 'string' && optionKey)
      .map(([questionId, optionKey]) => ({ questionId, optionKey }));
  }

  return [];
}

function applyReviewAnswers(reviewState, answers) {
  const answerMap = new Map(normalizeReviewAnswersPayload(answers).map((answer) => [answer.questionId, answer.optionKey]));
  const appliedAnswers = [];

  for (const question of reviewState.questions) {
    const selectedOptionKey = answerMap.get(question.id);

    if (!selectedOptionKey) {
      throw new Error(`Missing answer for review question "${question.title}"`);
    }

    const selectedOption = question.options.find((option) => option.key === selectedOptionKey);
    if (!selectedOption) {
      throw new Error(`Invalid answer submitted for review question "${question.title}"`);
    }

    for (const transactionIndex of question.transactionIndexes) {
      const transaction = reviewState.transactions[transactionIndex];
      if (!transaction) continue;

      transaction.plSection = selectedOption.override.plSection;
      transaction.plGroup = selectedOption.override.plGroup;
      transaction.plAccount = selectedOption.override.plAccount;
      transaction.classificationMeta = {
        ...transaction.classificationMeta,
        userReviewApplied: true,
        finalSection: selectedOption.override.plSection,
        finalGroup: selectedOption.override.plGroup,
        finalAccount: selectedOption.override.plAccount,
      };

      if (selectedOption.override.category) {
        transaction.category = selectedOption.override.category;
      }
    }

    appliedAnswers.push({
      questionId: question.id,
      questionTitle: question.title,
      questionType: question.type,
      answerKey: selectedOption.key,
      answerLabel: selectedOption.label,
    });
  }

  return appliedAnswers;
}

function getOrCreateSection(sectionMap, sectionName) {
  if (!sectionMap.has(sectionName)) {
    sectionMap.set(sectionName, {
      name: sectionName,
      total: 0,
      groups: new Map(),
    });
  }

  return sectionMap.get(sectionName);
}

function getOrCreateGroup(section, groupName) {
  if (!section.groups.has(groupName)) {
    section.groups.set(groupName, {
      name: groupName,
      total: 0,
      count: 0,
      accounts: new Map(),
    });
  }

  return section.groups.get(groupName);
}

function getOrCreateAccount(group, accountName) {
  if (!group.accounts.has(accountName)) {
    group.accounts.set(accountName, {
      name: accountName,
      total: 0,
      count: 0,
    });
  }

  return group.accounts.get(accountName);
}

function materializeSection(section) {
  const groups = Array.from(section.groups.values())
    .map((group) => ({
      name: group.name,
      total: roundCurrency(group.total),
      count: group.count,
      accounts: Array.from(group.accounts.values())
        .map((account) => ({
          name: account.name,
          total: roundCurrency(account.total),
          count: account.count,
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return {
    name: section.name,
    total: roundCurrency(section.total),
    groups,
  };
}

function buildProfitAndLossRows(sections, totals) {
  const sectionMap = new Map(sections.map((section) => [section.name, section]));
  const rows = [];

  const pushSectionRows = (sectionName) => {
    const section = sectionMap.get(sectionName);
    if (!section || section.total === 0) return;

    rows.push({ type: 'section', label: section.name, total: null, depth: 0 });

    for (const group of section.groups) {
      const isDetailed = group.accounts.length > 1 || (group.accounts[0] && group.accounts[0].name !== group.name);

      if (isDetailed) {
        rows.push({ type: 'group', label: group.name, total: null, depth: 1 });
        for (const account of group.accounts) {
          rows.push({ type: 'detail', label: account.name, total: account.total, depth: 2 });
        }
        rows.push({ type: 'subtotal', label: `Total for ${group.name}`, total: group.total, depth: 1 });
      } else {
        rows.push({ type: 'detail', label: group.name, total: group.total, depth: 1 });
      }
    }

    rows.push({ type: 'section-total', label: `Total for ${section.name}`, total: section.total, depth: 0 });
  };

  pushSectionRows('Income');
  pushSectionRows('Cost of Goods Sold');
  rows.push({ type: 'metric', label: 'Gross Profit', total: totals.grossProfit, depth: 0 });
  pushSectionRows('Expenses');
  rows.push({ type: 'metric', label: 'Net Operating Income', total: totals.netOperatingIncome, depth: 0 });

  const hasOtherActivity = totals.totalOtherIncome > 0 || totals.totalOtherExpenses > 0;
  if (hasOtherActivity) {
    pushSectionRows('Other Income');
    pushSectionRows('Other Expenses');
    rows.push({ type: 'metric', label: 'Net Other Income', total: totals.netOtherIncome, depth: 0 });
  }

  rows.push({ type: 'metric', label: 'Net Income', total: totals.netIncome, depth: 0 });
  return rows;
}

function buildTransferAuditClusters(classifiedTransactions) {
  const clusters = new Map();

  for (const tx of classifiedTransactions) {
    const meta = tx.classificationMeta || {};
    const isTransferLike = meta.transferSignalDetected || tx.plGroup === 'Transfers' || tx.plAccount === 'Internal Transfer';
    if (!isTransferLike) continue;

    const bucketInfo = buildTransferFingerprint(tx.description);
    const clusterKey = bucketInfo.key || `RAW::${normalizeFingerprintSource(tx.description)}`;

    if (!clusters.has(clusterKey)) {
      clusters.set(clusterKey, {
        label: bucketInfo.label || normalizeDescription(tx.description),
        count: 0,
        totalAmount: 0,
        includedCount: 0,
        excludedCount: 0,
        finalSections: new Set(),
        sampleDescriptions: new Set(),
      });
    }

    const cluster = clusters.get(clusterKey);
    cluster.count += 1;
    cluster.totalAmount += tx.amount;
    cluster.sampleDescriptions.add(tx.description);

    if (tx.plSection === 'Ignore') {
      cluster.excludedCount += 1;
    } else {
      cluster.includedCount += 1;
      if (tx.plSection) cluster.finalSections.add(tx.plSection);
    }
  }

  return Array.from(clusters.values())
    .sort((a, b) => b.totalAmount - a.totalAmount || b.count - a.count)
    .slice(0, 8)
    .map((cluster) => {
      let resolution = 'Excluded from the P&L';
      if (cluster.includedCount > 0 && cluster.excludedCount > 0) {
        resolution = 'Mixed handling: some kept, some excluded';
      } else if (cluster.includedCount > 0) {
        const sections = Array.from(cluster.finalSections);
        resolution = sections.length > 0
          ? `Kept in ${sections.join(' / ')}`
          : 'Kept in the P&L';
      }

      return {
        label: cluster.label,
        count: cluster.count,
        totalAmount: roundCurrency(cluster.totalAmount),
        resolution,
        sampleDescriptions: Array.from(cluster.sampleDescriptions).slice(0, 3),
      };
    });
}

function extractLastFourAccountDigits(value = '') {
  const matches = Array.from(normalizeWhitespace(value).matchAll(/(\d{4})/g)).map((match) => match[1]);

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const digits = matches[index];
    if (!digits.startsWith('20')) return digits;
  }

  return matches[matches.length - 1] || '';
}

function inferSourceInstitutionName(upperBaseName = '') {
  if (/CHASE/.test(upperBaseName)) return 'Chase';
  if (/AMEX|AMERICAN EXPRESS/.test(upperBaseName)) return 'Amex';
  if (/WELLS FARGO/.test(upperBaseName)) return 'Wells Fargo';
  if (/BANK OF AMERICA|BOFA/.test(upperBaseName)) return 'Bank of America';
  if (/BANCO DEL PACIFICO/.test(upperBaseName)) return 'Banco del Pacifico';
  return '';
}

function inferSourceAccountType(upperBaseName = '') {
  if (/FLOCC/.test(upperBaseName) || /\bCC\b/.test(upperBaseName) || /CREDIT CARD/.test(upperBaseName)) {
    return 'Credit Card';
  }

  if (/FLOMARKETING/.test(upperBaseName) || /\bCK\b/.test(upperBaseName) || /\bCHK\b/.test(upperBaseName) || /CHECKING/.test(upperBaseName)) {
    return 'Checking';
  }

  if (/SAVINGS/.test(upperBaseName)) {
    return 'Savings';
  }

  return '';
}

function buildSourceAccountTypeLabel(accountType = '') {
  if (accountType === 'Checking') return 'CK';
  if (accountType === 'Credit Card') return 'CC';
  if (accountType === 'Savings') return 'Savings';
  if (accountType === 'Loan') return 'Loan';
  return accountType;
}

function buildSourceAccountDisplayLabel({
  institution = '',
  accountType = '',
  accountLast4 = '',
  accountName = '',
  fallbackLabel = '',
}) {
  const compactType = buildSourceAccountTypeLabel(accountType);

  if (institution || compactType || accountLast4) {
    return normalizeWhitespace([institution, compactType, accountLast4].filter(Boolean).join(' '));
  }

  if (accountName) return accountName;
  return fallbackLabel || 'Uploaded Statement';
}

function inferSourceAccountMeta(sourceFile = '', statementMeta = null) {
  const rawBaseName = getSourceFileBaseLabel(sourceFile);
  const normalizedStatementMeta = statementMeta && typeof statementMeta === 'object' ? statementMeta : null;
  if (!rawBaseName) {
    return {
      sourceFile: normalizeWhitespace(sourceFile),
      key: 'UPLOADED STATEMENT',
      label: 'Uploaded Statement',
      rawSourceLabel: 'Uploaded Statement',
      inferenceNote: 'Grouped this source report by the uploaded filename because no statement account metadata was available.',
      statementStartDate: normalizedStatementMeta?.statementStartDate || '',
      statementEndDate: normalizedStatementMeta?.statementEndDate || '',
      openingBalance: normalizedStatementMeta?.openingBalance ?? null,
      closingBalance: normalizedStatementMeta?.closingBalance ?? null,
      currency: normalizedStatementMeta?.currency || 'USD',
      accountType: normalizedStatementMeta?.accountType || '',
      institution: normalizedStatementMeta?.institution || '',
      accountLast4: normalizedStatementMeta?.accountLast4 || '',
      accountName: normalizedStatementMeta?.accountName || '',
    };
  }

  const cleanedBaseName = cleanSourceFileStem(sourceFile) || rawBaseName;
  const upperBaseName = cleanedBaseName.toUpperCase();
  const fallbackInstitution = inferSourceInstitutionName(upperBaseName);
  const fallbackAccountType = normalizeAccountType(inferSourceAccountType(upperBaseName));
  const fallbackLastFour = extractLastFourAccountDigits(cleanedBaseName);
  const extractedInstitution = canonicalizeInstitutionName(normalizedStatementMeta?.institution || '');
  const extractedAccountType = normalizeAccountType(normalizedStatementMeta?.accountType || '');
  const extractedAccountName = toDisplayTitleCase(normalizedStatementMeta?.accountName || '');
  const extractedLastFour = extractLastFourAccountDigits(normalizedStatementMeta?.accountLast4 || '');
  const institution = extractedInstitution || fallbackInstitution;
  const accountType = extractedAccountType || fallbackAccountType;
  const accountLast4 = extractedLastFour || fallbackLastFour;
  const fallbackLabel = /ASK MY ACCOUNTANT/.test(upperBaseName)
    ? 'Ask My Accountant'
    : /SUBCONTRACTORS?/.test(upperBaseName)
      ? 'Subcontractors'
      : toDisplayTitleCase(cleanedBaseName);
  const label = buildSourceAccountDisplayLabel({
    institution,
    accountType,
    accountLast4,
    accountName: extractedAccountName,
    fallbackLabel,
  });

  const normalizedLabel = normalizeWhitespace(label) || 'Uploaded Statement';
  const noteParts = [];
  const hasExtractedIdentity = Boolean(
    extractedInstitution
    || extractedAccountType
    || extractedAccountName
    || extractedLastFour,
  );

  if (cleanedBaseName !== rawBaseName) {
    noteParts.push('Normalized the source filename by removing generic prefixes, dates, and upload noise before grouping related statement activity.');
  }

  if (hasExtractedIdentity) {
    noteParts.push('Grouped this source report using extracted statement metadata when available.');
  } else if (institution || accountType || accountLast4) {
    noteParts.push('Grouped this source report using account hints found in the uploaded filename.');
  } else {
    noteParts.push('Grouped this source report by a normalized source filename because no explicit account number was detected.');
  }

  const keySeed = institution && accountType && accountLast4
    ? [institution, accountType, accountLast4].join('::')
    : [institution, accountType, accountLast4, extractedAccountName || normalizedLabel]
      .filter(Boolean)
      .join('::') || normalizedLabel;

  return {
    sourceFile: normalizeWhitespace(sourceFile),
    key: normalizeFingerprintSource(keySeed),
    label: normalizedLabel,
    rawSourceLabel: extractedAccountName || toDisplayTitleCase(cleanedBaseName) || normalizedLabel,
    inferenceNote: noteParts.join(' '),
    statementStartDate: normalizedStatementMeta?.statementStartDate || '',
    statementEndDate: normalizedStatementMeta?.statementEndDate || '',
    openingBalance: normalizedStatementMeta?.openingBalance ?? null,
    closingBalance: normalizedStatementMeta?.closingBalance ?? null,
    currency: normalizedStatementMeta?.currency || 'USD',
    accountType,
    institution,
    accountLast4,
    accountName: extractedAccountName,
  };
}

function inferSourceAccountLabel(sourceFile = '', statementMeta = null) {
  return inferSourceAccountMeta(sourceFile, statementMeta).label;
}

function inferCounterpartyName(description = '') {
  const beneficiary = buildTransferBeneficiary(description);
  if (beneficiary) return toDisplayTitleCase(beneficiary);

  const normalized = normalizeWhitespace(description)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/g, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/\b(?:ONLINE|INTERNATIONAL|DOMESTIC|WIRE|TRANSFER|TRANSFERS|PAYMENT|PAYMENTS|PURCHASE|DEBIT|CREDIT|WITHDRAWAL|DEPOSIT|REFUND|REVERSAL|CARD|CHECKCARD|CARDMEMBER|SERVICE|THANK|YOU|ACH|POS|VIA|BANK|BANKING|A\/C|ACCOUNT|ACCT|REF|REFERENCE|TRACE|TRN|IMAD|OMAD|ABA|SWIFT|ROUTING|BEN|BENEFICIARY|AUTH|AUTHORIZED|ON|TO|FROM|SAME|DAY)\b/gi, ' ')
    .replace(/[^A-Za-z0-9&/.' -]+/g, ' ');

  const stopwords = new Set([
    'THE',
    'AND',
    'FOR',
    'WITH',
    'LLC',
    'INC',
    'CO',
    'COMPANY',
    'BUSINESS',
    'NEGOCIOS',
    'GASTOS',
  ]);

  const tokens = normalized
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopwords.has(token.toUpperCase()));

  const candidate = tokens.slice(0, 6).join(' ');
  return toDisplayTitleCase(candidate) || 'Unspecified Counterparty';
}

function canonicalizeCounterpartyName(name = '', description = '') {
  const normalizedName = normalizeWhitespace(name);
  const upperName = normalizedName.toUpperCase();
  const upperDescription = normalizeWhitespace(description).toUpperCase();
  const source = `${upperName} ${upperDescription}`;

  if (/\bRTP\/?\s*SAME\s*DAY\b/.test(source)) return 'RTP/Same Day';
  if (/ST 0791/.test(source)) return 'St 0791';
  if (/STEVEN 2751/.test(source)) return 'Steven 2751';
  if (/LEGAT\s+VENDOR\s+MARKETING/.test(source)) return 'Legat Marketing Realtime';
  if (/ALL\s+VENDOR\s+AMERICAN\s+PAYMENT\s+MARKETING/.test(source)) return 'All American Marketing Realtime';
  if (/MOVE\s+VENDOR\s+AROUND/.test(source)) return 'Movearound Realtime';
  if (/ALL\s*AMERICAN\s*MARKETING|ALLAMERICANMARKETING/.test(source)) return 'All American Marketing';
  if (/LEGAT\s*MARKETING|LEGATMARKETING/.test(source)) return 'Legatmarketing';
  if (/MOVE\s*AROUND|MOVEAROUND/.test(source)) return 'Movearound';
  if (/CYBERNEX/.test(source)) return 'Cybernex Solutions';
  if (/EXPRESSO/.test(source)) return 'Expresso';
  if (/DENNI DIAZ/.test(source)) return 'Denni Diaz';
  if (/ERANOVUM/.test(source)) return 'Eranovum Group';
  if (/KATIE TUTOR/.test(source)) return 'Katie Tutor';
  if (/LEO SIGNER/.test(source)) return 'Leo Signer';
  if (/ANA BELKIS/.test(source)) return 'Ana Belkis';
  if (/KISAE/.test(source)) return 'Kisae';
  if (/VANESSA LOPEZ/.test(source)) return 'Vanessa Lopez';
  if (/RAY RAY/.test(source)) return 'Ray Ray';
  if (/YEAN/.test(source)) return 'Yean';
  if (/AIDELY/.test(source)) return 'Aidely';
  if (/VERO/.test(source)) return 'Vero';
  if (/PERCY PONCE/.test(source)) return 'Percy Ponce';
  if (/SANTIAGO/.test(source)) return 'Santiago';
  if (/TREZIL/.test(source)) return 'Trezil';
  if (/LUIS CARLOS/.test(source)) return 'Luis Carlos';
  if (/YORDAN BARRERA/.test(source)) return 'Yordan Barrera';
  if (/YEHUDIS/.test(source)) return 'Yehudis';
  if (/JAVIER/.test(source)) return 'Javier';
  if (/DIEGO/.test(source)) return 'Diego';
  if (/AUSTIN/.test(source)) return 'Austin';
  if (/TAMIR/.test(source)) return 'Tamir';
  if (/MARLENE/.test(source)) return 'Marlene';
  if (/HUGO/.test(source)) return 'Hugo';
  if (/VALET JOSE/.test(source)) return 'Valet Jose';
  if (/LEYANI CLEANING/.test(source)) return 'Leyani Cleaning';
  if (/DANIEL CAR WASH/.test(source)) return 'Daniel Car Wash';
  if (/LAWRENCE CAPLAN/.test(source)) return 'Lawrence Caplan';
  if (/FACEBK|FACEBOOK/.test(source)) return 'Facebook';
  if (/GOOGLE/.test(source) && /(ADS|ADWORDS|SEM|PPC)/.test(source)) return 'Google ADS';
  if (/GOOGLE/.test(source) && /(GSUITE|WORKSPACE)/.test(source)) return 'Google Workspace';
  if (/PATH SOCIAL/.test(source)) return 'Path Social';
  if (/COMCAST|XFINITY/.test(source)) return 'Comcast';
  if (/AT&T|ATT\b/.test(source)) return 'AT&T';
  if (/GEICO/.test(source)) return 'Geico';
  if (/UBER/.test(source) && /EATS/.test(source)) return 'Uber Eats';
  if (/UBER/.test(source)) return 'Uber.com';
  if (/AIRBNB|HOTEL|LODGE|MARRIOTT|HILTON|HYATT|BOOKING/.test(source)) return 'Lodging';
  if (/AMERICAN AIR|AIRFARE|AIRLINES|DELTA|UNITED|JETBLUE|SOUTHWEST|SPIRIT|AVIANCA/.test(source)) return 'Airfare';
  if (/HERTZ|AVIS|ENTERPRISE|RENT-A-CAR/.test(source)) return 'Car Rental';
  if (/SHELL|CHEVRON|EXXON|MARATHON|FUEL|GAS\b/.test(source)) return 'Fuel';
  return normalizedName || inferCounterpartyName(description);
}

function getQuickReportTransactionType(tx) {
  const upperDescription = tx.description.toUpperCase();
  const transferLike = looksLikeTransferOrBalanceSheet(tx);

  if (tx.type === 'deposit') {
    if (transferLike && tx.plSection === 'Ignore') return 'Transfer In';
    if (/REFUND|REVERSAL|CREDIT/.test(upperDescription)) return 'Credit';
    return 'Deposit';
  }

  if (transferLike && tx.plSection === 'Ignore') return 'Transfer Out';
  return 'Expense';
}

function getDistributionQuickReportSignedAmount(tx) {
  const incomeLike = tx.plSection === 'Income' || tx.plSection === 'Other Income';
  return roundCurrency(tx.type === (incomeLike ? 'deposit' : 'deduction') ? tx.amount : -tx.amount);
}

function isCreditCardPaymentDescription(description = '') {
  return /\bPAYMENT THANK YOU\b|\bPAYMENT TO CHASE CARD\b|\bCARDMEMBER SERVICE\b|\bAMEX EPAYMENT\b|\bCREDIT CARD PAYMENT\b|\bBANK PMT\b|\bAMERICAN EXPRESS\b.*\bPMT\b|\bCAPITAL ONE\b.*\bCRCARDPMT\b|\bAPPLECARD\b/i.test(description);
}

function isCreditCardCreditDescription(description = '') {
  if (/PREMIUM CREDIT BUREAU/i.test(description)) return false;

  return /^\s*CREDIT\b/i.test(description)
    || /\bREFUND\b|\bREVERSAL\b|\bTRAVEL CREDIT\b|\bSTATEMENT CREDIT\b|\bMERCHANDISE CREDIT\b|\bCREDIT ADJUSTMENT\b|\bREWARD\b/i.test(description);
}

function getSourceQuickReportTransactionType(tx, accountType = '') {
  const upperDescription = tx.description.toUpperCase();

  if (accountType === 'Credit Card') {
    if (isCreditCardPaymentDescription(upperDescription)) return 'Credit Card Payment';
    if (isCreditCardCreditDescription(upperDescription) || tx.type === 'deposit') return 'Credit Card Credit';
    return 'Expense';
  }

  return getQuickReportTransactionType(tx);
}

function getSourceQuickReportSignedAmount(tx, accountType = '') {
  if (accountType === 'Credit Card' || accountType === 'Loan') {
    if (isCreditCardPaymentDescription(tx.description) || isCreditCardCreditDescription(tx.description) || tx.type === 'deposit') {
      return roundCurrency(-tx.amount);
    }
    return roundCurrency(tx.amount);
  }

  return roundCurrency(tx.type === 'deposit' ? tx.amount : -tx.amount);
}

function compareProfessionalLedgerEntries(a, b) {
  return a.sortDateValue - b.sortDateValue
    || a.date.localeCompare(b.date)
    || a.sourceAccount.localeCompare(b.sourceAccount)
    || a.memo.localeCompare(b.memo)
    || a.amount - b.amount;
}

function buildProfessionalLedgerEntries(classifiedTransactions) {
  return classifiedTransactions
    .map((tx, index) => {
      const parsedDate = parsePotentialDate(tx.date);
      const sourceMeta = inferSourceAccountMeta(tx.sourceFile, tx.sourceStatementMeta);
      const decisionSource = tx.classificationMeta?.modelSectionProvided
        || tx.classificationMeta?.modelGroupProvided
        || tx.classificationMeta?.modelAccountProvided
        ? 'model'
        : 'rule';
      const counterpartyName = canonicalizeCounterpartyName(inferCounterpartyName(tx.description), tx.description);
      const classificationLabel = tx.plAccount || tx.plGroup || tx.category || 'Uncategorized';
      const sourceTransactionType = getSourceQuickReportTransactionType(tx, sourceMeta.accountType);

      return {
        id: `ledger_${index + 1}`,
        date: tx.date,
        sortDateValue: parsedDate ? parsedDate.getTime() : Number.MAX_SAFE_INTEGER,
        transactionType: getQuickReportTransactionType(tx),
        sourceTransactionType,
        name: counterpartyName || classificationLabel,
        counterpartyName,
        classificationLabel,
        memo: tx.description,
        distributionAccount: tx.plGroup || 'Uncategorized',
        sourceAccount: sourceMeta.label,
        sourceAccountKey: sourceMeta.key,
        sourceAccountInference: sourceMeta.inferenceNote,
        sourceStatementLabel: sourceMeta.rawSourceLabel,
        sourceStatementMeta: sourceMeta,
        sourceAccountType: sourceMeta.accountType,
        sourceFile: tx.sourceFile,
        amount: tx.amount,
        type: tx.type,
        section: tx.plSection,
        category: tx.category,
        excluded: tx.plSection === 'Ignore',
        distributionSignedAmount: getDistributionQuickReportSignedAmount(tx),
        sourceSignedAmount: getSourceQuickReportSignedAmount(tx, sourceMeta.accountType),
        decisionSource,
        decisionReason: tx.classificationMeta?.inferenceReason || '',
      };
    })
    .sort(compareProfessionalLedgerEntries);
}

function buildSourceLedgerEntries(classifiedTransactions) {
  return classifiedTransactions
    .map((tx, index) => {
      const parsedDate = parsePotentialDate(tx.date);
      const sourceMeta = inferSourceAccountMeta(tx.sourceFile, tx.sourceStatementMeta);
      const counterpartyName = canonicalizeCounterpartyName(inferCounterpartyName(tx.description), tx.description);
      const classificationLabel = tx.plAccount || tx.plGroup || tx.category || 'Uncategorized';
      const sourceTransactionType = getSourceQuickReportTransactionType(tx, sourceMeta.accountType);

      return {
        id: `source_ledger_${index + 1}`,
        date: tx.date,
        sortDateValue: parsedDate ? parsedDate.getTime() : Number.MAX_SAFE_INTEGER,
        transactionType: sourceTransactionType,
        sourceTransactionType,
        name: counterpartyName || classificationLabel,
        counterpartyName,
        classificationLabel,
        memo: tx.description,
        distributionAccount: tx.plGroup || tx.category || 'Uncategorized',
        sourceAccount: sourceMeta.label,
        sourceAccountKey: sourceMeta.key,
        sourceAccountInference: sourceMeta.inferenceNote,
        sourceStatementLabel: sourceMeta.rawSourceLabel,
        sourceStatementMeta: sourceMeta,
        sourceAccountType: sourceMeta.accountType,
        sourceFile: tx.sourceFile,
        amount: tx.amount,
        type: tx.type,
        section: tx.plSection,
        category: tx.category,
        excluded: tx.plSection === 'Ignore',
        sourceSignedAmount: getSourceQuickReportSignedAmount(tx, sourceMeta.accountType),
      };
    })
    .sort(compareProfessionalLedgerEntries);
}

function compareStatementSources(a, b) {
  const aStart = parsePotentialDate(a?.statementStartDate || a?.statementEndDate);
  const bStart = parsePotentialDate(b?.statementStartDate || b?.statementEndDate);

  if (aStart && bStart && aStart.getTime() !== bStart.getTime()) {
    return aStart - bStart;
  }

  if (aStart && !bStart) return -1;
  if (!aStart && bStart) return 1;

  return normalizeWhitespace(a?.sourceFile).localeCompare(normalizeWhitespace(b?.sourceFile));
}

function formatStatementCoverageDate(value) {
  const parsed = parsePotentialDate(value);
  if (!parsed) return normalizeWhitespace(value);

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function buildStatementCoverageLabel(statementSources = []) {
  const ordered = statementSources.slice().sort(compareStatementSources);
  if (ordered.length === 0) return '';

  const start = ordered[0]?.statementStartDate || ordered[0]?.statementEndDate || '';
  const end = ordered[ordered.length - 1]?.statementEndDate || ordered[ordered.length - 1]?.statementStartDate || '';

  if (start && end) return `${formatStatementCoverageDate(start)} - ${formatStatementCoverageDate(end)}`;
  if (start) return formatStatementCoverageDate(start);
  if (end) return formatStatementCoverageDate(end);
  return '';
}

function buildCoverageMonthKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatCoverageMonthKey(monthKey = '') {
  const normalized = normalizeWhitespace(monthKey);
  if (!/^\d{4}-\d{2}$/.test(normalized)) return normalized;

  const [year, month] = normalized.split('-').map((part) => parseInt(part, 10));
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return normalized;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function summarizeCoverageMonths(monthKeys = [], maxItems = 4) {
  const uniqueKeys = Array.from(new Set(monthKeys.filter(Boolean))).sort();
  if (uniqueKeys.length === 0) return '';

  const labels = uniqueKeys.map((monthKey) => formatCoverageMonthKey(monthKey));
  if (labels.length <= maxItems) return labels.join(', ');

  return `${labels.slice(0, maxItems).join(', ')} +${labels.length - maxItems} more`;
}

function getStatementDateRange(statementMeta = {}) {
  const start = parsePotentialDate(statementMeta?.statementStartDate || statementMeta?.statementEndDate);
  const end = parsePotentialDate(statementMeta?.statementEndDate || statementMeta?.statementStartDate);

  if (!start && !end) {
    return { start: null, end: null };
  }

  if (start && end && start.getTime() > end.getTime()) {
    return { start: end, end: start };
  }

  return {
    start: start || end,
    end: end || start,
  };
}

function enumerateCoverageMonthKeys(startDate, endDate) {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return [];
  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) return [];

  const firstMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  if (firstMonth.getTime() > lastMonth.getTime()) return [];

  const monthKeys = [];
  const cursor = new Date(firstMonth);

  while (cursor.getTime() <= lastMonth.getTime()) {
    monthKeys.push(buildCoverageMonthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return monthKeys;
}

function buildStatementCoverageAudit(statementMetas = []) {
  const normalizedStatementMetas = buildReportStatementMetas(statementMetas);
  const accountCoverageMap = new Map();
  const coveredPackageMonths = new Set();
  let statementsMissingPeriodData = 0;
  let overallStart = null;
  let overallEnd = null;

  for (const meta of normalizedStatementMetas) {
    const accountKey = meta.sourceAccountKey
      || normalizeFingerprintSource(meta.sourceAccountLabel || meta.sourceFile || 'Uploaded Statement');
    if (!accountCoverageMap.has(accountKey)) {
      accountCoverageMap.set(accountKey, {
        key: accountKey,
        label: meta.sourceAccountLabel || meta.accountName || meta.sourceFile || 'Uploaded Statement',
        accountType: meta.sourceAccountType || meta.accountType || '',
        statements: [],
        coveredMonths: new Set(),
        earliest: null,
        latest: null,
        missingPeriodData: 0,
      });
    }

    const accountCoverage = accountCoverageMap.get(accountKey);
    accountCoverage.statements.push(meta);

    const { start, end } = getStatementDateRange(meta);
    if (!start && !end) {
      statementsMissingPeriodData += 1;
      accountCoverage.missingPeriodData += 1;
      continue;
    }

    if (!overallStart || start < overallStart) overallStart = start;
    if (!overallEnd || end > overallEnd) overallEnd = end;
    if (!accountCoverage.earliest || start < accountCoverage.earliest) accountCoverage.earliest = start;
    if (!accountCoverage.latest || end > accountCoverage.latest) accountCoverage.latest = end;

    const coveredMonths = enumerateCoverageMonthKeys(start, end);
    for (const monthKey of coveredMonths) {
      coveredPackageMonths.add(monthKey);
      accountCoverage.coveredMonths.add(monthKey);
    }
  }

  const overallExpectedMonths = overallStart && overallEnd
    ? enumerateCoverageMonthKeys(overallStart, overallEnd)
    : [];
  const overallMissingMonths = overallExpectedMonths.filter((monthKey) => !coveredPackageMonths.has(monthKey));
  const overallCoverageLabel = overallStart && overallEnd
    ? `${formatStatementCoverageDate(overallStart)} - ${formatStatementCoverageDate(overallEnd)}`
    : '';
  const alerts = [];
  let accountsWithCoverageAlerts = 0;

  if (overallMissingMonths.length > 0) {
    alerts.push({
      title: 'Uploaded package has missing calendar months',
      severity: 'warning',
      badge: 'Package gap',
      summary: `The uploaded files cover ${coveredPackageMonths.size.toLocaleString()} of ${overallExpectedMonths.length.toLocaleString()} calendar month(s) between ${overallCoverageLabel}.`,
      detail: `Missing overall month(s): ${summarizeCoverageMonths(overallMissingMonths)}. Annual totals built from this package may be incomplete before any classification happens.`,
      chips: [
        `${normalizedStatementMetas.length.toLocaleString()} statement file(s)`,
        `${coveredPackageMonths.size.toLocaleString()}/${overallExpectedMonths.length.toLocaleString()} months covered`,
      ],
    });
  }

  const accountAlerts = Array.from(accountCoverageMap.values())
    .map((accountCoverage) => {
      const coveredMonths = Array.from(accountCoverage.coveredMonths).sort();
      const expectedMonths = accountCoverage.earliest && accountCoverage.latest
        ? enumerateCoverageMonthKeys(accountCoverage.earliest, accountCoverage.latest)
        : [];
      const missingMonthsInsideAccount = expectedMonths.filter((monthKey) => !accountCoverage.coveredMonths.has(monthKey));
      const missingMonthsRelativeToPackage = overallExpectedMonths.filter((monthKey) => !accountCoverage.coveredMonths.has(monthKey));
      const coverageLabel = buildStatementCoverageLabel(accountCoverage.statements);
      const coverageRatioLabel = overallExpectedMonths.length > 0
        ? `${coveredMonths.length.toLocaleString()}/${overallExpectedMonths.length.toLocaleString()} package months covered`
        : `${coveredMonths.length.toLocaleString()} month(s) covered`;

      if (missingMonthsInsideAccount.length > 0) {
        return {
          title: `${accountCoverage.label} may have missing statement months`,
          severity: 'warning',
          badge: 'Gap detected',
          summary: `This source account covers ${coveredMonths.length.toLocaleString()} of ${expectedMonths.length.toLocaleString()} calendar month(s) between ${coverageLabel || formatStatementCoverageDate(accountCoverage.earliest)}.`,
          detail: `Possible missing month(s): ${summarizeCoverageMonths(missingMonthsInsideAccount)}. If those statements exist, the final P&L may be incomplete rather than misclassified.`,
          chips: [
            `${accountCoverage.statements.length.toLocaleString()} statement(s)`,
            coverageRatioLabel,
            accountCoverage.accountType || 'Source account',
          ],
        };
      }

      if (
        overallExpectedMonths.length >= 6
        && missingMonthsRelativeToPackage.length >= 2
        && coveredMonths.length > 0
        && coveredMonths.length < overallExpectedMonths.length
      ) {
        return {
          title: `${accountCoverage.label} only covers part of the uploaded package`,
          severity: 'notice',
          badge: 'Possible partial year',
          summary: `This source account has ${coveredMonths.length.toLocaleString()} covered calendar month(s) inside an overall package span of ${overallExpectedMonths.length.toLocaleString()} month(s).`,
          detail: `Account coverage: ${coverageLabel || summarizeCoverageMonths(coveredMonths)}. Overall uploaded package: ${overallCoverageLabel}. Missing relative month(s): ${summarizeCoverageMonths(missingMonthsRelativeToPackage)}. If this account existed outside that range, the P&L may be partial because of missing files rather than categorization alone.`,
          chips: [
            `${accountCoverage.statements.length.toLocaleString()} statement(s)`,
            coverageRatioLabel,
            accountCoverage.accountType || 'Source account',
          ],
        };
      }

      if (accountCoverage.missingPeriodData > 0) {
        return {
          title: `${accountCoverage.label} has statement files with unknown dates`,
          severity: 'warning',
          badge: 'Low visibility',
          summary: `${accountCoverage.missingPeriodData.toLocaleString()} uploaded file(s) for this source account did not expose a statement period clearly enough to place on the coverage calendar.`,
          detail: 'Coverage and completeness checks are less reliable for those files, so treat this account’s annual totals with extra caution.',
          chips: [
            `${accountCoverage.statements.length.toLocaleString()} statement(s)`,
            `${accountCoverage.missingPeriodData.toLocaleString()} missing period`,
            accountCoverage.accountType || 'Source account',
          ],
        };
      }

      return null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      const severityRank = {
        warning: 0,
        notice: 1,
        info: 2,
      };
      return (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99) || a.title.localeCompare(b.title);
    });

  accountsWithCoverageAlerts = accountAlerts.length;

  if (statementsMissingPeriodData > 0) {
    alerts.push({
      title: 'Some statements had no extractable period metadata',
      severity: 'warning',
      badge: 'Low visibility',
      summary: `${statementsMissingPeriodData.toLocaleString()} uploaded statement file(s) could not be anchored to a clear statement period from the extracted metadata.`,
      detail: 'Coverage checks still use the dates we do have, but missing period metadata makes it harder to tell whether the uploaded package is complete.',
      chips: [
        `${normalizedStatementMetas.length.toLocaleString()} statement file(s)`,
        `${statementsMissingPeriodData.toLocaleString()} missing period`,
      ],
    });
  }

  alerts.push(...accountAlerts);

  return {
    overallCoverageLabel,
    coveredMonthCount: coveredPackageMonths.size,
    expectedMonthCount: overallExpectedMonths.length,
    missingMonthCount: overallMissingMonths.length,
    statementsMissingPeriodData,
    accountsWithCoverageAlerts,
    summary: alerts.length > 0
      ? `Coverage analysis flagged ${alerts.length.toLocaleString()} potential completeness issue(s). Some drift may come from missing statement months, not only from categorization.`
      : normalizedStatementMetas.length > 0
        ? 'Coverage analysis did not find obvious statement-period gaps in the uploaded package.'
        : 'No statement-level coverage analysis was available for this run.',
    alerts: alerts.slice(0, 8),
  };
}

function buildDistributionQuickReports(ledgerEntries) {
  const sectionRank = new Map(PNL_SECTION_ORDER.map((sectionName, index) => [sectionName, index]));
  const reportMap = new Map();

  for (const entry of ledgerEntries) {
    if (entry.excluded) continue;

    const reportKey = `${entry.section}::${entry.distributionAccount}`;
    if (!reportMap.has(reportKey)) {
      reportMap.set(reportKey, {
        key: reportKey,
        kind: 'distribution',
        title: entry.distributionAccount,
        subtitle: entry.section,
        section: entry.section,
        transactionCount: 0,
        total: 0,
        rows: [],
      });
    }

    const report = reportMap.get(reportKey);
    report.transactionCount += 1;
    report.total += entry.distributionSignedAmount;
    report.rows.push(entry);
  }

  return Array.from(reportMap.values())
    .map((report, index) => {
      let runningBalance = 0;
      const sourceFiles = Array.from(new Set(report.rows.map((entry) => entry.sourceFile).filter(Boolean))).sort();
      const rows = report.rows
        .slice()
        .sort(compareProfessionalLedgerEntries)
        .map((entry) => {
          runningBalance = roundCurrency(runningBalance + entry.distributionSignedAmount);
          return {
            date: entry.date,
            transactionType: entry.transactionType,
            name: entry.name,
            memo: entry.memo,
            distributionAccount: entry.distributionAccount,
            sourceAccount: entry.sourceAccount,
            amount: entry.distributionSignedAmount,
            runningBalance,
            sourceFile: entry.sourceFile,
          };
        });

      return {
        id: `distribution_${index + 1}`,
        kind: 'distribution',
        title: report.title,
        subtitle: report.subtitle,
        transactionCount: report.transactionCount,
        total: roundCurrency(report.total),
        balanceLabel: 'Running Balance',
        sourceFiles,
        sourceFileCount: sourceFiles.length,
        note: [
          sourceFiles.length > 1
            ? `Includes activity from ${sourceFiles.length.toLocaleString()} uploaded source files.`
            : sourceFiles[0]
              ? `Built from ${sourceFiles[0]}.`
              : '',
          'Running balance reflects cumulative activity inside this distribution account.',
        ].filter(Boolean).join(' '),
        rows,
      };
    })
    .sort((a, b) => {
      const sectionOrder = (sectionRank.get(a.subtitle) ?? 999) - (sectionRank.get(b.subtitle) ?? 999);
      if (sectionOrder !== 0) return sectionOrder;
      return Math.abs(b.total) - Math.abs(a.total) || a.title.localeCompare(b.title);
    });
}

function buildSourceOpeningBalanceRow(title, statementSources = [], openingBalance = null) {
  if (openingBalance == null) return null;

  const firstStatement = statementSources[0] || {};
  return {
    date: firstStatement.statementStartDate || firstStatement.statementEndDate || '',
    transactionType: 'Opening Balance',
    name: title,
    memo: 'Opening statement balance',
    distributionAccount: '',
    sourceAccount: title,
    amount: roundCurrency(openingBalance),
    runningBalance: roundCurrency(openingBalance),
    sourceFile: firstStatement.sourceFile || '',
  };
}

function buildSourceQuickReports(ledgerEntries) {
  const reportMap = new Map();

  for (const entry of ledgerEntries) {
    const reportKey = entry.sourceAccountKey || normalizeFingerprintSource(entry.sourceAccount || 'Uploaded Statement');
    if (!reportMap.has(reportKey)) {
      reportMap.set(reportKey, {
        key: reportKey,
        kind: 'source',
        title: entry.sourceAccount || 'Uploaded Statement',
        transactionCount: 0,
        total: 0,
        rows: [],
        sourceFiles: new Set(),
        sourceAccountInference: entry.sourceAccountInference || '',
        statementMetaMap: new Map(),
        sourceAccountType: entry.sourceAccountType || '',
      });
    }

    const report = reportMap.get(reportKey);
    report.transactionCount += 1;
    report.total += entry.sourceSignedAmount;
    report.rows.push(entry);
    if (entry.sourceFile) report.sourceFiles.add(entry.sourceFile);
    const statementSourceFile = entry.sourceStatementMeta?.sourceFile || entry.sourceFile;
    if (statementSourceFile) {
      report.statementMetaMap.set(statementSourceFile, {
        ...entry.sourceStatementMeta,
        sourceFile: statementSourceFile,
      });
    }
  }

  return Array.from(reportMap.values())
    .map((report, index) => {
      const sourceFiles = Array.from(report.sourceFiles).sort();
      const statementSources = Array.from(report.statementMetaMap.values()).sort(compareStatementSources);
      const statementCoverage = buildStatementCoverageLabel(statementSources);
      const reportedOpeningBalance = statementSources.find((item) => item.openingBalance != null)?.openingBalance ?? null;
      const reversedStatementSources = statementSources.slice().reverse();
      const reportedClosingBalance = reversedStatementSources.find((item) => item.closingBalance != null)?.closingBalance ?? null;
      let runningBalance = reportedOpeningBalance ?? 0;
      const openingBalanceRow = buildSourceOpeningBalanceRow(report.title, statementSources, reportedOpeningBalance);
      const movementRows = report.rows
        .slice()
        .sort(compareProfessionalLedgerEntries)
        .map((entry) => {
          runningBalance = roundCurrency(runningBalance + entry.sourceSignedAmount);
          return {
            date: entry.date,
            transactionType: entry.sourceTransactionType || entry.transactionType,
            name: entry.name,
            memo: entry.memo,
            distributionAccount: entry.distributionAccount,
            sourceAccount: entry.sourceAccount,
            amount: entry.sourceSignedAmount,
            runningBalance,
            sourceFile: entry.sourceFile,
          };
        });
      const rows = openingBalanceRow ? [openingBalanceRow, ...movementRows] : movementRows;
      const endingBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance || 0 : 0;
      const balanceVariance = reportedClosingBalance != null
        ? roundCurrency(endingBalance - reportedClosingBalance)
        : null;

      return {
        id: `source_${index + 1}`,
        kind: 'source',
        title: report.title,
        subtitle: 'Source account activity',
        transactionCount: report.transactionCount,
        total: roundCurrency(report.total),
        balanceLabel: reportedOpeningBalance != null ? 'Ending Balance' : 'Running Balance',
        sourceFiles,
        sourceFileCount: sourceFiles.length,
        statementSources,
        statementCoverage,
        reportedOpeningBalance,
        reportedClosingBalance,
        sourceAccountType: report.sourceAccountType,
        note: [
          report.sourceAccountInference,
          statementCoverage ? `Statement coverage: ${statementCoverage}.` : '',
          reportedOpeningBalance != null ? `Reported opening balance: ${formatSignedCurrency(reportedOpeningBalance)}.` : '',
          reportedClosingBalance != null ? `Reported closing balance: ${formatSignedCurrency(reportedClosingBalance)}.` : '',
          reportedOpeningBalance != null
            ? 'Running balance is anchored to the extracted opening balance from the earliest statement in this account set.'
            : 'No opening balance was extracted, so the balance column starts from zero and shows cumulative movement only.',
          balanceVariance != null
            ? `Ending balance variance versus the extracted closing balance: ${formatSignedCurrency(balanceVariance)}.`
            : '',
          sourceFiles.length > 1
            ? `Merged ${sourceFiles.length.toLocaleString()} uploaded file(s) inferred as the same source account.`
            : sourceFiles[0]
              ? `Built from ${sourceFiles[0]}.`
              : '',
        ].filter(Boolean).join(' '),
        rows,
      };
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total) || a.title.localeCompare(b.title));
}

function buildProfessionalQuickReports(distributionLedgerEntries, sourceLedgerEntries) {
  return {
    distributionReports: buildDistributionQuickReports(distributionLedgerEntries),
    sourceReports: buildSourceQuickReports(sourceLedgerEntries),
  };
}

function buildReportStatementMetas(statementMetas = []) {
  const uniqueStatements = new Map();

  for (const meta of statementMetas) {
    if (!meta || typeof meta !== 'object') continue;
    const sourceFile = normalizeWhitespace(meta.sourceFile);
    const uniqueKey = sourceFile || JSON.stringify(meta);
    if (uniqueStatements.has(uniqueKey)) continue;

    const sourceMeta = inferSourceAccountMeta(sourceFile, meta);
    uniqueStatements.set(uniqueKey, {
      ...meta,
      sourceFile,
      sourceAccountLabel: sourceMeta.label,
      sourceAccountKey: sourceMeta.key,
      sourceAccountType: sourceMeta.accountType,
    });
  }

  return Array.from(uniqueStatements.values()).sort(compareStatementSources);
}

function buildProfessionalAudit(
  classifiedTransactions,
  excludedTransactions,
  totals,
  reviewSummary = null,
  statementMetas = [],
  verifierSummary = null,
  persistedRuleSummary = null,
  reviewMode = PROFESSIONAL_REVIEW_STANDARD,
) {
  const counts = {
    modelSectionCount: 0,
    fallbackSectionCount: 0,
    modelGroupCount: 0,
    modelAccountCount: 0,
    heuristicRefinementCount: 0,
    forcedRuleCount: 0,
    savedRuleAppliedCount: 0,
    transferSignalCount: 0,
    verifierConsideredCount: 0,
    verifierAutoAppliedCount: 0,
  };
  const normalizedStatementMetas = buildReportStatementMetas(statementMetas);
  const coverageAudit = buildStatementCoverageAudit(normalizedStatementMetas);
  const statementsWithBalances = normalizedStatementMetas.filter((meta) => meta.openingBalance != null || meta.closingBalance != null).length;
  const sourceAccountsDetected = new Set(
    normalizedStatementMetas
      .map((meta) => meta.sourceAccountKey)
      .filter(Boolean),
  ).size;

  for (const tx of classifiedTransactions) {
    const meta = tx.classificationMeta || {};
    if (meta.modelSectionProvided) counts.modelSectionCount += 1;
    else counts.fallbackSectionCount += 1;
    if (meta.modelGroupProvided) counts.modelGroupCount += 1;
    if (meta.modelAccountProvided) counts.modelAccountCount += 1;
    if (meta.usedHeuristicRefinement) counts.heuristicRefinementCount += 1;
    if (meta.forcedRuleApplied) counts.forcedRuleCount += 1;
    if (meta.savedRuleApplied) counts.savedRuleAppliedCount += 1;
    if (meta.transferSignalDetected) counts.transferSignalCount += 1;
    if (meta.verifierConsidered) counts.verifierConsideredCount += 1;
    if (meta.verifierAutoApplied) counts.verifierAutoAppliedCount += 1;
  }

  return {
    overviewStats: [
      { label: 'Transactions extracted', value: classifiedTransactions.length, format: 'count' },
      { label: 'Statement files processed', value: normalizedStatementMetas.length, format: 'count' },
      { label: 'Source accounts identified', value: sourceAccountsDetected, format: 'count' },
      { label: 'Calendar months covered', value: coverageAudit.coveredMonthCount, format: 'count' },
      { label: 'Coverage alerts', value: coverageAudit.alerts.length, format: 'count' },
      { label: 'Statements with balances', value: statementsWithBalances, format: 'count' },
      { label: 'Statements missing period data', value: coverageAudit.statementsMissingPeriodData, format: 'count' },
      { label: 'Included in final P&L', value: classifiedTransactions.length - excludedTransactions.length, format: 'count' },
      { label: 'Excluded from final P&L', value: excludedTransactions.length, format: 'count' },
      { label: 'Transfer signals detected', value: counts.transferSignalCount, format: 'count' },
      { label: 'Model section guesses used', value: counts.modelSectionCount, format: 'count' },
      { label: 'Fallback section mappings used', value: counts.fallbackSectionCount, format: 'count' },
      { label: 'Rule overrides applied', value: counts.forcedRuleCount, format: 'count' },
      { label: 'Saved review rules available', value: persistedRuleSummary?.availableRuleCount || 0, format: 'count' },
      { label: 'Saved review rules applied', value: counts.savedRuleAppliedCount, format: 'count' },
      { label: 'Rule-based account refinements', value: counts.heuristicRefinementCount, format: 'count' },
      { label: 'OpenAI clusters reviewed', value: verifierSummary?.evaluatedClusterCount || 0, format: 'count' },
      { label: 'OpenAI auto-mappings applied', value: verifierSummary?.autoAppliedClusterCount || 0, format: 'count' },
      { label: 'User review decisions applied', value: reviewSummary?.resolvedQuestions || 0, format: 'count' },
    ],
    logicSteps: [
      `Parsed ${classifiedTransactions.length.toLocaleString()} transaction(s) from the uploaded bank statements and normalized dates, amounts, descriptions, and Schedule C categories.`,
      normalizedStatementMetas.length > 0
        ? `Extracted statement-level metadata for ${normalizedStatementMetas.length.toLocaleString()} uploaded file(s), identifying ${sourceAccountsDetected.toLocaleString()} source account(s) and reported balances on ${statementsWithBalances.toLocaleString()} statement(s).`
        : 'No statement-level metadata was available, so source account grouping fell back to filename-based inference.',
      coverageAudit.summary,
      `${counts.modelSectionCount.toLocaleString()} transaction(s) used Gemini's P&L section guess, while ${counts.fallbackSectionCount.toLocaleString()} used local fallback mapping from transaction type and extracted tax category.`,
      counts.forcedRuleCount > 0
        ? `${counts.forcedRuleCount.toLocaleString()} transaction(s) were overridden by deterministic local rules for known vendor families, source-account semantics, and canonical chart-of-accounts cleanup.`
        : 'No deterministic local override rules were needed beyond the extracted model output and fallback mapping.',
      counts.savedRuleAppliedCount > 0
        ? `${counts.savedRuleAppliedCount.toLocaleString()} transaction(s) matched previously approved user review rules before the OpenAI verifier and manual review step.`
        : 'No previously saved user review rules were applied in this professional run.',
      counts.heuristicRefinementCount > 0
        ? `${counts.heuristicRefinementCount.toLocaleString()} transaction(s) had group/account names refined by local rules for recurring patterns like ad spend, travel, utilities, and bank charges.`
        : 'No local group/account refinement rules were needed after the AI extraction step.',
      verifierSummary?.evaluatedClusterCount
        ? isStrictProfessionalReviewMode(reviewMode)
          ? `OpenAI reviewed ${verifierSummary.evaluatedClusterCount.toLocaleString()} high-impact or material vendor/memo cluster(s) and held ${verifierSummary.reviewSuggestedClusterCount.toLocaleString()} cluster(s) for human confirmation under strict review.`
          : `OpenAI reviewed ${verifierSummary.evaluatedClusterCount.toLocaleString()} high-impact vendor or memo cluster(s), auto-applied ${verifierSummary.autoAppliedClusterCount.toLocaleString()} confident mapping(s), and left ${verifierSummary.reviewSuggestedClusterCount.toLocaleString()} cluster(s) for human confirmation.`
        : 'No OpenAI second-pass cluster verification was applied in this professional run.',
      `${counts.transferSignalCount.toLocaleString()} transaction(s) matched transfer or balance-sheet heuristics, and ${excludedTransactions.length.toLocaleString()} total transaction(s) ended up excluded from the final P&L after review and rule application.`,
      reviewSummary?.resolvedQuestions
        ? `Applied ${reviewSummary.resolvedQuestions.toLocaleString()} manual review decision(s) before the final rollup into statement totals.`
        : 'No manual review overrides were applied before the final statement rollup.',
      reviewSummary?.savedRuleSummary?.savedRuleCount
        ? `Saved ${reviewSummary.savedRuleSummary.savedRuleCount.toLocaleString()} answered review cluster(s) as reusable rules for future professional runs.`
        : 'No new reusable review rules were saved during this run.',
      isStrictProfessionalReviewMode(reviewMode)
        ? 'Strict review mode was enabled, so the professional P&L paused for any material or unclear cluster instead of auto-applying verifier remaps.'
        : 'Standard review mode was enabled, so previously approved rules and high-confidence verifier remaps could auto-apply before final review.',
      verifierSummary?.warning
        ? verifierSummary.warning
        : 'The professional statement combines Gemini extraction, deterministic local rules, and the current review workflow.',
      'Final formulas: Gross Profit = Income - Cost of Goods Sold. Net Operating Income = Gross Profit - Expenses. Net Income = Net Operating Income + (Other Income - Other Expenses).',
    ],
    formulaBreakdown: [
      { label: 'Total Income', formula: 'Sum of all Income rows', value: totals.totalIncome, format: 'currency' },
      { label: 'Gross Profit', formula: 'Total Income - Cost of Goods Sold', value: totals.grossProfit, format: 'currency' },
      { label: 'Net Operating Income', formula: 'Gross Profit - Expenses', value: totals.netOperatingIncome, format: 'currency' },
      { label: 'Net Other Income', formula: 'Other Income - Other Expenses', value: totals.netOtherIncome, format: 'currency' },
      { label: 'Net Income', formula: 'Net Operating Income + Net Other Income', value: totals.netIncome, format: 'currency' },
    ],
    transferClusters: buildTransferAuditClusters(classifiedTransactions),
    coverageAlerts: coverageAudit.alerts,
    reviewDecisions: Array.isArray(reviewSummary?.answers)
      ? reviewSummary.answers.map((answer) => ({
        questionTitle: answer.questionTitle,
        answerLabel: answer.answerLabel,
      }))
      : [],
  };
}

function summarizeProfessionalTransactions(
  classifiedTransactions,
  reviewSummary = null,
  statementMetas = [],
  verifierSummary = null,
  persistedRuleSummary = null,
  reviewMode = PROFESSIONAL_REVIEW_STANDARD,
  companyProfile = null,
) {
  const sectionMap = new Map();
  const excludedTransactions = [];
  const ledgerEntries = buildProfessionalLedgerEntries(classifiedTransactions);
  const sourceLedgerEntries = buildSourceLedgerEntries(classifiedTransactions);
  const normalizedStatementMetas = buildReportStatementMetas(statementMetas);

  for (const tx of classifiedTransactions) {
    if (tx.plSection === 'Ignore') {
      excludedTransactions.push(tx);
      continue;
    }

    const section = getOrCreateSection(sectionMap, tx.plSection);
    const group = getOrCreateGroup(section, tx.plGroup || 'Uncategorized');
    const account = getOrCreateAccount(group, tx.plAccount || tx.plGroup || 'Uncategorized');

    section.total += tx.amount;
    group.total += tx.amount;
    group.count += 1;
    account.total += tx.amount;
    account.count += 1;
  }

  const sections = PNL_SECTION_ORDER
    .map((sectionName) => sectionMap.get(sectionName))
    .filter(Boolean)
    .map(materializeSection);

  const getSectionTotal = (sectionName) => sections.find((section) => section.name === sectionName)?.total || 0;

  const totalIncome = roundCurrency(getSectionTotal('Income'));
  const totalCostOfGoodsSold = roundCurrency(getSectionTotal('Cost of Goods Sold'));
  const grossProfit = roundCurrency(totalIncome - totalCostOfGoodsSold);
  const totalExpenses = roundCurrency(getSectionTotal('Expenses'));
  const netOperatingIncome = roundCurrency(grossProfit - totalExpenses);
  const totalOtherIncome = roundCurrency(getSectionTotal('Other Income'));
  const totalOtherExpenses = roundCurrency(getSectionTotal('Other Expenses'));
  const netOtherIncome = roundCurrency(totalOtherIncome - totalOtherExpenses);
  const netIncome = roundCurrency(netOperatingIncome + netOtherIncome);

  const totals = {
    totalIncome,
    totalCostOfGoodsSold,
    grossProfit,
    totalExpenses,
    netOperatingIncome,
    totalOtherIncome,
    totalOtherExpenses,
    netOtherIncome,
    netIncome,
  };
  const audit = buildProfessionalAudit(
    classifiedTransactions,
    excludedTransactions,
    totals,
    reviewSummary,
    normalizedStatementMetas,
    verifierSummary,
    persistedRuleSummary,
    reviewMode,
  );
  const quickReports = buildProfessionalQuickReports(ledgerEntries, sourceLedgerEntries);

  return {
    mode: PROFESSIONAL_MODE,
    periodLabel: buildPeriodLabel(classifiedTransactions),
    transactionCount: classifiedTransactions.length,
    includedTransactionCount: classifiedTransactions.length - excludedTransactions.length,
    excludedCount: excludedTransactions.length,
    excludedTransactions: excludedTransactions.slice(0, 12).map((tx) => ({
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
    })),
    sections,
    statementRows: buildProfitAndLossRows(sections, totals),
    ledgerEntries,
    quickReports,
    statementMetas: normalizedStatementMetas,
    companyId: companyProfile?.id || null,
    companyName: companyProfile?.name || '',
    reviewSummary,
    verifierSummary,
    persistedRuleSummary,
    reviewMode: normalizeProfessionalReviewMode(reviewMode),
    audit,
    ...totals,
  };
}

function buildProfessionalProfitAndLossReport(
  transactions,
  reviewSummary = null,
  statementMetas = [],
  reviewMode = PROFESSIONAL_REVIEW_STANDARD,
  companyProfile = null,
) {
  const classifiedTransactions = transactions.map(normalizeProfitAndLossTransaction);
  const persistedRuleSummary = applyPersistedReviewRules(classifiedTransactions, companyProfile);
  return summarizeProfessionalTransactions(
    classifiedTransactions,
    reviewSummary,
    statementMetas,
    null,
    persistedRuleSummary,
    reviewMode,
    companyProfile,
  );
}

function buildAnalysisReport(
  rawTransactions,
  analysisMode,
  statementMetas = [],
  reviewMode = PROFESSIONAL_REVIEW_STANDARD,
  companyProfile = null,
) {
  const transactions = sanitizeTransactions(rawTransactions);
  if (analysisMode === PROFESSIONAL_MODE) {
    return buildProfessionalProfitAndLossReport(transactions, null, statementMetas, reviewMode, companyProfile);
  }

  return {
    ...buildSimpleDepositDeductionReport(transactions),
    companyId: companyProfile?.id || null,
    companyName: companyProfile?.name || '',
  };
}

function serializeJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    totalFiles: job.totalFiles,
    currentFile: job.currentFile,
    filesProcessed: job.filesProcessed,
    data: job.data,
    error: job.error,
    analysisMode: job.analysisMode,
    reviewMode: job.reviewMode || null,
    companyId: job.companyId || null,
    companyName: job.companyName || '',
    startedAt: job.startedAt,
    updatedAt: job.updatedAt,
    review: job.review || null,
    statementMetas: job.statementMetas || [],
  };
}

const jobs = {};

function getCompanyProfileFromRequest(req, { allowDefault = true } = {}) {
  const rawCompanyId = normalizeCompanyId(req.query?.companyId || req.body?.companyId);
  if (rawCompanyId) {
    const matched = getCompanyProfiles().find((company) => company.id === rawCompanyId);
    if (!matched) {
      throw new Error('Company profile not found');
    }
    return matched;
  }

  if (!allowDefault) {
    throw new Error('companyId is required');
  }

  return getCompanyProfileOrThrow();
}

app.get('/api/companies', (req, res) => {
  res.json(getCompaniesPayload(req.query?.companyId || ''));
});

app.post('/api/companies', (req, res) => {
  try {
    const companyProfile = createCompanyProfile(req.body || {});
    res.json({
      success: true,
      company: serializeCompanyProfileSummary(companyProfile),
      ...getCompaniesPayload(companyProfile.id),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/professional-settings', (req, res) => {
  try {
    const companyProfile = getCompanyProfileFromRequest(req);
    res.json(getProfessionalSettingsPayload(companyProfile));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/professional-settings/chart-accounts', (req, res) => {
  try {
    const companyProfile = getCompanyProfileFromRequest(req);
    const entry = upsertChartAccount(req.body || {}, companyProfile.id);
    res.json({
      success: true,
      entry,
      settings: getProfessionalSettingsPayload(getCompanyProfileOrThrow(companyProfile.id)),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/professional-settings/chart-accounts/:id/toggle', (req, res) => {
  try {
    const companyProfile = getCompanyProfileFromRequest(req);
    const enabled = typeof req.body?.enabled === 'boolean'
      ? req.body.enabled
      : req.body?.enabled === 'true';
    const entry = toggleChartAccountEnabled(req.params.id, enabled, companyProfile.id);
    res.json({
      success: true,
      entry,
      settings: getProfessionalSettingsPayload(getCompanyProfileOrThrow(companyProfile.id)),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/professional-settings/chart-accounts/:id', (req, res) => {
  try {
    const companyProfile = getCompanyProfileFromRequest(req);
    const entry = deleteChartAccount(req.params.id, companyProfile.id);
    res.json({
      success: true,
      entry,
      settings: getProfessionalSettingsPayload(getCompanyProfileOrThrow(companyProfile.id)),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/professional-settings/review-rules/:id', (req, res) => {
  try {
    const companyProfile = getCompanyProfileFromRequest(req);
    const rule = updateReviewRuleManagerState(req.params.id, req.body || {}, companyProfile.id);
    res.json({
      success: true,
      rule,
      settings: getProfessionalSettingsPayload(getCompanyProfileOrThrow(companyProfile.id)),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/professional-settings/review-rules/:id', (req, res) => {
  try {
    const companyProfile = getCompanyProfileFromRequest(req);
    const rule = deleteReviewRule(req.params.id, companyProfile.id);
    res.json({
      success: true,
      rule,
      settings: getProfessionalSettingsPayload(getCompanyProfileOrThrow(companyProfile.id)),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/upload', upload.array('statements', 20), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No PDF files uploaded' });
    }

    const analysisMode = normalizeAnalysisMode(req.body.analysisMode);
    const reviewMode = analysisMode === PROFESSIONAL_MODE
      ? normalizeProfessionalReviewMode(req.body.professionalReviewMode)
      : null;
    const companyProfile = getCompanyProfileFromRequest(req);
    const jobId = Date.now().toString();

    jobs[jobId] = {
      id: jobId,
      status: 'processing',
      progress: 0,
      totalFiles: req.files.length,
      currentFile: 0,
      filesProcessed: [],
      data: null,
      error: null,
      analysisMode,
      reviewMode,
      companyId: companyProfile.id,
      companyName: companyProfile.name,
      successCount: 0,
      errorCount: 0,
      review: null,
      reviewState: null,
      statementMetas: [],
      startedAt: new Date().toISOString(),
    };

    processJob(jobId, req.files, analysisMode, reviewMode, companyProfile.id);

    res.json({ success: true, jobId, analysisMode, reviewMode, companyId: companyProfile.id, companyName: companyProfile.name });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/status/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(serializeJob(job));
});

app.post('/api/review/:id', (req, res) => {
  const job = jobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.analysisMode !== PROFESSIONAL_MODE) {
    return res.status(400).json({ error: 'Review questions are only available for Professional P&L jobs' });
  }
  if (job.status !== 'awaiting_review' || !job.reviewState) {
    return res.status(400).json({ error: 'This job is not waiting for review answers' });
  }

  try {
    const answers = req.body?.answers;
    const appliedAnswers = applyReviewAnswers(job.reviewState, answers);
    const savedRuleSummary = persistAppliedReviewRules(job.reviewState, answers);
    const companyProfile = getCompanyProfileOrThrow(job.companyId);
    const report = summarizeProfessionalTransactions(job.reviewState.transactions, {
      resolvedQuestions: appliedAnswers.length,
      answers: appliedAnswers,
      savedRuleSummary,
    }, job.reviewState.statementMetas, job.reviewState.verifierSummary, job.reviewState.persistedRuleSummary, job.reviewMode, companyProfile);

    job.data = report;
    job.review = null;
    job.reviewState = null;
    job.progress = 100;
    job.updatedAt = new Date().toISOString();

    if (job.errorCount > 0) {
      job.status = 'completed_with_errors';
      job.error = `${job.errorCount} of ${job.totalFiles} file(s) failed during AI extraction. The report only includes successfully processed statements.`;
      job.data.warning = job.error;
    } else {
      job.status = 'completed';
      job.error = null;
      job.data.warning = null;
    }

    console.log(`[Job ${job.id}] Review completed. Final status ${job.status}.`);
    res.json(serializeJob(job));
  } catch (err) {
    console.error(`[Job ${job.id}] Review submission failed:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

async function processJob(jobId, files, analysisMode, reviewMode = null, companyId = '') {
  const job = jobs[jobId];
  const companyProfile = getCompanyProfileOrThrow(companyId || job.companyId);
  const allTransactions = [];
  const statementMetas = [];
  let successCount = 0;
  let errorCount = 0;

  const reviewModeLabel = analysisMode === PROFESSIONAL_MODE && reviewMode
    ? ` (${normalizeProfessionalReviewMode(reviewMode)} review)`
    : '';
  console.log(`\n[Job ${jobId}] Received ${files.length} PDF file(s) for ${analysisMode} processing${reviewModeLabel} for company "${companyProfile.name}"...`);

  try {
    let filesCompleted = 0;
    let report = null;

    for (const [index, file] of files.entries()) {
      job.currentFile = index + 1;
      console.log(`  [Job ${jobId}] Started processing [${index + 1}/${files.length}]: ${file.originalname}`);

      try {
        const extractedData = await extractStatementDataFromPDF(file.buffer, analysisMode, file.originalname);
        const statementMeta = sanitizeStatementMetadata(
          extractedData.statementMeta,
          file.originalname,
          extractedData.transactions,
        );
        const sourceAccountMeta = inferSourceAccountMeta(file.originalname, statementMeta);

        statementMetas.push(statementMeta);
        allTransactions.push(...extractedData.transactions.map((transaction) => ({
          ...transaction,
          sourceFile: file.originalname,
          sourceStatementMeta: statementMeta,
        })));
        job.statementMetas = buildReportStatementMetas(statementMetas);
        successCount += 1;
        job.filesProcessed.push({
          filename: file.originalname,
          status: 'success',
          transactionCount: extractedData.transactions.length,
          sourceAccount: sourceAccountMeta.label,
          statementPeriod: [statementMeta.statementStartDate, statementMeta.statementEndDate].filter(Boolean).join(' - '),
          openingBalance: statementMeta.openingBalance,
          closingBalance: statementMeta.closingBalance,
        });
        console.log(`  [Job ${jobId}] Extracted ${extractedData.transactions.length} transactions from ${file.originalname}`);
      } catch (err) {
        errorCount += 1;
        console.error(`  [Job ${jobId}] Failed to process ${file.originalname}:`, err.message);
        job.filesProcessed.push({
          filename: file.originalname,
          status: 'error',
          error: err.message,
        });
      } finally {
        filesCompleted += 1;
        job.progress = Math.round((filesCompleted / files.length) * 100);
        job.updatedAt = new Date().toISOString();
      }
    }

    job.successCount = successCount;
    job.errorCount = errorCount;
    job.statementMetas = buildReportStatementMetas(statementMetas);

    if (successCount === 0) {
      report = buildAnalysisReport(allTransactions, analysisMode, statementMetas, reviewMode, companyProfile);
      job.progress = 100;
      job.data = report;
      job.status = 'error';
      job.error = 'All uploaded statements failed during AI extraction. Check the Gemini model, API key, or request timeout and try again.';
      job.updatedAt = new Date().toISOString();
    } else if (analysisMode === PROFESSIONAL_MODE) {
      const sanitizedTransactions = sanitizeTransactions(allTransactions);
      const reviewState = await buildProfessionalReviewState(sanitizedTransactions, errorCount, statementMetas, reviewMode, companyProfile);

      if (reviewState.questions.length > 0) {
        job.progress = 100;
        job.status = 'awaiting_review';
        job.error = reviewState.publicReview.warning;
        job.review = reviewState.publicReview;
        job.reviewState = reviewState;
        job.updatedAt = new Date().toISOString();
        console.log(`[Job ${jobId}] Awaiting user review for ${reviewState.questions.length} question(s).`);
        return;
      }

      report = summarizeProfessionalTransactions(
        reviewState.transactions,
        null,
        reviewState.statementMetas,
        reviewState.verifierSummary,
        reviewState.persistedRuleSummary,
        reviewState.reviewMode,
        companyProfile,
      );
      job.progress = 100;
      job.data = report;
      job.review = null;
      job.reviewState = null;
      job.updatedAt = new Date().toISOString();

      if (errorCount > 0) {
        job.status = 'completed_with_errors';
        job.error = `${errorCount} of ${files.length} file(s) failed during AI extraction. The report only includes successfully processed statements.`;
        job.data.warning = job.error;
      } else {
        job.status = 'completed';
        job.error = null;
        job.data.warning = null;
      }
    } else {
      report = buildAnalysisReport(allTransactions, analysisMode, statementMetas, reviewMode, companyProfile);
      job.progress = 100;
      job.data = report;
      job.updatedAt = new Date().toISOString();

      if (errorCount > 0) {
        job.status = 'completed_with_errors';
        job.error = `${errorCount} of ${files.length} file(s) failed during AI extraction. The report only includes successfully processed statements.`;
        job.data.warning = job.error;
      } else {
        job.status = 'completed';
        job.error = null;
        job.data.warning = null;
      }
    }

    console.log(`[Job ${jobId}] Finished with status ${job.status}. Success: ${successCount}, errors: ${errorCount}, transactions: ${report ? report.transactionCount : 0}.`);
  } catch (err) {
    console.error(`[Job ${jobId}] Fatal error:`, err);
    job.status = 'error';
    job.error = err.message;
    job.updatedAt = new Date().toISOString();
  }
}

function drawSimpleReport(doc, data) {
  const {
    deposits = [],
    deductions = [],
    totalDeposits = 0,
    totalDeductions = 0,
    net = 0,
    transactionCount = 0,
    periodLabel = '',
  } = data;

  doc.fontSize(22).font('Helvetica-Bold').fillColor('#1a1a2e')
    .text('Bank Statement Analysis Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(10).font('Helvetica').fillColor('#666')
    .text(`Generated on ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });
  doc.text(`Total transactions analyzed: ${transactionCount}`, { align: 'center' });
  if (periodLabel) {
    doc.text(`Statement period: ${periodLabel}`, { align: 'center' });
  }
  doc.moveDown(1);

  const summaryY = doc.y;
  doc.rect(50, summaryY, 495, 70).fill('#f0f4ff');
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a2e')
    .text('Summary', 70, summaryY + 10);
  doc.fontSize(10).font('Helvetica').fillColor('#333');
  doc.text(`Total Deposits: ${formatCurrency(totalDeposits)}`, 70, summaryY + 30);
  doc.text(`Total Deductions: ${formatCurrency(totalDeductions)}`, 250, summaryY + 30);
  doc.text(`Net: ${formatCurrency(net)}`, 430, summaryY + 30);
  doc.text(`Deposit Categories: ${deposits.length}`, 70, summaryY + 48);
  doc.text(`Deduction Categories: ${deductions.length}`, 250, summaryY + 48);
  doc.y = summaryY + 85;

  function drawTable(title, items, total, color) {
    if (doc.y > 650) doc.addPage();

    doc.fontSize(14).font('Helvetica-Bold').fillColor(color)
      .text(title, 50);
    doc.moveDown(0.4);

    const tableX = 50;
    let tableY = doc.y;
    doc.rect(tableX, tableY, 495, 22).fill(color);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
    doc.text('#', tableX + 8, tableY + 6, { width: 30 });
    doc.text('Description', tableX + 40, tableY + 6, { width: 280 });
    doc.text('Count', tableX + 330, tableY + 6, { width: 50, align: 'right' });
    doc.text('Total Amount', tableX + 390, tableY + 6, { width: 100, align: 'right' });
    tableY += 22;

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
      doc.text(formatCurrency(item.total), tableX + 390, tableY + 5, { width: 100, align: 'right' });
      tableY += 20;
    });

    doc.rect(tableX, tableY, 495, 24).fill(color);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#fff');
    doc.text('TOTAL', tableX + 40, tableY + 6, { width: 280 });
    doc.text(formatCurrency(total), tableX + 390, tableY + 6, { width: 100, align: 'right' });
    doc.y = tableY + 40;
  }

  drawTable('Deposits', deposits, totalDeposits, '#2d6a4f');
  drawTable('Deductions', deductions, totalDeductions, '#c1121f');

  doc.moveDown(2);
  doc.fontSize(8).font('Helvetica').fillColor('#999')
    .text('This report was generated automatically by Tax Agent.', { align: 'center' });
}

function drawProfessionalTableHeader(doc) {
  const tableX = 50;
  const tableY = doc.y;

  doc.rect(tableX, tableY, 495, 24).fill('#1f4f96');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#fff');
  doc.text('Account', tableX + 12, tableY + 7, { width: 330 });
  doc.text('Total', tableX + 390, tableY + 7, { width: 100, align: 'right' });
  doc.y = tableY + 24;
}

function slugifyFilenameSegment(value = '') {
  const slug = normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'report';
}

function getAllQuickReportPayloads(quickReports = {}) {
  const sourceReports = Array.isArray(quickReports?.sourceReports) ? quickReports.sourceReports : [];
  const distributionReports = Array.isArray(quickReports?.distributionReports) ? quickReports.distributionReports : [];
  return [...sourceReports, ...distributionReports];
}

function findQuickReportById(quickReports = {}, reportId = '') {
  if (!reportId) return null;
  return getAllQuickReportPayloads(quickReports).find((report) => report.id === reportId) || null;
}

function getReportExportTarget(body = {}) {
  if (body?.exportTarget?.kind === 'quick-report') {
    return {
      kind: 'quick-report',
      reportId: normalizeWhitespace(body.exportTarget.reportId),
    };
  }

  return { kind: 'main', reportId: '' };
}

function buildPdfFilename(mode, exportTarget, selectedQuickReport = null) {
  if (exportTarget.kind === 'quick-report' && selectedQuickReport) {
    const prefix = selectedQuickReport.kind === 'source' ? 'source-account-report' : 'distribution-account-report';
    return `${prefix}-${slugifyFilenameSegment(selectedQuickReport.title)}.pdf`;
  }

  return mode === PROFESSIONAL_MODE ? 'professional-profit-and-loss.pdf' : 'bank-statement-report.pdf';
}

function drawQuickReportMetricCard(doc, x, y, width, label, value) {
  doc.roundedRect(x, y, width, 70, 10).fill('#f3f6ff');
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#5b6b92')
    .text(label, x + 14, y + 12, { width: width - 28 });
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#16213e')
    .text(value, x + 14, y + 32, { width: width - 28 });
}

function getQuickReportTableColumns(report) {
  return [
    { key: 'date', label: 'Date', width: 62 },
    { key: 'transactionType', label: 'Type', width: 82 },
    { key: 'name', label: 'Name', width: 122 },
    { key: 'memo', label: 'Memo / Description', width: 246 },
    { key: 'split', label: report.kind === 'source' ? 'Distribution Account' : 'Source Account', width: 132 },
    { key: 'amount', label: 'Amount', width: 59, align: 'right' },
    { key: 'runningBalance', label: 'Balance', width: 59, align: 'right' },
  ];
}

function getQuickReportRowValue(report, row, columnKey) {
  if (columnKey === 'split') {
    return report.kind === 'source'
      ? row.distributionAccount || ''
      : row.sourceAccount || '';
  }

  if (columnKey === 'amount') return formatSignedCurrency(row.amount || 0);
  if (columnKey === 'runningBalance') return formatSignedCurrency(row.runningBalance || 0);
  return row[columnKey] || '';
}

function drawQuickReportTableHeader(doc, report) {
  const tableX = doc.page.margins.left;
  const tableY = doc.y;
  const columns = getQuickReportTableColumns(report);
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  doc.rect(tableX, tableY, tableWidth, 22).fill('#1f4f96');
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#fff');

  let currentX = tableX;
  columns.forEach((column) => {
    doc.text(column.label, currentX + 8, tableY + 7, {
      width: column.width - 16,
      align: column.align || 'left',
    });
    currentX += column.width;
  });

  doc.y = tableY + 22;
  return { tableX, tableWidth, columns };
}

function drawQuickReport(doc, data, report) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const endingBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance || 0 : 0;
  const sourceFiles = Array.isArray(report?.sourceFiles) ? report.sourceFiles : [];
  const sourcePreview = sourceFiles.slice(0, 4).join(', ');
  const extraSources = sourceFiles.length > 4 ? ` +${sourceFiles.length - 4} more` : '';

  doc.fontSize(22).font('Helvetica-Bold').fillColor('#16213e')
    .text(report.kind === 'source' ? 'Source Account Quick Report' : 'Distribution Quick Report', { align: 'center' });
  doc.moveDown(0.2);
  doc.fontSize(11).font('Helvetica-Bold').fillColor('#1f4f96')
    .text(report.title || 'Quick Report', { align: 'center' });
  doc.fontSize(9.5).font('Helvetica').fillColor('#5b6477')
    .text(report.subtitle || 'Transaction activity report', { align: 'center' });

  if (data.periodLabel) {
    doc.text(`Period: ${data.periodLabel}`, { align: 'center' });
  }

  doc.moveDown(0.8);

  const cardY = doc.y;
  const cardX = doc.page.margins.left;
  const gap = 16;
  const cardWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right - (gap * 2)) / 3;
  drawQuickReportMetricCard(doc, cardX, cardY, cardWidth, 'Transactions', `${(report.transactionCount || 0).toLocaleString()}`);
  drawQuickReportMetricCard(doc, cardX + cardWidth + gap, cardY, cardWidth, 'Total Movement', formatSignedCurrency(report.total || 0));
  drawQuickReportMetricCard(doc, cardX + ((cardWidth + gap) * 2), cardY, cardWidth, report.balanceLabel || 'Ending Balance', formatSignedCurrency(endingBalance));
  doc.y = cardY + 82;

  if (report.note) {
    doc.fontSize(9).font('Helvetica').fillColor('#3f4c63')
      .text(report.note, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
    doc.moveDown(0.5);
  }

  if (sourcePreview) {
    doc.fontSize(8.5).font('Helvetica').fillColor('#677185')
      .text(`Source files: ${sourcePreview}${extraSources}`, { width: doc.page.width - doc.page.margins.left - doc.page.margins.right });
    doc.moveDown(0.8);
  }

  const headerState = drawQuickReportTableHeader(doc, report);
  let rowY = doc.y;

  rows.forEach((row, index) => {
    const rowValues = headerState.columns.map((column) => String(getQuickReportRowValue(report, row, column.key) || ''));
    const rowHeight = Math.max(
      18,
      ...headerState.columns.map((column, columnIndex) => doc.heightOfString(rowValues[columnIndex], {
        width: column.width - 12,
        align: column.align || 'left',
      }) + 8),
    );

    if (rowY + rowHeight > doc.page.height - doc.page.margins.bottom - 24) {
      doc.addPage();
      doc.y = doc.page.margins.top;
      drawQuickReportTableHeader(doc, report);
      rowY = doc.y;
    }

    if (index % 2 === 0) {
      doc.rect(headerState.tableX, rowY, headerState.tableWidth, rowHeight).fill('#f9fbff');
    }

    doc.fontSize(8.2).font('Helvetica').fillColor('#1f2937');

    let currentX = headerState.tableX;
    headerState.columns.forEach((column, columnIndex) => {
      doc.text(rowValues[columnIndex], currentX + 6, rowY + 4, {
        width: column.width - 12,
        align: column.align || 'left',
      });
      currentX += column.width;
    });

    doc.moveTo(headerState.tableX, rowY + rowHeight)
      .lineTo(headerState.tableX + headerState.tableWidth, rowY + rowHeight)
      .strokeColor('#dfe7f5')
      .lineWidth(0.5)
      .stroke();

    rowY += rowHeight;
    doc.y = rowY;
  });

  doc.moveDown(1);
  doc.fontSize(8).font('Helvetica').fillColor('#999')
    .text('This quick report was generated automatically by Tax Agent.', { align: 'center' });
}

function drawProfessionalReport(doc, data) {
  const {
    transactionCount = 0,
    includedTransactionCount = 0,
    excludedCount = 0,
    periodLabel = '',
    totalIncome = 0,
    totalCostOfGoodsSold = 0,
    grossProfit = 0,
    totalExpenses = 0,
    netOperatingIncome = 0,
    totalOtherIncome = 0,
    totalOtherExpenses = 0,
    netIncome = 0,
    statementRows = [],
  } = data;

  doc.fontSize(22).font('Helvetica-Bold').fillColor('#1a1a2e')
    .text('Professional Profit & Loss', { align: 'center' });
  doc.moveDown(0.25);
  doc.fontSize(10).font('Helvetica').fillColor('#666')
    .text('Cash-basis statement generated from uploaded bank statements', { align: 'center' });
  if (periodLabel) {
    doc.text(`Period: ${periodLabel}`, { align: 'center' });
  }
  doc.text(`Transactions analyzed: ${transactionCount}`, { align: 'center' });
  if (excludedCount > 0) {
    doc.text(`Excluded from P&L view: ${excludedCount}`, { align: 'center' });
  }
  doc.moveDown(1);

  const summaryY = doc.y;
  doc.roundedRect(50, summaryY, 495, 96, 10).fill('#f0f4ff');
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1a1a2e')
    .text('Summary', 70, summaryY + 10);
  doc.fontSize(10).font('Helvetica').fillColor('#333');

  doc.text(`Income: ${formatCurrency(totalIncome)}`, 70, summaryY + 30);
  doc.text(`COGS: ${formatCurrency(totalCostOfGoodsSold)}`, 70, summaryY + 48);
  doc.text(`Gross Profit: ${formatCurrency(grossProfit)}`, 70, summaryY + 66);

  doc.text(`Expenses: ${formatCurrency(totalExpenses)}`, 245, summaryY + 30);
  doc.text(`Net Operating Income: ${formatCurrency(netOperatingIncome)}`, 245, summaryY + 48);
  doc.text(`Net Income: ${formatCurrency(netIncome)}`, 245, summaryY + 66);

  doc.text(`Included transactions: ${includedTransactionCount}`, 430, summaryY + 30, { width: 95, align: 'right' });
  doc.text(`Other Income: ${formatCurrency(totalOtherIncome)}`, 360, summaryY + 48, { width: 165, align: 'right' });
  doc.text(`Other Expenses: ${formatCurrency(totalOtherExpenses)}`, 360, summaryY + 66, { width: 165, align: 'right' });

  doc.y = summaryY + 112;
  drawProfessionalTableHeader(doc);

  let rowY = doc.y;
  statementRows.forEach((row) => {
    const rowHeight = row.type === 'section' ? 22 : row.type === 'metric' ? 24 : 18;

    if (rowY > 740) {
      doc.addPage();
      doc.y = 50;
      drawProfessionalTableHeader(doc);
      rowY = doc.y;
    }

    const labelX = 62 + ((row.depth || 0) * 18);

    if (row.type === 'section') {
      doc.rect(50, rowY, 495, rowHeight).fill('#edf3ff');
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a2e');
      doc.text(row.label, 62, rowY + 6);
    } else if (row.type === 'metric') {
      doc.rect(50, rowY, 495, rowHeight).fill('#e4efff');
      doc.fontSize(10.5).font('Helvetica-Bold').fillColor('#153b73');
      doc.text(row.label, 62, rowY + 7);
      doc.text(formatCurrency(row.total), 390, rowY + 7, { width: 135, align: 'right' });
    } else if (row.type === 'section-total') {
      doc.rect(50, rowY, 495, rowHeight).fill('#f7f9fc');
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1a1a2e');
      doc.text(row.label, 62, rowY + 5);
      doc.text(formatCurrency(row.total), 390, rowY + 5, { width: 135, align: 'right' });
    } else if (row.type === 'subtotal') {
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#334155');
      doc.text(row.label, labelX, rowY + 4);
      doc.text(formatCurrency(row.total), 390, rowY + 4, { width: 135, align: 'right' });
    } else if (row.type === 'group') {
      doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#e2e8f0');
      doc.text(row.label, labelX, rowY + 4);
    } else {
      doc.fontSize(9).font('Helvetica').fillColor('#1f2937');
      doc.text(row.label, labelX, rowY + 4);
      doc.text(formatCurrency(row.total), 390, rowY + 4, { width: 135, align: 'right' });
    }

    rowY += rowHeight;
    doc.y = rowY;
  });

  doc.moveDown(1.5);
  doc.fontSize(8).font('Helvetica').fillColor('#999')
    .text('This report was generated automatically by Tax Agent.', { align: 'center' });
}

app.post('/api/report', (req, res) => {
  try {
    const mode = normalizeAnalysisMode(req.body.mode);
    const exportTarget = getReportExportTarget(req.body);
    const selectedQuickReport = exportTarget.kind === 'quick-report'
      ? findQuickReportById(req.body.quickReports, exportTarget.reportId)
      : null;

    if (exportTarget.kind === 'quick-report' && !selectedQuickReport) {
      return res.status(400).json({ error: 'Selected quick report could not be found in the current professional report payload.' });
    }

    const doc = new PDFDocument({
      margin: exportTarget.kind === 'quick-report' ? 40 : 50,
      size: 'A4',
      layout: exportTarget.kind === 'quick-report' ? 'landscape' : 'portrait',
    });
    const filename = buildPdfFilename(mode, exportTarget, selectedQuickReport);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    if (exportTarget.kind === 'quick-report' && selectedQuickReport) {
      drawQuickReport(doc, req.body, selectedQuickReport);
    } else if (mode === PROFESSIONAL_MODE) {
      drawProfessionalReport(doc, req.body);
    } else {
      drawSimpleReport(doc, req.body);
    }

    doc.end();
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(process.cwd(), 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`\nTax Agent server running on port ${PORT}`);
});

server.setTimeout(30 * 60 * 1000);
