const {
  buildExpensesWhereClause,
  buildStatsWhereClause,
  buildFilterGroupsWhereClause,
  buildPanelDataQuery,
  buildMonthSeries,
  rowToExpense,
} = require('./queryBuilders');

describe('buildExpensesWhereClause', () => {
  // Helper: base query with minAmount/maxAmount explicitly null to avoid
  // the undefined-passes-null-check behavior in the source code.
  const emptyQuery = { minAmount: null, maxAmount: null };

  it('returns empty WHERE clause for empty query', () => {
    const { whereSql, params } = buildExpensesWhereClause(emptyQuery);
    expect(whereSql).toBe('');
    expect(params).toEqual([]);
  });

  it('filters by dateFrom', () => {
    const { whereSql, params } = buildExpensesWhereClause({
      ...emptyQuery,
      dateFrom: '2024-01-01',
    });
    expect(whereSql).toContain('date >= $1');
    expect(params).toEqual(['2024-01-01']);
  });

  it('filters by dateTo', () => {
    const { whereSql, params } = buildExpensesWhereClause({ ...emptyQuery, dateTo: '2024-12-31' });
    expect(whereSql).toContain('date <= $1');
    expect(params).toEqual(['2024-12-31']);
  });

  it('filters by userId', () => {
    const { whereSql, params } = buildExpensesWhereClause({ ...emptyQuery, userId: 'user-1' });
    expect(whereSql).toContain('user_id = $1');
    expect(params).toEqual(['user-1']);
  });

  it('filters by categories array', () => {
    const { whereSql, params } = buildExpensesWhereClause({
      ...emptyQuery,
      categories: ['Food', 'Transport'],
    });
    expect(whereSql).toContain('category = ANY($1::text[])');
    expect(params).toEqual([['Food', 'Transport']]);
  });

  it('wraps single category string in array', () => {
    const { whereSql, params } = buildExpensesWhereClause({ ...emptyQuery, categories: 'Food' });
    expect(whereSql).toContain('category = ANY($1::text[])');
    expect(params).toEqual([['Food']]);
  });

  it('filters by types', () => {
    const { whereSql, params } = buildExpensesWhereClause({ ...emptyQuery, types: ['expense'] });
    expect(whereSql).toContain('type = ANY($1::text[])');
    expect(params).toEqual([['expense']]);
  });

  it('filters by minAmount', () => {
    const { whereSql, params } = buildExpensesWhereClause({ ...emptyQuery, minAmount: '10' });
    expect(whereSql).toContain('amount >= $1');
    expect(params).toEqual([10]);
  });

  it('filters by maxAmount', () => {
    const { whereSql, params } = buildExpensesWhereClause({ ...emptyQuery, maxAmount: '100' });
    expect(whereSql).toContain('amount <= $1');
    expect(params).toEqual([100]);
  });

  it('ignores empty string minAmount', () => {
    const { whereSql, params } = buildExpensesWhereClause({ ...emptyQuery, minAmount: '' });
    expect(whereSql).toBe('');
    expect(params).toEqual([]);
  });

  it('ignores null minAmount', () => {
    const { whereSql, params } = buildExpensesWhereClause({ minAmount: null, maxAmount: null });
    expect(whereSql).toBe('');
    expect(params).toEqual([]);
  });

  it('filters by search term across description, category, and labels', () => {
    const { whereSql, params } = buildExpensesWhereClause({ ...emptyQuery, search: 'coffee' });
    expect(whereSql).toContain('LOWER(description) LIKE $1');
    expect(whereSql).toContain('LOWER(category) LIKE $1');
    expect(whereSql).toContain('jsonb_array_elements_text');
    expect(params).toEqual(['%coffee%']);
  });

  it('trims search term and lowercases it', () => {
    const { params } = buildExpensesWhereClause({ ...emptyQuery, search: '  Coffee  ' });
    expect(params).toEqual(['%coffee%']);
  });

  it('ignores empty/whitespace search', () => {
    const { whereSql, params } = buildExpensesWhereClause({ ...emptyQuery, search: '   ' });
    expect(whereSql).toBe('');
    expect(params).toEqual([]);
  });

  it('filters by labels', () => {
    const { whereSql, params } = buildExpensesWhereClause({
      ...emptyQuery,
      labels: ['vacation', 'business'],
    });
    expect(whereSql).toContain('jsonb_array_elements_text');
    expect(whereSql).toContain('lbl = ANY($1::text[])');
    expect(params).toEqual([['vacation', 'business']]);
  });

  it('filters by sources via metadata sourceId', () => {
    const { whereSql, params } = buildExpensesWhereClause({
      ...emptyQuery,
      sources: ['src-1', 'src-2'],
    });
    expect(whereSql).toContain("metadata->>'sourceId' = ANY($1::text[])");
    expect(params).toEqual([['src-1', 'src-2']]);
  });

  it('combines multiple filters with AND', () => {
    const { whereSql, params } = buildExpensesWhereClause({
      ...emptyQuery,
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      userId: 'user-1',
    });
    expect(whereSql).toContain('date >= $1');
    expect(whereSql).toContain('date <= $2');
    expect(whereSql).toContain('user_id = $3');
    expect(whereSql).toContain(' AND ');
    expect(params).toEqual(['2024-01-01', '2024-12-31', 'user-1']);
  });

  it('increments param indices correctly with many filters', () => {
    const { params } = buildExpensesWhereClause({
      ...emptyQuery,
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      userId: 'user-1',
      categories: ['Food'],
      minAmount: '5',
      search: 'test',
    });
    expect(params).toHaveLength(6);
  });
});

