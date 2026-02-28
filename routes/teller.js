const express = require('express');
const router = express.Router();
const https = require('https');
const fs = require('fs');
const db = require('../database');

function isTellerEnabled() {
  return !!(
    process.env.FINANCE_MANAGER_TELLER_INTEGRATION_ENABLED === 'true' &&
    process.env.FINANCE_MANAGER_TELLER_TOKEN &&
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
      applicationId: process.env.FINANCE_MANAGER_TELLER_TOKEN,
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
        const balance = parseFloat(balanceData.available ?? balanceData.ledger ?? 0);

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

module.exports = router;
