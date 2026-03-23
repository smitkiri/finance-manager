const request = require('supertest');
const { app } = require('../tests/setup/testApp');
const { pool, cleanAllTables } = require('../tests/setup/testDb');
const { insertTransaction, uniqueId } = require('../tests/setup/fixtures');

afterEach(async () => {
  await cleanAllTables();
});

describe('POST /api/detect-transfers', () => {
  it('detects transfer pairs between different sources', async () => {
    await insertTransaction(pool, {
      date: '2024-06-15',
      type: 'expense',
      amount: 500,
      description: 'Transfer out',
      user_id: 'user-1',
      metadata: JSON.stringify({ sourceId: 'bank-a' }),
    });
    await insertTransaction(pool, {
      date: '2024-06-15',
      type: 'income',
      amount: 500,
      description: 'Transfer in',
      user_id: 'user-1',
      metadata: JSON.stringify({ sourceId: 'bank-b' }),
    });

    const res = await request(app).post('/api/detect-transfers');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.transfersDetected).toBe(1);
    expect(res.body.totalTransactions).toBe(2);

    // Verify transactions are marked in DB
    const result = await pool.query(
      'SELECT transfer_info FROM transactions WHERE transfer_info IS NOT NULL'
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].transfer_info.isTransfer).toBe(true);
  });

  it('returns 404 when no transactions exist', async () => {
    const res = await request(app).post('/api/detect-transfers');
    expect(res.status).toBe(404);
  });

  it('does not detect transfers for same source same user', async () => {
    await insertTransaction(pool, {
      date: '2024-06-15',
      type: 'expense',
      amount: 500,
      user_id: 'user-1',
      metadata: JSON.stringify({ sourceId: 'bank-a' }),
    });
    await insertTransaction(pool, {
      date: '2024-06-15',
      type: 'income',
      amount: 500,
      user_id: 'user-1',
      metadata: JSON.stringify({ sourceId: 'bank-a' }),
    });

    const res = await request(app).post('/api/detect-transfers');
    expect(res.body.transfersDetected).toBe(0);
  });

  it('detects transfers between same source different users', async () => {
    await insertTransaction(pool, {
      date: '2024-06-15',
      type: 'expense',
      amount: 200,
      user_id: 'user-1',
      metadata: JSON.stringify({ sourceId: 'bank-a' }),
    });
    await insertTransaction(pool, {
      date: '2024-06-15',
      type: 'income',
      amount: 200,
      user_id: 'user-2',
      metadata: JSON.stringify({ sourceId: 'bank-a' }),
    });

    const res = await request(app).post('/api/detect-transfers');
    expect(res.body.transfersDetected).toBe(1);
  });
});

describe('POST /api/transfer-override', () => {
  it('overrides transfer exclusion to include in calculations', async () => {
    const txn = await insertTransaction(pool, {
      transfer_info: JSON.stringify({
        isTransfer: true,
        transferId: 'tf-1',
        transferType: 'self',
        excludedFromCalculations: true,
      }),
    });

    const res = await request(app).post('/api/transfer-override').send({
      transactionId: txn.id,
      includeInCalculations: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify DB
    const result = await pool.query('SELECT transfer_info FROM transactions WHERE id = $1', [
      txn.id,
    ]);
    expect(result.rows[0].transfer_info.excludedFromCalculations).toBe(false);
    expect(result.rows[0].transfer_info.userOverride).toBe(true);
  });

  it('overrides transfer exclusion to exclude from calculations', async () => {
    const txn = await insertTransaction(pool, {
      transfer_info: JSON.stringify({
        isTransfer: true,
        transferId: 'tf-1',
        transferType: 'self',
        excludedFromCalculations: false,
        userOverride: true,
      }),
    });

    const res = await request(app).post('/api/transfer-override').send({
      transactionId: txn.id,
      includeInCalculations: false,
    });

    expect(res.status).toBe(200);
    const result = await pool.query('SELECT transfer_info FROM transactions WHERE id = $1', [
      txn.id,
    ]);
    expect(result.rows[0].transfer_info.excludedFromCalculations).toBe(true);
  });

  it('updates paired transaction as well', async () => {
    const transferId = uniqueId('tf');
    const txn1 = await insertTransaction(pool, {
      transfer_info: JSON.stringify({
        isTransfer: true,
        transferId,
        transferType: 'self',
        excludedFromCalculations: true,
      }),
    });
    const txn2 = await insertTransaction(pool, {
      transfer_info: JSON.stringify({
        isTransfer: true,
        transferId,
        transferType: 'self',
        excludedFromCalculations: true,
      }),
    });

    await request(app).post('/api/transfer-override').send({
      transactionId: txn1.id,
      includeInCalculations: true,
    });

    const result = await pool.query('SELECT transfer_info FROM transactions WHERE id = $1', [
      txn2.id,
    ]);
    expect(result.rows[0].transfer_info.excludedFromCalculations).toBe(false);
    expect(result.rows[0].transfer_info.userOverride).toBe(true);
  });

  it('returns 404 for non-existent transaction', async () => {
    const res = await request(app).post('/api/transfer-override').send({
      transactionId: 'nonexistent',
      includeInCalculations: true,
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-transfer transaction', async () => {
    const txn = await insertTransaction(pool);

    const res = await request(app).post('/api/transfer-override').send({
      transactionId: txn.id,
      includeInCalculations: true,
    });
    expect(res.status).toBe(400);
  });
});
