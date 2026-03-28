const {
  isTransferPair,
  calculateTransferConfidence,
  detectTransfers,
} = require('./transferDetection');

const makeTransaction = (overrides = {}) => ({
  id: `txn-${Math.random().toString(36).substr(2, 6)}`,
  date: '2024-06-15',
  description: 'Test transaction',
  category: 'Food',
  amount: 100,
  type: 'expense',
  user: 'user-1',
  metadata: { sourceId: 'src-1' },
  ...overrides,
});

describe('isTransferPair', () => {
  it('returns true for matching pair from different sources', () => {
    const t1 = makeTransaction({ type: 'expense', metadata: { sourceId: 'src-1' } });
    const t2 = makeTransaction({ type: 'income', metadata: { sourceId: 'src-2' } });
    expect(isTransferPair(t1, t2)).toBe(true);
  });

  it('returns false when same source and same user', () => {
    const t1 = makeTransaction({
      type: 'expense',
      metadata: { sourceId: 'src-1' },
      user: 'user-1',
    });
    const t2 = makeTransaction({ type: 'income', metadata: { sourceId: 'src-1' }, user: 'user-1' });
    expect(isTransferPair(t1, t2)).toBe(false);
  });

  it('returns true for same source but different users', () => {
    const t1 = makeTransaction({
      type: 'expense',
      metadata: { sourceId: 'src-1' },
      user: 'user-1',
    });
    const t2 = makeTransaction({ type: 'income', metadata: { sourceId: 'src-1' }, user: 'user-2' });
    expect(isTransferPair(t1, t2)).toBe(true);
  });

  it('returns false when same type', () => {
    const t1 = makeTransaction({ type: 'expense', metadata: { sourceId: 'src-1' } });
    const t2 = makeTransaction({ type: 'expense', metadata: { sourceId: 'src-2' } });
    expect(isTransferPair(t1, t2)).toBe(false);
  });

  it('returns false when different amounts', () => {
    const t1 = makeTransaction({ amount: 100, type: 'expense', metadata: { sourceId: 'src-1' } });
    const t2 = makeTransaction({ amount: 200, type: 'income', metadata: { sourceId: 'src-2' } });
    expect(isTransferPair(t1, t2)).toBe(false);
  });

  it('returns false when more than 4 days apart', () => {
    const t1 = makeTransaction({
      date: '2024-06-01',
      type: 'expense',
      metadata: { sourceId: 'src-1' },
    });
    const t2 = makeTransaction({
      date: '2024-06-10',
      type: 'income',
      metadata: { sourceId: 'src-2' },
    });
    expect(isTransferPair(t1, t2)).toBe(false);
  });

  it('returns true when exactly 4 days apart', () => {
    const t1 = makeTransaction({
      date: '2024-06-01',
      type: 'expense',
      metadata: { sourceId: 'src-1' },
    });
    const t2 = makeTransaction({
      date: '2024-06-05',
      type: 'income',
      metadata: { sourceId: 'src-2' },
    });
    expect(isTransferPair(t1, t2)).toBe(true);
  });

  it('treats missing sourceId as manual', () => {
    const t1 = makeTransaction({ type: 'expense', metadata: {} });
    const t2 = makeTransaction({ type: 'income', metadata: {} });
    // Both are "manual" + same user → should be false
    expect(isTransferPair(t1, t2)).toBe(false);
  });
});

