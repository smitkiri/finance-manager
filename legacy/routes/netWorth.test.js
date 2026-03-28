const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const { insertAccount, insertAccountBalance, uniqueId } = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('Account CRUD', () => {
  describe('GET /api/accounts', () => {
    it('returns empty array when no accounts exist', async () => {
      const res = await request(app).get('/api/accounts');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns accounts sorted by type and name', async () => {
      await insertAccount(pool, { name: 'Savings', type: 'asset' });
      await insertAccount(pool, { name: 'Credit Card', type: 'liability' });
      await insertAccount(pool, { name: 'Checking', type: 'asset' });

      const res = await request(app).get('/api/accounts');
      expect(res.body).toHaveLength(3);
      expect(res.body[0].type).toBe('asset');
      expect(res.body[2].type).toBe('liability');
    });

    it('filters by userId', async () => {
      await insertAccount(pool, { user_id: 'user-1', name: 'Account A' });
      await insertAccount(pool, { user_id: 'user-2', name: 'Account B' });

      const res = await request(app).get('/api/accounts?userId=user-1');
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Account A');
    });
  });

  describe('POST /api/accounts', () => {
    it('creates an account', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .send({
          id: uniqueId('acct'),
          userId: 'user-1',
          name: 'New Account',
          type: 'asset',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Account');
      expect(res.body.type).toBe('asset');
    });

    it('requires all fields', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .send({
          id: uniqueId('acct'),
          name: 'Missing Fields',
        });
      expect(res.status).toBe(400);
    });

    it('validates type is asset or liability', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .send({
          id: uniqueId('acct'),
          userId: 'user-1',
          name: 'Bad Type',
          type: 'invalid',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/accounts/:id', () => {
    it('updates account name and type', async () => {
      const acct = await insertAccount(pool, { name: 'Old Name', type: 'asset' });

      const res = await request(app).put(`/api/accounts/${acct.id}`).send({
        name: 'New Name',
        type: 'liability',
      });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('New Name');
      expect(res.body.type).toBe('liability');
    });

    it('returns 404 for non-existent account', async () => {
      const res = await request(app).put('/api/accounts/nonexistent').send({
        name: 'Test',
        type: 'asset',
      });
      expect(res.status).toBe(404);
    });

    it('requires name and type', async () => {
      const acct = await insertAccount(pool);
      const res = await request(app).put(`/api/accounts/${acct.id}`).send({ name: 'Only Name' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/accounts/:id', () => {
    it('deletes an account and cascades to balances', async () => {
      const acct = await insertAccount(pool);
      await insertAccountBalance(pool, acct.id);

      const res = await request(app).delete(`/api/accounts/${acct.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const balances = await pool.query('SELECT * FROM account_balances WHERE account_id = $1', [
        acct.id,
      ]);
      expect(balances.rows).toHaveLength(0);
    });

    it('returns 404 for non-existent account', async () => {
      const res = await request(app).delete('/api/accounts/nonexistent');
      expect(res.status).toBe(404);
    });
  });
});

describe('Balance CRUD', () => {
  let account;

  beforeEach(async () => {
    account = await insertAccount(pool);
  });

  describe('POST /api/accounts/:id/balances', () => {
    it('adds a balance entry', async () => {
      const res = await request(app)
        .post(`/api/accounts/${account.id}/balances`)
        .send({
          id: uniqueId('bal'),
          balance: 5000,
          date: '2024-06-15',
          note: 'Monthly snapshot',
        });

      expect(res.status).toBe(200);
      expect(res.body.balance).toBe(5000);
      expect(res.body.note).toBe('Monthly snapshot');
    });

    it('requires id, balance, and date', async () => {
      const res = await request(app).post(`/api/accounts/${account.id}/balances`).send({
        balance: 5000,
      });
      expect(res.status).toBe(400);
    });

    it('returns 404 for non-existent account', async () => {
      const res = await request(app)
        .post('/api/accounts/nonexistent/balances')
        .send({
          id: uniqueId('bal'),
          balance: 5000,
          date: '2024-06-15',
        });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/accounts/:id/balances', () => {
    it('returns balance history sorted by date descending', async () => {
      await insertAccountBalance(pool, account.id, { date: '2024-01-15', balance: 1000 });
      await insertAccountBalance(pool, account.id, { date: '2024-06-15', balance: 5000 });

      const res = await request(app).get(`/api/accounts/${account.id}/balances`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].balance).toBe(5000);
      expect(res.body[1].balance).toBe(1000);
    });
  });

  describe('DELETE /api/accounts/:id/balances/:balanceId', () => {
    it('deletes a balance entry', async () => {
      const bal = await insertAccountBalance(pool, account.id);

      const res = await request(app).delete(`/api/accounts/${account.id}/balances/${bal.id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 404 for non-existent balance', async () => {
      const res = await request(app).delete(`/api/accounts/${account.id}/balances/nonexistent`);
      expect(res.status).toBe(404);
    });
  });
});

describe('Net Worth Summary & History', () => {
  describe('GET /api/net-worth/summary', () => {
    it('returns zero when no accounts exist', async () => {
      const res = await request(app).get('/api/net-worth/summary');
      expect(res.status).toBe(200);
      expect(res.body.totalAssets).toBe(0);
      expect(res.body.totalLiabilities).toBe(0);
      expect(res.body.netWorth).toBe(0);
    });

    it('computes net worth from latest balances', async () => {
      const checking = await insertAccount(pool, { name: 'Checking', type: 'asset' });
      const creditCard = await insertAccount(pool, { name: 'Credit Card', type: 'liability' });

      await insertAccountBalance(pool, checking.id, { balance: 10000, date: '2024-06-15' });
      await insertAccountBalance(pool, creditCard.id, { balance: 2000, date: '2024-06-15' });

      const res = await request(app).get('/api/net-worth/summary');
      expect(res.body.totalAssets).toBe(10000);
      expect(res.body.totalLiabilities).toBe(2000);
      expect(res.body.netWorth).toBe(8000);
    });

    it('uses most recent balance per account', async () => {
      const acct = await insertAccount(pool, { type: 'asset' });
      await insertAccountBalance(pool, acct.id, { balance: 1000, date: '2024-01-15' });
      await insertAccountBalance(pool, acct.id, { balance: 5000, date: '2024-06-15' });

      const res = await request(app).get('/api/net-worth/summary');
      expect(res.body.totalAssets).toBe(5000);
    });

    it('filters by userId', async () => {
      const acct1 = await insertAccount(pool, { user_id: 'user-1', type: 'asset' });
      const acct2 = await insertAccount(pool, { user_id: 'user-2', type: 'asset' });

      await insertAccountBalance(pool, acct1.id, { balance: 1000, date: '2024-06-15' });
      await insertAccountBalance(pool, acct2.id, { balance: 2000, date: '2024-06-15' });

      const res = await request(app).get('/api/net-worth/summary?userId=user-1');
      expect(res.body.totalAssets).toBe(1000);
    });
  });

  describe('GET /api/net-worth/history', () => {
    it('returns net worth over time', async () => {
      const acct = await insertAccount(pool, { type: 'asset' });
      await insertAccountBalance(pool, acct.id, { balance: 1000, date: '2024-01-15' });
      await insertAccountBalance(pool, acct.id, { balance: 2000, date: '2024-06-15' });

      const res = await request(app).get('/api/net-worth/history');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].totalAssets).toBe(1000);
      expect(res.body[1].totalAssets).toBe(2000);
    });

    it('returns empty array when no balances exist', async () => {
      const res = await request(app).get('/api/net-worth/history');
      expect(res.body).toEqual([]);
    });
  });
});
