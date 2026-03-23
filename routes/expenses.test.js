const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const { insertTransaction, uniqueId } = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('GET /api/expenses', () => {
  it('returns empty array when no transactions exist', async () => {
    const res = await request(app).get('/api/expenses');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns all transactions without pagination', async () => {
    await insertTransaction(pool, { description: 'Coffee' });
    await insertTransaction(pool, { description: 'Lunch' });

    const res = await request(app).get('/api/expenses');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('returns paginated results with limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await insertTransaction(pool, { date: `2024-06-${String(15 - i).padStart(2, '0')}` });
    }

    const res = await request(app).get('/api/expenses?limit=2&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.expenses).toHaveLength(2);
    expect(res.body.total).toBe(5);
  });

  it('returns transactions ordered by date descending', async () => {
    await insertTransaction(pool, { date: '2024-01-01', description: 'Old' });
    await insertTransaction(pool, { date: '2024-06-15', description: 'New' });

    const res = await request(app).get('/api/expenses');
    expect(res.body[0].description).toBe('New');
    expect(res.body[1].description).toBe('Old');
  });

  it('filters by dateFrom and dateTo', async () => {
    await insertTransaction(pool, { date: '2024-01-01', description: 'Jan' });
    await insertTransaction(pool, { date: '2024-06-15', description: 'Jun' });
    await insertTransaction(pool, { date: '2024-12-01', description: 'Dec' });

    const res = await request(app).get('/api/expenses?dateFrom=2024-06-01&dateTo=2024-06-30');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe('Jun');
  });

  it('filters by userId', async () => {
    await insertTransaction(pool, { user_id: 'user-1', description: 'User1' });
    await insertTransaction(pool, { user_id: 'user-2', description: 'User2' });

    const res = await request(app).get('/api/expenses?userId=user-1');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe('User1');
  });

  it('filters by categories', async () => {
    await insertTransaction(pool, { category: 'Food', description: 'Pizza' });
    await insertTransaction(pool, { category: 'Travel', description: 'Flight' });

    const res = await request(app).get('/api/expenses?categories=Food');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe('Pizza');
  });

  it('filters by type', async () => {
    await insertTransaction(pool, { type: 'expense', description: 'Expense' });
    await insertTransaction(pool, { type: 'income', description: 'Income' });

    const res = await request(app).get('/api/expenses?types=income');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe('Income');
  });

  it('filters by search text in description', async () => {
    await insertTransaction(pool, { description: 'Starbucks Coffee' });
    await insertTransaction(pool, { description: 'Grocery Store' });

    const res = await request(app).get('/api/expenses?search=starbucks');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe('Starbucks Coffee');
  });

  it('filters by labels', async () => {
    await insertTransaction(pool, {
      description: 'Labeled',
      labels: JSON.stringify(['vacation']),
    });
    await insertTransaction(pool, { description: 'No label' });

    const res = await request(app).get('/api/expenses?labels=vacation');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe('Labeled');
  });

  it('filters by amount range', async () => {
    await insertTransaction(pool, { amount: 10, description: 'Small' });
    await insertTransaction(pool, { amount: 50, description: 'Medium' });
    await insertTransaction(pool, { amount: 100, description: 'Large' });

    const res = await request(app).get('/api/expenses?minAmount=20&maxAmount=60');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe('Medium');
  });

  it('filters by sources', async () => {
    await insertTransaction(pool, {
      description: 'From Chase',
      metadata: JSON.stringify({ sourceId: 'chase-1' }),
    });
    await insertTransaction(pool, {
      description: 'From Amex',
      metadata: JSON.stringify({ sourceId: 'amex-1' }),
    });

    const res = await request(app).get('/api/expenses?sources=chase-1');
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe('From Chase');
  });

  it('combines multiple filters', async () => {
    await insertTransaction(pool, {
      date: '2024-06-15',
      type: 'expense',
      category: 'Food',
      description: 'Match',
    });
    await insertTransaction(pool, {
      date: '2024-06-15',
      type: 'income',
      category: 'Food',
      description: 'Wrong type',
    });
    await insertTransaction(pool, {
      date: '2024-01-01',
      type: 'expense',
      category: 'Food',
      description: 'Wrong date',
    });

    const res = await request(app).get(
      '/api/expenses?dateFrom=2024-06-01&dateTo=2024-06-30&types=expense&categories=Food'
    );
    expect(res.body).toHaveLength(1);
    expect(res.body[0].description).toBe('Match');
  });
});

describe('GET /api/stats', () => {
  it('returns zero stats when no transactions exist', async () => {
    const res = await request(app).get('/api/stats');
    expect(res.status).toBe(200);
    expect(res.body.totalExpenses).toBe(0);
    expect(res.body.totalIncome).toBe(0);
    expect(res.body.netAmount).toBe(0);
  });

  it('computes correct totals', async () => {
    await insertTransaction(pool, { type: 'expense', amount: 50 });
    await insertTransaction(pool, { type: 'expense', amount: 30 });
    await insertTransaction(pool, { type: 'income', amount: 100 });

    const res = await request(app).get('/api/stats');
    expect(res.body.totalExpenses).toBe(80);
    expect(res.body.totalIncome).toBe(100);
    expect(res.body.netAmount).toBe(20);
  });

  it('returns category breakdown', async () => {
    await insertTransaction(pool, { type: 'expense', category: 'Food', amount: 25 });
    await insertTransaction(pool, { type: 'expense', category: 'Food', amount: 15 });
    await insertTransaction(pool, { type: 'expense', category: 'Travel', amount: 100 });

    const res = await request(app).get('/api/stats');
    expect(res.body.categoryBreakdown.Food).toBe(40);
    expect(res.body.categoryBreakdown.Travel).toBe(100);
  });

  it('returns income category breakdown', async () => {
    await insertTransaction(pool, { type: 'income', category: 'Salary', amount: 5000 });

    const res = await request(app).get('/api/stats');
    expect(res.body.incomeCategoryBreakdown.Salary).toBe(5000);
  });

  it('returns monthly data', async () => {
    await insertTransaction(pool, { type: 'expense', date: '2024-01-15', amount: 50 });
    await insertTransaction(pool, { type: 'expense', date: '2024-02-15', amount: 30 });

    const res = await request(app).get('/api/stats');
    expect(res.body.monthlyData).toHaveLength(2);
    expect(res.body.monthlyData[0].expenses).toBe(50);
    expect(res.body.monthlyData[1].expenses).toBe(30);
  });

  it('returns top expenses and income', async () => {
    await insertTransaction(pool, { type: 'expense', amount: 500, description: 'Big' });
    await insertTransaction(pool, { type: 'expense', amount: 10, description: 'Small' });
    await insertTransaction(pool, { type: 'income', amount: 3000, description: 'Salary' });

    const res = await request(app).get('/api/stats');
    expect(res.body.topExpenses[0].description).toBe('Big');
    expect(res.body.topIncome[0].description).toBe('Salary');
  });

  it('excludes transfers from stats', async () => {
    await insertTransaction(pool, { type: 'expense', amount: 100 });
    await insertTransaction(pool, {
      type: 'expense',
      amount: 50,
      transfer_info: JSON.stringify({
        isTransfer: true,
        transferId: 'tf-1',
        transferType: 'self',
        excludedFromCalculations: true,
      }),
      excluded_from_calculations: true,
    });

    const res = await request(app).get('/api/stats');
    expect(res.body.totalExpenses).toBe(100);
  });

  it('includes transfers with userOverride', async () => {
    await insertTransaction(pool, {
      type: 'expense',
      amount: 50,
      transfer_info: JSON.stringify({
        isTransfer: true,
        transferId: 'tf-1',
        transferType: 'self',
        excludedFromCalculations: false,
        userOverride: true,
      }),
      excluded_from_calculations: false,
    });

    const res = await request(app).get('/api/stats');
    expect(res.body.totalExpenses).toBe(50);
  });

  it('filters stats by date range', async () => {
    await insertTransaction(pool, { type: 'expense', date: '2024-01-15', amount: 50 });
    await insertTransaction(pool, { type: 'expense', date: '2024-06-15', amount: 30 });

    const res = await request(app).get('/api/stats?dateFrom=2024-06-01&dateTo=2024-06-30');
    expect(res.body.totalExpenses).toBe(30);
  });

  it('filters stats by userId', async () => {
    await insertTransaction(pool, { type: 'expense', user_id: 'user-1', amount: 50 });
    await insertTransaction(pool, { type: 'expense', user_id: 'user-2', amount: 30 });

    const res = await request(app).get('/api/stats?userId=user-1');
    expect(res.body.totalExpenses).toBe(50);
  });
});

describe('PATCH /api/expenses/:id', () => {
  it('updates a transaction field', async () => {
    const txn = await insertTransaction(pool, { description: 'Original' });

    const res = await request(app)
      .patch(`/api/expenses/${txn.id}`)
      .send({ description: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Updated');
  });

  it('updates multiple fields', async () => {
    const txn = await insertTransaction(pool);

    const res = await request(app).patch(`/api/expenses/${txn.id}`).send({
      description: 'New Desc',
      category: 'Travel',
      amount: 99.99,
    });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('New Desc');
    expect(res.body.category).toBe('Travel');
    expect(res.body.amount).toBe(99.99);
  });

  it('updates labels', async () => {
    const txn = await insertTransaction(pool);

    const res = await request(app)
      .patch(`/api/expenses/${txn.id}`)
      .send({ labels: ['vacation', 'food'] });

    expect(res.status).toBe(200);
    expect(res.body.labels).toEqual(['vacation', 'food']);
  });

  it('updates transferInfo', async () => {
    const txn = await insertTransaction(pool);
    const transferInfo = { isTransfer: true, transferId: 'tf-1' };

    const res = await request(app).patch(`/api/expenses/${txn.id}`).send({ transferInfo });

    expect(res.status).toBe(200);
    expect(res.body.transferInfo).toMatchObject(transferInfo);
  });

  it('returns 404 for non-existent transaction', async () => {
    const res = await request(app)
      .patch('/api/expenses/nonexistent-id')
      .send({ description: 'Test' });

    expect(res.status).toBe(404);
  });

  it('returns 400 when no fields provided', async () => {
    const txn = await insertTransaction(pool);

    const res = await request(app).patch(`/api/expenses/${txn.id}`).send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/expenses', () => {
  it('bulk replaces all transactions', async () => {
    await insertTransaction(pool, { description: 'Old' });

    const newExpenses = [
      {
        id: uniqueId('txn'),
        date: '2024-06-15',
        description: 'New1',
        category: 'Food',
        amount: 10,
        type: 'expense',
        user: 'user-1',
      },
      {
        id: uniqueId('txn'),
        date: '2024-06-16',
        description: 'New2',
        category: 'Travel',
        amount: 20,
        type: 'expense',
        user: 'user-1',
      },
    ];

    const res = await request(app).post('/api/expenses').send({ expenses: newExpenses });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);

    // Verify old data is gone
    const check = await request(app).get('/api/expenses');
    expect(check.body).toHaveLength(2);
    expect(check.body.map((e) => e.description).sort()).toEqual(['New1', 'New2']);
  });

  it('saves metadata alongside expenses', async () => {
    const expenses = [
      {
        id: uniqueId('txn'),
        date: '2024-06-15',
        description: 'Test',
        category: 'Food',
        amount: 10,
        type: 'expense',
        user: 'user-1',
      },
    ];

    await request(app)
      .post('/api/expenses')
      .send({
        expenses,
        metadata: { lastSync: '2024-06-15' },
      });

    const metaResult = await pool.query(
      "SELECT value FROM metadata WHERE key = 'storage_metadata'"
    );
    expect(metaResult.rows).toHaveLength(1);
    expect(metaResult.rows[0].value).toMatchObject({ lastSync: '2024-06-15' });
  });

  it('handles empty expenses array', async () => {
    const res = await request(app).post('/api/expenses').send({ expenses: [] });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
  });
});
