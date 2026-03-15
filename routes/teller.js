const express = require('express');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../database');
const { findSimilarTransactionCategory } = require('../helpers/categoryMatcher');
const { detectTransfers } = require('../helpers/transferDetection');

const UNCATEGORIZED = 'Uncategorized';

const importPreviewCache = new Map();
// { previewToken: { accounts: [...], categoryMap: {...}, expiresAt: timestamp } }

function cleanExpiredPreviews() {
  const now = Date.now();
  for (const [token, entry] of importPreviewCache.entries()) {
    if (entry.expiresAt < now) importPreviewCache.delete(token);
  }
}

function isTellerEnabled() {
  return !!(
    process.env.FINANCE_MANAGER_TELLER_INTEGRATION_ENABLED === 'true' &&
    process.env.FINANCE_MANAGER_TELLER_APP_ID &&
    process.env.FINANCE_MANAGER_TELLER_PRIVATE_KEY &&
    process.env.FINANCE_MANAGER_TELLER_CERT
  );
}

// Promise wrapper for Teller API requests using mTLS + Basic auth
function tellerRequest(path, accessToken) {
  return new Promise((resolve, reject) => {
    const cert = fs.readFileSync(process.env.FINANCE_MANAGER_TELLER_CERT);
    const key = fs.readFileSync(process.env.FINANCE_MANAGER_TELLER_PRIVATE_KEY);
    const agent = new https.Agent({ cert, key });
    const auth = Buffer.from(`${accessToken}:`).toString('base64');

    const options = {
      hostname: 'api.teller.io',
      path,
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
      },
      agent,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Read enrollments array from DB, handling backward compat with old single-enrollment key
async function readEnrollments() {
  const arrayResult = await db.query(
    "SELECT value FROM metadata WHERE key = 'teller_enrollments'"
  );
  if (arrayResult.rows.length > 0) {
    return Array.isArray(arrayResult.rows[0].value) ? arrayResult.rows[0].value : [];
  }

  // Fall back to old single-enrollment key and migrate it
  const singleResult = await db.query(
    "SELECT value FROM metadata WHERE key = 'teller_enrollment'"
  );
  if (singleResult.rows.length > 0) {
    const old = singleResult.rows[0].value;
    const migrated = [{
      accessToken: old.accessToken,
      userId: old.userId,
      enrollmentId: old.enrollmentId,
      institutionName: null,
      connectedAt: new Date().toISOString(),
    }];
    await db.query(
      `INSERT INTO metadata (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['teller_enrollments', JSON.stringify(migrated)]
    );
    await db.query("DELETE FROM metadata WHERE key = 'teller_enrollment'");
    return migrated;
  }

  return [];
}

async function writeEnrollments(enrollments) {
  await db.query(
    `INSERT INTO metadata (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    ['teller_enrollments', JSON.stringify(enrollments)]
  );
}

// GET /api/teller/config
router.get('/teller/config', async (req, res) => {
  if (!isTellerEnabled()) {
    return res.json({ enabled: false, enrollments: [] });
  }

  try {
    const enrollments = await readEnrollments();
    res.json({
      enabled: true,
      applicationId: process.env.FINANCE_MANAGER_TELLER_APP_ID,
      enrollments: enrollments.map(e => ({
        enrollmentId: e.enrollmentId,
        institutionName: e.institutionName || null,
        connectedAt: e.connectedAt || null,
      })),
    });
  } catch (error) {
    console.error('Error checking teller config:', error);
    res.status(500).json({ error: 'Failed to check teller config' });
  }
});

// POST /api/teller/preview-accounts
// Fetches accounts from Teller for a given access token without persisting anything.
// Used to let the user select which accounts to add before enrolling.
router.post('/teller/preview-accounts', async (req, res) => {
  if (!isTellerEnabled()) {
    return res.status(400).json({ error: 'Teller integration not enabled' });
  }

  const { accessToken } = req.body;
  if (!accessToken) {
    return res.status(400).json({ error: 'accessToken is required' });
  }

  try {
    const accountsResponse = await tellerRequest('/accounts', accessToken);
    if (accountsResponse.status !== 200) {
      return res.status(502).json({ error: 'Failed to fetch accounts from Teller' });
    }

    const accounts = Array.isArray(accountsResponse.data) ? accountsResponse.data : [];
    res.json(accounts.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,           // e.g. 'depository', 'credit', 'investment', 'loan'
      subtype: a.subtype,     // e.g. 'checking', 'savings', 'credit_card'
    })));
  } catch (error) {
    console.error('Error previewing Teller accounts:', error);
    res.status(500).json({ error: 'Failed to preview accounts' });
  }
});

// POST /api/teller/enroll
router.post('/teller/enroll', async (req, res) => {
  const { accessToken, userId, enrollmentId, institutionName, selectedAccounts } = req.body;

  if (!accessToken) {
    return res.status(400).json({ error: 'accessToken is required' });
  }

  try {
    // Save the enrollment
    const enrollments = await readEnrollments();
    const idx = enrollments.findIndex(e => e.enrollmentId === enrollmentId);
    const entry = {
      accessToken,
      userId: userId || null,
      enrollmentId: enrollmentId || null,
      institutionName: institutionName || null,
      connectedAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      enrollments[idx] = entry;
    } else {
      enrollments.push(entry);
    }
    await writeEnrollments(enrollments);

    // Create account records for user-selected accounts
    if (Array.isArray(selectedAccounts) && selectedAccounts.length > 0) {
      let accountUserId = userId || null;
      if (accountUserId) {
        const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [accountUserId]);
        if (userCheck.rows.length === 0) accountUserId = null;
      }
      if (!accountUserId) {
        const usersResult = await db.query('SELECT id FROM users ORDER BY created_at LIMIT 1');
        accountUserId = usersResult.rows[0]?.id ?? 'default-user';
      }

      for (const acct of selectedAccounts) {
        const existing = await db.query(
          'SELECT id FROM accounts WHERE teller_account_id = $1',
          [acct.tellerAccountId]
        );
        if (existing.rows.length === 0) {
          const accountId = Date.now().toString(36) + Math.random().toString(36).slice(2);
          await db.query(
            `INSERT INTO accounts (id, user_id, name, type, teller_account_id, teller_enrollment_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [accountId, accountUserId, acct.alias, acct.accountType, acct.tellerAccountId, enrollmentId || null]
          );
        } else {
          // Update alias, type, and enrollment if account was already added
          await db.query(
            'UPDATE accounts SET name = $1, type = $2, teller_enrollment_id = $3, updated_at = NOW() WHERE teller_account_id = $4',
            [acct.alias, acct.accountType, enrollmentId || null, acct.tellerAccountId]
          );
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error saving teller enrollment:', error);
    res.status(500).json({ error: 'Failed to save enrollment' });
  }
});

// POST /api/teller/disconnect
router.post('/teller/disconnect', async (req, res) => {
  const { enrollmentId } = req.body;

  if (!enrollmentId) {
    return res.status(400).json({ error: 'enrollmentId is required' });
  }

  try {
    // Delete accounts linked to this enrollment (account_balances cascade via FK)
    const deleted = await db.query(
      'DELETE FROM accounts WHERE teller_enrollment_id = $1 RETURNING id',
      [enrollmentId]
    );

    const enrollments = await readEnrollments();
    const updated = enrollments.filter(e => e.enrollmentId !== enrollmentId);
    await writeEnrollments(updated);

    res.json({ success: true, accountsDeleted: deleted.rowCount });
  } catch (error) {
    console.error('Error disconnecting teller enrollment:', error);
    res.status(500).json({ error: 'Failed to disconnect enrollment' });
  }
});

// GET /api/teller/enrollments/:enrollmentId/preview-accounts
// Fetches accounts from Teller for an already-enrolled institution using the stored access token.
router.get('/teller/enrollments/:enrollmentId/preview-accounts', async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const enrollments = await readEnrollments();
    const enrollment = enrollments.find(e => e.enrollmentId === enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }
    const accountsResponse = await tellerRequest('/accounts', enrollment.accessToken);
    if (accountsResponse.status !== 200) {
      return res.status(502).json({ error: 'Failed to fetch accounts from Teller' });
    }
    const accounts = Array.isArray(accountsResponse.data) ? accountsResponse.data : [];
    res.json(accounts.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      subtype: a.subtype,
    })));
  } catch (error) {
    console.error('Error previewing accounts for enrollment:', error);
    res.status(500).json({ error: 'Failed to preview accounts' });
  }
});

// POST /api/teller/enrollments/:enrollmentId/manage-accounts
// Adds new accounts and/or removes existing accounts for an enrollment.
// toAdd: [{ tellerAccountId, alias, accountType }]
// toRemove: [tellerAccountId, ...]  — deletes the account and all associated balances
router.post('/teller/enrollments/:enrollmentId/manage-accounts', async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { toAdd = [], toRemove = [], userId } = req.body;

    const enrollments = await readEnrollments();
    const enrollment = enrollments.find(e => e.enrollmentId === enrollmentId);
    if (!enrollment) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    // Resolve user for new accounts
    let accountUserId = userId || null;
    if (accountUserId) {
      const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [accountUserId]);
      if (userCheck.rows.length === 0) accountUserId = null;
    }
    if (!accountUserId) {
      const usersResult = await db.query('SELECT id FROM users ORDER BY created_at LIMIT 1');
      accountUserId = usersResult.rows[0]?.id ?? 'default-user';
    }

    // Remove accounts (account_balances cascade via FK)
    let removed = 0;
    for (const tellerAccountId of toRemove) {
      const result = await db.query(
        'DELETE FROM accounts WHERE teller_account_id = $1 AND teller_enrollment_id = $2 RETURNING id',
        [tellerAccountId, enrollmentId]
      );
      removed += result.rowCount;
    }

    // Add new accounts
    let added = 0;
    for (const acct of toAdd) {
      const existing = await db.query(
        'SELECT id FROM accounts WHERE teller_account_id = $1',
        [acct.tellerAccountId]
      );
      if (existing.rows.length === 0) {
        const accountId = Date.now().toString(36) + Math.random().toString(36).slice(2);
        await db.query(
          `INSERT INTO accounts (id, user_id, name, type, teller_account_id, teller_enrollment_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [accountId, accountUserId, acct.alias, acct.accountType, acct.tellerAccountId, enrollmentId]
        );
        added++;
      }
    }

    res.json({ success: true, added, removed });
  } catch (error) {
    console.error('Error managing accounts for enrollment:', error);
    res.status(500).json({ error: 'Failed to manage accounts' });
  }
});

// POST /api/teller/refresh-balances
// Only updates balances for accounts already linked via teller_account_id.
// Does not auto-create new accounts — account selection happens at enrollment time.
router.post('/teller/refresh-balances', async (req, res) => {
  try {
    const enrollments = await readEnrollments();

    if (enrollments.length === 0) {
      return res.status(400).json({ error: 'Not enrolled with Teller' });
    }

    const today = new Date().toISOString().split('T')[0];
    let refreshed = 0;

    for (const enrollment of enrollments) {
      const { accessToken } = enrollment;

      const accountsResponse = await tellerRequest('/accounts', accessToken);
      if (accountsResponse.status !== 200) continue;

      const tellerAccounts = Array.isArray(accountsResponse.data) ? accountsResponse.data : [];

      for (const tellerAccount of tellerAccounts) {
        // Only refresh accounts the user explicitly added — skip unknown ones
        const existingAccount = await db.query(
          'SELECT id FROM accounts WHERE teller_account_id = $1',
          [tellerAccount.id]
        );
        if (existingAccount.rows.length === 0) continue;

        const accountId = existingAccount.rows[0].id;

        const balancesResponse = await tellerRequest(`/accounts/${tellerAccount.id}/balances`, accessToken);
        if (balancesResponse.status !== 200) continue;

        const balanceData = balancesResponse.data;
        // For credit accounts, `available` is remaining credit, not the amount owed.
        // Use `ledger` (amount owed) for credit; `available` for everything else.
        const isCreditAccount = tellerAccount.type === 'credit';
        const balance = isCreditAccount
          ? parseFloat(balanceData.ledger ?? balanceData.available ?? 0)
          : parseFloat(balanceData.available ?? balanceData.ledger ?? 0);

        const balanceId = Date.now().toString(36) + Math.random().toString(36).slice(2);
        await db.query(
          `INSERT INTO account_balances (id, account_id, balance, date, note)
           VALUES ($1, $2, $3, $4, $5)`,
          [balanceId, accountId, balance, today, 'Auto-refreshed from Teller']
        );

        refreshed++;
      }
    }

    res.json({ refreshed });
  } catch (error) {
    console.error('Error refreshing Teller balances:', error);
    res.status(500).json({ error: 'Failed to refresh balances' });
  }
});

// GET /api/teller/category-mappings
// Returns saved mappings plus the count of Teller-imported transactions per original bank category.
router.get('/teller/category-mappings', async (req, res) => {
  try {
    const mappingsResult = await db.query("SELECT value FROM metadata WHERE key = 'teller_category_mappings'");
    const savedMappings = mappingsResult.rows[0]?.value || {};

    // Count transactions per original Teller category (stored in metadata)
    const countsResult = await db.query(`
      SELECT metadata->'teller'->'details'->>'category' AS teller_category, COUNT(*)::int AS count
      FROM transactions
      WHERE metadata->'teller'->'details'->>'category' IS NOT NULL
      GROUP BY teller_category
    `);
    const countMap = {};
    for (const row of countsResult.rows) {
      countMap[row.teller_category] = row.count;
    }

    const mappings = Object.entries(savedMappings).map(([tellerCategory, userCategory]) => ({
      tellerCategory,
      userCategory,
      transactionCount: countMap[tellerCategory] ?? 0,
    }));

    res.json({ mappings });
  } catch (error) {
    console.error('Error loading Teller category mappings:', error);
    res.status(500).json({ error: 'Failed to load category mappings' });
  }
});

// PUT /api/teller/category-mappings
// Replaces all saved mappings and immediately re-categorises affected transactions.
// Request: { mappings: [{ tellerCategory, userCategory }] }
router.put('/teller/category-mappings', async (req, res) => {
  const { mappings } = req.body;
  if (!Array.isArray(mappings)) {
    return res.status(400).json({ error: 'mappings array is required' });
  }

  try {
    // Load existing mappings so we can detect which ones changed
    const existingResult = await db.query("SELECT value FROM metadata WHERE key = 'teller_category_mappings'");
    const existingMappings = existingResult.rows[0]?.value || {};

    // Build the new mappings object
    const newMappings = {};
    for (const { tellerCategory, userCategory } of mappings) {
      if (tellerCategory && userCategory) newMappings[tellerCategory] = userCategory;
    }

    // For each mapping that changed or is new, update the affected transactions
    for (const [tellerCategory, userCategory] of Object.entries(newMappings)) {
      if (existingMappings[tellerCategory] !== userCategory) {
        await db.query(
          `UPDATE transactions
           SET category = $1
           WHERE metadata->'teller'->'details'->>'category' = $2`,
          [userCategory, tellerCategory]
        );
      }
    }

    // Persist the new mappings
    await db.query(
      `INSERT INTO metadata (key, value) VALUES ('teller_category_mappings', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(newMappings)]
    );

    res.json({ success: true, updated: Object.keys(newMappings).length });
  } catch (error) {
    console.error('Error updating Teller category mappings:', error);
    res.status(500).json({ error: 'Failed to update category mappings' });
  }
});

async function fetchTellerTransactionsInRange(accessToken, tellerAccountId, startDate, endDate) {
  const transactions = [];
  let fromId = undefined;
  // Teller returns transactions in reverse-chronological order (newest first).
  // We rely on this ordering to break pagination early once we've passed startDate.
  while (true) {
    const path = `/accounts/${tellerAccountId}/transactions?count=100${fromId ? `&from_id=${fromId}` : ''}`;
    const response = await tellerRequest(path, accessToken);
    if (response.status !== 200) {
      throw new Error(`Teller API error ${response.status} fetching transactions for account ${tellerAccountId}`);
    }
    const batch = Array.isArray(response.data) ? response.data : [];
    for (const tx of batch) {
      if (tx.date < startDate) return transactions; // past range, stop
      if (tx.date <= endDate && tx.status === 'posted') transactions.push(tx);
    }
    if (batch.length < 100) break; // no more pages
    fromId = batch[batch.length - 1].id;
  }
  return transactions;
}

// POST /api/teller/preview-import
router.post('/teller/preview-import', async (req, res) => {
  if (!isTellerEnabled()) {
    return res.status(400).json({ error: 'Teller integration not enabled' });
  }

  const { accountIds, startDate, endDate } = req.body;
  if (!Array.isArray(accountIds) || accountIds.length === 0) {
    return res.status(400).json({ error: 'accountIds is required' });
  }
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }
  if (startDate > endDate) {
    return res.status(400).json({ error: 'startDate must be before endDate' });
  }

  cleanExpiredPreviews();

  try {
    const enrollments = await readEnrollments();

    // Load existing categories, saved mappings, and existing transactions in parallel
    const [categoriesResult, mappingsResult, existingTxResult] = await Promise.all([
      db.query('SELECT name FROM categories'),
      db.query("SELECT value FROM metadata WHERE key = 'teller_category_mappings'"),
      db.query('SELECT id, date, description, category FROM transactions ORDER BY date DESC LIMIT 500'),
    ]);

    const existingCategoryNames = new Set(categoriesResult.rows.map(r => r.name));
    existingCategoryNames.add(UNCATEGORIZED);

    const savedMappings = mappingsResult.rows[0]?.value || {};

    const existingExpenses = existingTxResult.rows.map(row => ({
      id: row.id, date: row.date, description: row.description, category: row.category,
    }));

    // Fetch all accounts in parallel
    const accountErrors = [];
    const previewAccounts = (await Promise.all(accountIds.map(async (accountId) => {
      const accountResult = await db.query(
        'SELECT id, name, teller_account_id, teller_enrollment_id, user_id FROM accounts WHERE id = $1',
        [accountId]
      );
      if (accountResult.rows.length === 0) return null;
      const account = accountResult.rows[0];

      const enrollment = enrollments.find(e => e.enrollmentId === account.teller_enrollment_id);
      if (!enrollment) return null;

      let transactions;
      try {
        transactions = await fetchTellerTransactionsInRange(
          enrollment.accessToken,
          account.teller_account_id,
          startDate,
          endDate
        );
      } catch (err) {
        console.error(`Skipping account ${account.name} (${account.teller_account_id}): ${err.message}`);
        accountErrors.push({ accountName: account.name, error: err.message });
        return null;
      }

      const tellerIds = transactions.map(tx => tx.id);
      let existingIds = new Set();
      if (tellerIds.length > 0) {
        const existingResult = await db.query(
          "SELECT metadata->>'tellerTransactionId' as tid FROM transactions WHERE metadata->>'tellerTransactionId' = ANY($1::text[])",
          [tellerIds]
        );
        existingIds = new Set(existingResult.rows.map(r => r.tid));
      }

      const newTxs = transactions.filter(tx => !existingIds.has(tx.id));
      const dupTxs = transactions.filter(tx => existingIds.has(tx.id));

      return {
        accountId,
        accountName: account.name,
        userId: account.user_id,
        tellerAccountId: account.teller_account_id,
        newTransactions: newTxs,
        newCount: newTxs.length,
        duplicateCount: dupTxs.length,
      };
    }))).filter(Boolean);

    // Compute category for each new transaction and detect which categories are new to the user
    const categoryMap = {}; // txId -> computed category (after saved mappings)
    const allAssignedCategories = new Set();

    for (const account of previewAccounts) {
      for (const tx of account.newTransactions) {
        const description = tx.details?.counterparty?.name || tx.description;
        const tellerCategory = tx.details?.category;
        let category;
        if (tellerCategory) {
          // Apply saved mappings first; otherwise keep Teller's category
          category = savedMappings[tellerCategory] || tellerCategory;
        } else {
          category = findSimilarTransactionCategory(description, existingExpenses) || UNCATEGORIZED;
        }
        categoryMap[tx.id] = category;
        allAssignedCategories.add(category);
      }
    }

    const newCategories = [...allAssignedCategories].filter(c => !existingCategoryNames.has(c));

    const previewToken = crypto.randomBytes(16).toString('hex');
    importPreviewCache.set(previewToken, {
      accounts: previewAccounts,
      categoryMap,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    res.json({
      previewToken,
      accounts: previewAccounts.map(a => ({
        accountId: a.accountId,
        accountName: a.accountName,
        newCount: a.newCount,
        duplicateCount: a.duplicateCount,
      })),
      newCategories,
      ...(accountErrors.length > 0 ? { accountErrors } : {}),
    });
  } catch (error) {
    console.error('Error previewing Teller import:', error);
    res.status(500).json({ error: 'Failed to preview import' });
  }
});

// POST /api/teller/import-transactions
router.post('/teller/import-transactions', async (req, res) => {
  const { previewToken, userMappings = {} } = req.body;
  if (!previewToken) {
    return res.status(400).json({ error: 'previewToken is required' });
  }

  cleanExpiredPreviews();
  const preview = importPreviewCache.get(previewToken);
  if (!preview) {
    return res.status(400).json({ error: 'Preview expired or not found. Please preview again.' });
  }

  try {
    // Save any new user-provided category mappings
    if (Object.keys(userMappings).length > 0) {
      const existingMappingsResult = await db.query("SELECT value FROM metadata WHERE key = 'teller_category_mappings'");
      const existingMappings = existingMappingsResult.rows[0]?.value || {};
      const merged = { ...existingMappings, ...userMappings };
      await db.query(
        `INSERT INTO metadata (key, value) VALUES ('teller_category_mappings', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(merged)]
      );
    }

    const { accounts: previewAccounts, categoryMap } = preview;

    const sessions = [];
    const allNewExpenses = [];

    const client = await db.beginTransaction();
    try {
      for (const account of previewAccounts) {
        if (account.newTransactions.length === 0) continue;

        const sessionId = crypto.randomUUID();

        await client.query(
          `INSERT INTO import_sessions (id, user_id, source_id, source_name, file_name, transaction_count)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [sessionId, account.userId || null, null, `Teller: ${account.accountName}`, null, account.newTransactions.length]
        );

        for (const tx of account.newTransactions) {
          const description = tx.details?.counterparty?.name || tx.description;
          // Use pre-computed category from preview, then apply any user mappings on top
          const baseCategory = (categoryMap && categoryMap[tx.id]) || UNCATEGORIZED;
          const category = userMappings[baseCategory] || baseCategory;

          const expenseId = crypto.randomUUID();
          const expense = {
            id: expenseId,
            date: tx.date,
            description,
            category,
            amount: Math.abs(parseFloat(tx.amount)),
            type: tx.type === 'debit' ? 'expense' : 'income',
            user: account.userId,
            metadata: {
              tellerTransactionId: tx.id,
              sourceName: `Teller: ${account.accountName}`,
              importedAt: new Date().toISOString(),
              teller: { details: tx.details },
            },
          };

          await client.query(
            `INSERT INTO transactions (id, date, description, category, amount, type, user_id, labels, metadata, transfer_info, excluded_from_calculations, import_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              expense.id,
              expense.date,
              expense.description,
              expense.category,
              expense.amount,
              expense.type,
              expense.user,
              JSON.stringify([]),
              JSON.stringify(expense.metadata),
              null,
              false,
              sessionId,
            ]
          );

          allNewExpenses.push(expense);
        }

        sessions.push({
          accountId: account.accountId,
          accountName: account.accountName,
          sessionId,
          added: account.newTransactions.length,
          skipped: account.duplicateCount,
        });
      }

      await db.commitTransaction(client);
    } catch (txError) {
      await db.rollbackTransaction(client);
      throw txError;
    }

    // Run transfer detection scoped to the import date window ± 3 days (after successful commit)
    if (allNewExpenses.length > 0) {
      const importDates = allNewExpenses.map(e => e.date).sort();
      const windowStart = new Date(importDates[0]);
      windowStart.setDate(windowStart.getDate() - 3);
      const windowEnd = new Date(importDates[importDates.length - 1]);
      windowEnd.setDate(windowEnd.getDate() + 3);
      const allResult = await db.query(
        'SELECT * FROM transactions WHERE date BETWEEN $1 AND $2',
        [windowStart.toISOString().split('T')[0], windowEnd.toISOString().split('T')[0]]
      );
      const allExpenses = allResult.rows.map(row => ({
        id: row.id,
        date: row.date,
        description: row.description,
        category: row.category,
        amount: parseFloat(row.amount),
        type: row.type,
        user: row.user_id,
        labels: row.labels || [],
        metadata: row.metadata || {},
        transferInfo: row.transfer_info,
        excludedFromCalculations: row.excluded_from_calculations,
        importId: row.import_id || null,
      }));

      const { updatedTransactions } = detectTransfers(allExpenses);
      for (const expense of updatedTransactions) {
        if (expense.transferInfo) {
          await db.query(
            'UPDATE transactions SET transfer_info = $1, excluded_from_calculations = $2 WHERE id = $3',
            [JSON.stringify(expense.transferInfo), expense.excludedFromCalculations || false, expense.id]
          );
        }
      }
    }

    importPreviewCache.delete(previewToken);
    res.json({ sessions });
  } catch (error) {
    console.error('Error importing Teller transactions:', error);
    res.status(500).json({ error: 'Failed to import transactions' });
  }
});

module.exports = router;