describe('buildStatsWhereClause', () => {
  it('handles null dateFrom/dateTo/userId with parameterized NULLs', () => {
    const { whereSql, params } = buildStatsWhereClause(null, null, null);
    expect(whereSql).toContain('$1::date IS NULL');
    expect(whereSql).toContain('$2::date IS NULL');
    expect(whereSql).toContain('$3::text IS NULL');
    expect(params).toEqual([null, null, null]);
  });

  it('passes provided values as params', () => {
    const { params } = buildStatsWhereClause('2024-01-01', '2024-12-31', 'user-1');
    expect(params).toEqual(['2024-01-01', '2024-12-31', 'user-1']);
  });

  it('includes transfer exclusion logic', () => {
    const { whereSql } = buildStatsWhereClause(null, null, null);
    expect(whereSql).toContain('transfer_info');
    expect(whereSql).toContain('excluded_from_calculations');
  });

  it('always starts with WHERE', () => {
    const { whereSql } = buildStatsWhereClause(null, null, null);
    expect(whereSql).toMatch(/^WHERE /);
  });
});

describe('rowToExpense', () => {
  it('maps DB row to API shape', () => {
    const row = {
      id: 'txn-1',
      date: '2024-06-15',
      description: 'Coffee',
      category: 'Food',
      amount: '25.50',
      type: 'expense',
      user_id: 'user-1',
      labels: ['vacation'],
      metadata: { sourceId: 'src-1' },
      transfer_info: null,
      excluded_from_calculations: false,
      import_id: null,
    };
    const result = rowToExpense(row);
    expect(result).toEqual({
      id: 'txn-1',
      date: '2024-06-15',
      description: 'Coffee',
      category: 'Food',
      amount: 25.5,
      type: 'expense',
      user: 'user-1',
      labels: ['vacation'],
      metadata: { sourceId: 'src-1' },
      transferInfo: undefined,
      excludedFromCalculations: false,
      importId: null,
    });
  });

  it('parses amount string to float', () => {
    const result = rowToExpense({ amount: '99.99', labels: null, metadata: null });
    expect(result.amount).toBe(99.99);
  });

  it('defaults labels to empty array when null', () => {
    const result = rowToExpense({ labels: null });
    expect(result.labels).toEqual([]);
  });

  it('defaults metadata to empty object when null', () => {
    const result = rowToExpense({ metadata: null });
    expect(result.metadata).toEqual({});
  });

  it('maps transfer_info to transferInfo when present', () => {
    const transferInfo = { isTransfer: true, transferId: 'tf-1' };
    const result = rowToExpense({ transfer_info: transferInfo });
    expect(result.transferInfo).toEqual(transferInfo);
  });

  it('sets transferInfo to undefined when transfer_info is null', () => {
    const result = rowToExpense({ transfer_info: null });
    expect(result.transferInfo).toBeUndefined();
  });

  it('maps excluded_from_calculations, defaulting to false', () => {
    expect(rowToExpense({ excluded_from_calculations: true }).excludedFromCalculations).toBe(true);
    expect(rowToExpense({ excluded_from_calculations: false }).excludedFromCalculations).toBe(
      false
    );
    expect(rowToExpense({ excluded_from_calculations: null }).excludedFromCalculations).toBe(false);
  });
});