describe('calculateTransferConfidence', () => {
  it('returns high confidence for same day, same amount', () => {
    const t1 = makeTransaction({
      date: '2024-06-15',
      amount: 100,
      type: 'expense',
      description: 'transfer out',
    });
    const t2 = makeTransaction({
      date: '2024-06-15',
      amount: 100,
      type: 'income',
      description: 'transfer in',
    });
    const confidence = calculateTransferConfidence(t1, t2);
    // base 0.5 + amount match 0.4 + same day 0.2 + "transfer" 0.1 = 1.0 (capped)
    expect(confidence).toBeCloseTo(1.0, 1);
  });

  it('returns 0 for different amounts', () => {
    const t1 = makeTransaction({ amount: 100 });
    const t2 = makeTransaction({ amount: 200 });
    expect(calculateTransferConfidence(t1, t2)).toBe(0);
  });

  it('gives slightly lower confidence for 1-day gap', () => {
    const t1 = makeTransaction({
      date: '2024-06-15',
      amount: 100,
      type: 'expense',
      description: 'test',
    });
    const t2 = makeTransaction({
      date: '2024-06-16',
      amount: 100,
      type: 'income',
      description: 'test',
    });
    const confidence = calculateTransferConfidence(t1, t2);
    // base 0.5 + amount 0.4 + 1-day 0.15 = 1.0 (capped)
    expect(confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('gives bonus for "transfer" in description', () => {
    const t1 = makeTransaction({ date: '2024-06-15', amount: 100, description: 'Bank transfer' });
    const t2 = makeTransaction({ date: '2024-06-18', amount: 100, description: 'Payment' });
    const withTransfer = calculateTransferConfidence(t1, t2);

    const t3 = makeTransaction({ date: '2024-06-15', amount: 100, description: 'Payment sent' });
    const t4 = makeTransaction({
      date: '2024-06-18',
      amount: 100,
      description: 'Payment received',
    });
    const withoutTransfer = calculateTransferConfidence(t3, t4);

    expect(withTransfer).toBeGreaterThan(withoutTransfer);
  });

  it('gives bonus for "move" in description', () => {
    const t1 = makeTransaction({ date: '2024-06-15', amount: 100, description: 'Move funds' });
    const t2 = makeTransaction({ date: '2024-06-15', amount: 100, description: 'Deposit' });
    const confidence = calculateTransferConfidence(t1, t2);
    // base 0.5 + amount 0.4 + same day 0.2 + move 0.05 = 1.0 (capped)
    expect(confidence).toBeGreaterThanOrEqual(0.95);
  });

  it('caps confidence at 1.0', () => {
    const t1 = makeTransaction({ date: '2024-06-15', amount: 100, description: 'transfer move' });
    const t2 = makeTransaction({ date: '2024-06-15', amount: 100, description: 'transfer move' });
    expect(calculateTransferConfidence(t1, t2)).toBeLessThanOrEqual(1.0);
  });
});

describe('detectTransfers', () => {
  it('detects transfer pair from different sources', () => {
    const t1 = makeTransaction({
      id: 'a',
      type: 'expense',
      amount: 50,
      metadata: { sourceId: 'src-1' },
    });
    const t2 = makeTransaction({
      id: 'b',
      type: 'income',
      amount: 50,
      metadata: { sourceId: 'src-2' },
    });
    const { transfers } = detectTransfers([t1, t2]);
    expect(transfers).toHaveLength(1);
    expect(transfers[0].credit.id).toBe('b');
    expect(transfers[0].debit.id).toBe('a');
  });

  it('detects transfer pair from same source, different users', () => {
    const t1 = makeTransaction({
      id: 'a',
      type: 'expense',
      amount: 75,
      user: 'user-1',
      metadata: { sourceId: 'src-1' },
    });
    const t2 = makeTransaction({
      id: 'b',
      type: 'income',
      amount: 75,
      user: 'user-2',
      metadata: { sourceId: 'src-1' },
    });
    const { transfers } = detectTransfers([t1, t2]);
    expect(transfers).toHaveLength(1);
  });

  it('returns empty results when no matches', () => {
    const t1 = makeTransaction({
      id: 'a',
      type: 'expense',
      amount: 50,
      metadata: { sourceId: 'src-1' },
    });
    const t2 = makeTransaction({
      id: 'b',
      type: 'expense',
      amount: 50,
      metadata: { sourceId: 'src-2' },
    });
    const { transfers } = detectTransfers([t1, t2]);
    expect(transfers).toHaveLength(0);
  });

  it('does not duplicate already-processed transactions', () => {
    const t1 = makeTransaction({
      id: 'a',
      type: 'expense',
      amount: 50,
      metadata: { sourceId: 'src-1' },
    });
    const t2 = makeTransaction({
      id: 'b',
      type: 'income',
      amount: 50,
      metadata: { sourceId: 'src-2' },
    });
    const t3 = makeTransaction({
      id: 'c',
      type: 'income',
      amount: 50,
      metadata: { sourceId: 'src-3' },
    });
    const { transfers } = detectTransfers([t1, t2, t3]);
    // t1 matched with t2, so t3 should not match with t1
    expect(transfers).toHaveLength(1);
  });

  it('updates transactions with correct transferInfo', () => {
    const t1 = makeTransaction({
      id: 'a',
      type: 'expense',
      amount: 50,
      user: 'user-1',
      metadata: { sourceId: 'src-1' },
    });
    const t2 = makeTransaction({
      id: 'b',
      type: 'income',
      amount: 50,
      user: 'user-1',
      metadata: { sourceId: 'src-2' },
    });
    const { updatedTransactions } = detectTransfers([t1, t2]);

    const updated1 = updatedTransactions.find((t) => t.id === 'a');
    const updated2 = updatedTransactions.find((t) => t.id === 'b');
    expect(updated1.transferInfo.isTransfer).toBe(true);
    expect(updated2.transferInfo.isTransfer).toBe(true);
    expect(updated1.transferInfo.transferType).toBe('self');
    expect(updated1.transferInfo.transferId).toBe(updated2.transferInfo.transferId);
  });

  it('sets transferType to user for different users', () => {
    const t1 = makeTransaction({
      id: 'a',
      type: 'expense',
      amount: 50,
      user: 'user-1',
      metadata: { sourceId: 'src-1' },
    });
    const t2 = makeTransaction({
      id: 'b',
      type: 'income',
      amount: 50,
      user: 'user-2',
      metadata: { sourceId: 'src-2' },
    });
    const { updatedTransactions } = detectTransfers([t1, t2]);
    const updated1 = updatedTransactions.find((t) => t.id === 'a');
    expect(updated1.transferInfo.transferType).toBe('user');
  });

  it('handles empty transaction list', () => {
    const { transfers, updatedTransactions } = detectTransfers([]);
    expect(transfers).toHaveLength(0);
    expect(updatedTransactions).toHaveLength(0);
  });

  it('handles single transaction', () => {
    const t1 = makeTransaction({ id: 'a' });
    const { transfers } = detectTransfers([t1]);
    expect(transfers).toHaveLength(0);
  });
});
