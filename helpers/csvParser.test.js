const { parseCSVLine, parseCSV, parseCSVWithMapping, mergeExpenses } = require('./csvParser');

describe('parseCSVLine', () => {
  it('splits simple comma-separated values', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    expect(parseCSVLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c']);
  });

  it('handles escaped quotes (double-quote inside quotes)', () => {
    expect(parseCSVLine('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  it('handles trailing comma as empty last field', () => {
    expect(parseCSVLine('a,b,')).toEqual(['a', 'b', '']);
  });

  it('handles empty fields in the middle', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('trims whitespace from fields', () => {
    expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });

  it('handles single field', () => {
    expect(parseCSVLine('hello')).toEqual(['hello']);
  });

  it('handles empty string', () => {
    expect(parseCSVLine('')).toEqual(['']);
  });
});

describe('parseCSV', () => {
  const header = 'Transaction Date,Post Date,Description,Category,Type,Amount,Memo';

  it('parses valid CSV into transaction objects', () => {
    const csv = `${header}\n2024-06-15,2024-06-16,Coffee Shop,Food,Sale,-4.50,`;
    const result = parseCSV(csv);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-06-15');
    expect(result[0].description).toBe('Coffee Shop');
    expect(result[0].category).toBe('Food');
    expect(result[0].amount).toBe(4.5);
    expect(result[0].type).toBe('expense');
  });

  it('filters out Payment type rows', () => {
    const csv = `${header}\n2024-06-15,2024-06-16,Payment,Payment,Payment,-100,`;
    const result = parseCSV(csv);
    expect(result).toHaveLength(0);
  });

  it('treats negative amounts as expense', () => {
    const csv = `${header}\n2024-06-15,2024-06-16,Purchase,Food,Sale,-25.00,`;
    const result = parseCSV(csv);
    expect(result[0].type).toBe('expense');
    expect(result[0].amount).toBe(25);
  });

  it('treats positive amounts as income', () => {
    const csv = `${header}\n2024-06-15,2024-06-16,Refund,Food,Return,25.00,`;
    const result = parseCSV(csv);
    expect(result[0].type).toBe('income');
    expect(result[0].amount).toBe(25);
  });

  it('defaults category to Uncategorized when missing', () => {
    const csv = `${header}\n2024-06-15,2024-06-16,Coffee,,Sale,-4.50,`;
    const result = parseCSV(csv);
    expect(result[0].category).toBe('Uncategorized');
  });

  it('handles missing amount gracefully', () => {
    const csv = `${header}\n2024-06-15,2024-06-16,Test,Food,Sale,,`;
    const result = parseCSV(csv);
    expect(result[0].amount).toBe(0);
  });

  it('strips dollar signs and commas from amounts', () => {
    const csv = `${header}\n2024-06-15,2024-06-16,Purchase,Food,Sale,"-1,234.56",`;
    const result = parseCSV(csv);
    expect(result[0].amount).toBe(1234.56);
  });

  it('generates unique IDs for each row', () => {
    const csv = `${header}\n2024-06-15,,,Food,Sale,-10,\n2024-06-16,,,Food,Sale,-20,`;
    const result = parseCSV(csv);
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('includes source metadata', () => {
    const csv = `${header}\n2024-06-15,2024-06-16,Test,Food,Sale,-10,`;
    const result = parseCSV(csv);
    expect(result[0].metadata.sourceName).toBe('Manual Import');
    expect(result[0].metadata.importedAt).toBeDefined();
  });
});

describe('parseCSVWithMapping', () => {
  const mapping = {
    id: 'src-1',
    name: 'Test Bank',
    flipIncomeExpense: false,
    mappings: [
      { csvColumn: 'Date', standardColumn: 'Transaction Date' },
      { csvColumn: 'Desc', standardColumn: 'Description' },
      { csvColumn: 'Cat', standardColumn: 'Category' },
      { csvColumn: 'Amt', standardColumn: 'Amount' },
    ],
  };

  it('applies column mapping correctly', () => {
    const csv = 'Date,Desc,Cat,Amt\n2024-06-15,Coffee Shop,Food,-25.00';
    const { expenses } = parseCSVWithMapping(csv, mapping, 'user-1');
    expect(expenses).toHaveLength(1);
    expect(expenses[0].date).toBe('2024-06-15');
    expect(expenses[0].description).toBe('Coffee Shop');
    expect(expenses[0].category).toBe('Food');
    expect(expenses[0].amount).toBe(25);
  });

  it('respects flipIncomeExpense flag', () => {
    const flippedMapping = { ...mapping, flipIncomeExpense: true };
    const csv = 'Date,Desc,Cat,Amt\n2024-06-15,Test,Food,-25.00';
    const { expenses } = parseCSVWithMapping(csv, flippedMapping, 'user-1');
    // negative amount + flipped → income
    expect(expenses[0].type).toBe('income');
  });

  it('without flipIncomeExpense, negative is expense', () => {
    const csv = 'Date,Desc,Cat,Amt\n2024-06-15,Test,Food,-25.00';
    const { expenses } = parseCSVWithMapping(csv, mapping, 'user-1');
    expect(expenses[0].type).toBe('expense');
  });

  it('filters out rows with missing date', () => {
    const csv = 'Date,Desc,Cat,Amt\n,Coffee Shop,Food,-25.00';
    const { expenses } = parseCSVWithMapping(csv, mapping, 'user-1');
    expect(expenses).toHaveLength(0);
  });

  it('filters out rows with missing description', () => {
    const csv = 'Date,Desc,Cat,Amt\n2024-06-15,,Food,-25.00';
    const { expenses } = parseCSVWithMapping(csv, mapping, 'user-1');
    expect(expenses).toHaveLength(0);
  });

  it('filters out rows with zero amount', () => {
    const csv = 'Date,Desc,Cat,Amt\n2024-06-15,Test,Food,0';
    const { expenses } = parseCSVWithMapping(csv, mapping, 'user-1');
    expect(expenses).toHaveLength(0);
  });

  it('sets sourceId and sourceName in metadata', () => {
    const csv = 'Date,Desc,Cat,Amt\n2024-06-15,Test,Food,-10';
    const { expenses } = parseCSVWithMapping(csv, mapping, 'user-1');
    expect(expenses[0].metadata.sourceId).toBe('src-1');
    expect(expenses[0].metadata.sourceName).toBe('Test Bank');
  });

  it('sets user from userId param', () => {
    const csv = 'Date,Desc,Cat,Amt\n2024-06-15,Test,Food,-10';
    const { expenses } = parseCSVWithMapping(csv, mapping, 'user-42');
    expect(expenses[0].user).toBe('user-42');
  });

  it('auto-categorizes via existing transactions when category is missing', () => {
    const existingTransactions = [
      { date: '2024-06-01', description: 'Starbucks Coffee', category: 'Dining', amount: 5 },
      { date: '2024-06-02', description: 'Starbucks Coffee', category: 'Dining', amount: 6 },
    ];
    const csv = 'Date,Desc,Cat,Amt\n2024-06-15,Starbucks Coffee,,-10';
    const { expenses, autoFilledCategories } = parseCSVWithMapping(
      csv,
      mapping,
      'user-1',
      existingTransactions
    );
    // Should suggest "Dining" based on similarity
    expect(expenses[0].category).toBe('Dining');
    expect(autoFilledCategories).toHaveLength(1);
    expect(autoFilledCategories[0].suggestedCategory).toBe('Dining');
  });

  it('ignores Ignore-mapped columns', () => {
    const mappingWithIgnore = {
      ...mapping,
      mappings: [...mapping.mappings, { csvColumn: 'Extra', standardColumn: 'Ignore' }],
    };
    const csv = 'Date,Desc,Cat,Amt,Extra\n2024-06-15,Test,Food,-10,ignore-me';
    const { expenses } = parseCSVWithMapping(csv, mappingWithIgnore, 'user-1');
    expect(expenses).toHaveLength(1);
  });
});

describe('mergeExpenses', () => {
  const makeExpense = (overrides = {}) => ({
    id: `txn-${Math.random().toString(36).substr(2, 6)}`,
    date: '2024-06-15',
    description: 'Test',
    category: 'Food',
    amount: 10,
    type: 'expense',
    ...overrides,
  });

  it('adds new unique expenses', () => {
    const existing = [makeExpense({ date: '2024-06-10', description: 'A', amount: 10 })];
    const newExpenses = [makeExpense({ date: '2024-06-15', description: 'B', amount: 20 })];
    const { merged, added } = mergeExpenses(existing, newExpenses);
    expect(merged).toHaveLength(2);
    expect(added).toHaveLength(1);
  });

  it('skips duplicate expenses', () => {
    const existing = [
      makeExpense({ date: '2024-06-15', description: 'Coffee', amount: 5, type: 'expense' }),
    ];
    const newExpenses = [
      makeExpense({ date: '2024-06-15', description: 'Coffee', amount: 5, type: 'expense' }),
    ];
    const { merged, added } = mergeExpenses(existing, newExpenses);
    expect(merged).toHaveLength(1);
    expect(added).toHaveLength(0);
  });

  it('sorts result by date descending', () => {
    const existing = [makeExpense({ date: '2024-06-01', description: 'A', amount: 1 })];
    const newExpenses = [
      makeExpense({ date: '2024-06-20', description: 'C', amount: 3 }),
      makeExpense({ date: '2024-06-10', description: 'B', amount: 2 }),
    ];
    const { merged } = mergeExpenses(existing, newExpenses);
    expect(merged[0].date).toBe('2024-06-20');
    expect(merged[1].date).toBe('2024-06-10');
    expect(merged[2].date).toBe('2024-06-01');
  });

  it('handles empty existing list', () => {
    const newExpenses = [makeExpense()];
    const { merged, added } = mergeExpenses([], newExpenses);
    expect(merged).toHaveLength(1);
    expect(added).toHaveLength(1);
  });

  it('handles empty new expenses list', () => {
    const existing = [makeExpense()];
    const { merged, added } = mergeExpenses(existing, []);
    expect(merged).toHaveLength(1);
    expect(added).toHaveLength(0);
  });
});