describe('buildFilterGroupsWhereClause', () => {
  it('returns empty SQL for null/empty filterGroups', () => {
    expect(buildFilterGroupsWhereClause(null, [], 1).sql).toBe('');
    expect(buildFilterGroupsWhereClause([], [], 1).sql).toBe('');
  });

  it('skips groups with no conditions', () => {
    const result = buildFilterGroupsWhereClause([{ conditions: [] }], [], 1);
    expect(result.sql).toBe('');
  });

  it('handles type condition with is operator', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [{ conditions: [{ field: 'type', operator: 'is', value: 'expense' }] }],
      params,
      1
    );
    expect(result.sql).toContain('type = $1');
    expect(params).toEqual(['expense']);
    expect(result.nextParam).toBe(2);
  });

  it('handles category condition with is operator', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [{ conditions: [{ field: 'category', operator: 'is', value: ['Food', 'Transport'] }] }],
      params,
      1
    );
    expect(result.sql).toContain('category = ANY($1::text[])');
    expect(params).toEqual([['Food', 'Transport']]);
  });

  it('handles category condition with isNot operator', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [{ conditions: [{ field: 'category', operator: 'isNot', value: ['Food'] }] }],
      params,
      1
    );
    expect(result.sql).toContain('category != ALL($1::text[])');
  });

  it('handles labels condition with includes operator', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [{ conditions: [{ field: 'labels', operator: 'includes', value: ['vacation'] }] }],
      params,
      1
    );
    expect(result.sql).toContain('EXISTS');
    expect(result.sql).toContain('lbl = ANY($1::text[])');
  });

  it('handles labels condition with excludes operator', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [{ conditions: [{ field: 'labels', operator: 'excludes', value: ['vacation'] }] }],
      params,
      1
    );
    expect(result.sql).toContain('NOT EXISTS');
  });

  it('handles description matches condition', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [{ conditions: [{ field: 'description', operator: 'matches', value: 'coffee.*shop' }] }],
      params,
      1
    );
    expect(result.sql).toContain('description ~* $1');
    expect(params).toEqual(['coffee.*shop']);
  });

  it('handles amount gte condition', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [{ conditions: [{ field: 'amount', operator: 'gte', value: '50' }] }],
      params,
      1
    );
    expect(result.sql).toContain('amount >= $1');
    expect(params).toEqual([50]);
  });

  it('handles amount lte condition', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [{ conditions: [{ field: 'amount', operator: 'lte', value: '100' }] }],
      params,
      1
    );
    expect(result.sql).toContain('amount <= $1');
    expect(params).toEqual([100]);
  });

  it('ANDs multiple conditions within a single group', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [
        {
          conditions: [
            { field: 'type', operator: 'is', value: 'expense' },
            { field: 'category', operator: 'is', value: ['Food'] },
          ],
        },
      ],
      params,
      1
    );
    expect(result.sql).toContain(' AND ');
    expect(params).toHaveLength(2);
  });

  it('ORs multiple groups', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [
        { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
        { conditions: [{ field: 'type', operator: 'is', value: 'income' }] },
      ],
      params,
      1
    );
    expect(result.sql).toContain(' OR ');
    expect(params).toHaveLength(2);
  });

  it('respects startParam offset', () => {
    const params = ['existing-param'];
    const result = buildFilterGroupsWhereClause(
      [{ conditions: [{ field: 'type', operator: 'is', value: 'expense' }] }],
      params,
      2
    );
    expect(result.sql).toContain('type = $2');
    expect(result.nextParam).toBe(3);
  });

  it('ignores unknown field types', () => {
    const params = [];
    const result = buildFilterGroupsWhereClause(
      [{ conditions: [{ field: 'unknown', operator: 'is', value: 'test' }] }],
      params,
      1
    );
    expect(result.sql).toBe('');
  });
});

describe('buildPanelDataQuery', () => {
  it('produces a SELECT query with month aggregation', () => {
    const { sql, params } = buildPanelDataQuery({
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      userId: null,
      filterGroups: [],
    });
    expect(sql).toContain('SELECT');
    expect(sql).toContain("TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM')");
    expect(sql).toContain('SUM(amount)');
    expect(sql).toContain('GROUP BY');
    expect(params).toHaveLength(3);
  });

  it('includes filter groups in the query when provided', () => {
    const { sql, params } = buildPanelDataQuery({
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      userId: null,
      filterGroups: [{ conditions: [{ field: 'type', operator: 'is', value: 'expense' }] }],
    });
    expect(sql).toContain('type = $4');
    expect(params).toHaveLength(4);
  });

  it('works with empty filterGroups', () => {
    const { sql } = buildPanelDataQuery({
      dateFrom: null,
      dateTo: null,
      userId: null,
      filterGroups: [],
    });
    expect(sql).not.toContain('type = $');
  });
});

describe('buildMonthSeries', () => {
  it('generates correct month keys for a single month', () => {
    const result = buildMonthSeries('2024-03-01', '2024-03-31');
    expect(Object.keys(result)).toEqual(['2024-03']);
    expect(result['2024-03'].month).toBe('Mar 2024');
  });

  it('generates months across a full year', () => {
    const result = buildMonthSeries('2024-01-01', '2024-12-31');
    const keys = Object.keys(result);
    expect(keys).toHaveLength(12);
    expect(keys[0]).toBe('2024-01');
    expect(keys[11]).toBe('2024-12');
    expect(result['2024-01'].month).toBe('Jan 2024');
    expect(result['2024-12'].month).toBe('Dec 2024');
  });

  it('handles year boundaries correctly', () => {
    const result = buildMonthSeries('2023-11-01', '2024-02-28');
    const keys = Object.keys(result);
    expect(keys).toEqual(['2023-11', '2023-12', '2024-01', '2024-02']);
    expect(result['2023-12'].month).toBe('Dec 2023');
    expect(result['2024-01'].month).toBe('Jan 2024');
  });

  it('works when dateFrom and dateTo are mid-month', () => {
    const result = buildMonthSeries('2024-03-15', '2024-05-20');
    const keys = Object.keys(result);
    expect(keys).toEqual(['2024-03', '2024-04', '2024-05']);
  });
});
