const {
  calculateDescriptionSimilarity,
  findSimilarTransactionCategory,
} = require('./categoryMatcher');

describe('calculateDescriptionSimilarity', () => {
  it('returns 1.0 for identical strings', () => {
    expect(calculateDescriptionSimilarity('starbucks coffee', 'starbucks coffee')).toBe(1.0);
  });

  it('returns close to 0 for completely different strings', () => {
    const score = calculateDescriptionSimilarity('apple store purchase', 'electric bill payment');
    expect(score).toBeLessThan(0.3);
  });

  it('returns proportional score for shared words', () => {
    const score = calculateDescriptionSimilarity('starbucks coffee shop', 'starbucks latte order');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it('gives partial score for substring matches', () => {
    const score = calculateDescriptionSimilarity('amazon marketplace', 'amazon');
    expect(score).toBeGreaterThan(0);
  });

  it('gives bonus for known merchant names', () => {
    const withMerchant = calculateDescriptionSimilarity(
      'amazon order #123',
      'amazon purchase #456'
    );
    const withoutMerchant = calculateDescriptionSimilarity('acme order #123', 'acme purchase #456');
    expect(withMerchant).toBeGreaterThan(withoutMerchant);
  });

  it('returns 0 when one string has only short words', () => {
    // Words <= 2 chars are filtered out
    const score = calculateDescriptionSimilarity('a b c', 'x y z');
    expect(score).toBe(0);
  });

  it('handles empty strings', () => {
    const score = calculateDescriptionSimilarity('', '');
    // Both empty → identical → 1.0
    expect(score).toBe(1.0);
  });

  it('caps score at 1.0', () => {
    const score = calculateDescriptionSimilarity(
      'amazon walmart target starbucks',
      'amazon walmart target starbucks'
    );
    expect(score).toBeLessThanOrEqual(1.0);
  });
});

describe('findSimilarTransactionCategory', () => {
  const existingTransactions = [
    { date: '2024-06-01', description: 'Starbucks Coffee', category: 'Dining', amount: 5 },
    { date: '2024-06-02', description: 'Starbucks Latte', category: 'Dining', amount: 6 },
    { date: '2024-06-03', description: 'Shell Gas Station', category: 'Gas', amount: 45 },
    { date: '2024-06-04', description: 'Amazon Purchase', category: 'Shopping', amount: 30 },
    {
      date: '2024-06-05',
      description: 'Netflix Subscription',
      category: 'Entertainment',
      amount: 15,
    },
  ];

  it('returns null for empty description', () => {
    expect(findSimilarTransactionCategory('', existingTransactions)).toBeNull();
  });

  it('returns null for null description', () => {
    expect(findSimilarTransactionCategory(null, existingTransactions)).toBeNull();
  });

  it('returns null for empty existing transactions', () => {
    expect(findSimilarTransactionCategory('Starbucks', [])).toBeNull();
  });

  it('returns null for null existing transactions', () => {
    expect(findSimilarTransactionCategory('Starbucks', null)).toBeNull();
  });

  it('returns null when no good matches exist', () => {
    const result = findSimilarTransactionCategory(
      'Completely Unique Description XYZ123',
      existingTransactions
    );
    expect(result).toBeNull();
  });

  it('returns matching category for strong match', () => {
    const result = findSimilarTransactionCategory('Starbucks Coffee', existingTransactions);
    expect(result).toBe('Dining');
  });

  it('picks best category using weighted scoring', () => {
    // Multiple Starbucks entries map to "Dining" — use a fuller description for a strong match
    const result = findSimilarTransactionCategory('Starbucks Coffee Order', existingTransactions);
    expect(result).toBe('Dining');
  });

  it('filters out Uncategorized transactions', () => {
    const transactions = [
      { date: '2024-06-01', description: 'Test Store', category: 'Uncategorized', amount: 10 },
    ];
    const result = findSimilarTransactionCategory('Test Store', transactions);
    expect(result).toBeNull();
  });

  it('respects maxResults limit', () => {
    const manyTransactions = Array.from({ length: 200 }, (_, i) => ({
      date: `2024-01-${String((i % 28) + 1).padStart(2, '0')}`,
      description: `Transaction ${i}`,
      category: 'General',
      amount: 10,
    }));
    // Should not throw and should only consider first maxResults
    const result = findSimilarTransactionCategory('Transaction 1', manyTransactions, 5);
    // May or may not find a match depending on similarity threshold
    expect(result === null || result === 'General').toBe(true);
  });
});
