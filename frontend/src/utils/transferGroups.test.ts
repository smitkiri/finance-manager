import { Expense } from '../types';
import { allocate, countedAmount, countedExpenses, countState } from './transferGroups';

const tx = (id: string, amount: number, type: Expense['type'], extra: Partial<Expense> = {}) =>
  ({
    id,
    date: '2024-01-01',
    description: id,
    category: 'Transfers',
    amount,
    type,
    user: 'alice',
    ...extra,
  }) as Expense;

const venmos = (n: number) =>
  Array.from({ length: n }, (_, i) => tx(`v${i}`, 900, 'expense', { date: `2024-01-0${i + 2}` }));

describe('allocate', () => {
  it('leaves the remainder on the anchor when it is larger', () => {
    const result = allocate(tx('pay', 5000, 'income'), venmos(5));
    expect(result.get('pay')).toBe(500);
    expect(result.get('v0')).toBe(0);
  });

  it('gives the remainder to the oldest members first', () => {
    const members = venmos(3).reverse();
    const result = allocate(tx('pay', 1200, 'income'), members);
    expect(result.get('pay')).toBe(0);
    expect([result.get('v0'), result.get('v1'), result.get('v2')]).toEqual([900, 600, 0]);
  });

  it('fully offsets equal totals', () => {
    const result = allocate(tx('pay', 4500, 'income'), venmos(5));
    expect(Array.from(result.values()).every((v) => v === 0)).toBe(true);
  });

  it('rounds to cents', () => {
    const members = [33.37, 33.37, 33.37].map((a, i) =>
      tx(`m${i}`, a, 'expense', { date: `2024-01-0${i + 2}` })
    );
    const result = allocate(tx('a', 100.1, 'income'), members);
    expect(result.get('m0')).toBe(0.01);
    expect(result.get('a')).toBe(0);
  });
});

describe('countedAmount / countState', () => {
  const group = (
    kind: 'self' | 'user',
    includeInCalculations = false
  ): Expense['transferGroup'] => ({
    id: 'tg_1',
    role: 'member',
    kind,
    includeInCalculations,
  });

  it('counts ungrouped rows in full', () => {
    const e = tx('c', 4.5, 'expense');
    expect(countedAmount(e)).toBe(4.5);
    expect(countState(e)).toBe('normal');
  });

  it('uses the effective amount for grouped rows', () => {
    const partial = tx('v0', 900, 'expense', {
      effectiveAmount: 500,
      transferGroup: group('self'),
    });
    expect(countedAmount(partial)).toBe(500);
    expect(countState(partial)).toBe('partial');

    const offset = tx('v1', 900, 'expense', { effectiveAmount: 0, transferGroup: group('self') });
    expect(countedAmount(offset)).toBe(0);
    expect(countState(offset)).toBe('offset');
  });

  it('counts groups the user included in full', () => {
    const e = tx('v0', 900, 'expense', {
      effectiveAmount: null,
      transferGroup: group('self', true),
    });
    expect(countedAmount(e)).toBe(900);
    expect(countState(e)).toBe('normal');
  });

  it('counts user-to-user groups in full when filtered to one user', () => {
    const e = tx('v0', 900, 'expense', { effectiveAmount: 0, transferGroup: group('user') });
    expect(countedAmount(e, null)).toBe(0);
    expect(countedAmount(e, 'alice')).toBe(900);
    expect(countState(e, 'alice')).toBe('normal');
  });

  it('treats manually excluded rows as offset', () => {
    const e = tx('c', 4.5, 'expense', { excludedFromCalculations: true });
    expect(countedAmount(e)).toBe(0);
    expect(countState(e)).toBe('offset');
  });
});

describe('countedExpenses', () => {
  it('replaces amounts with counted amounts and drops zeros', () => {
    const rows = [
      tx('pay', 5000, 'income', {
        effectiveAmount: 500,
        transferGroup: { id: 'g', role: 'anchor', kind: 'self', includeInCalculations: false },
      }),
      tx('v0', 900, 'expense', {
        effectiveAmount: 0,
        transferGroup: { id: 'g', role: 'member', kind: 'self', includeInCalculations: false },
      }),
      tx('c', 4.5, 'expense'),
    ];
    expect(countedExpenses(rows, null).map((e) => [e.id, e.amount])).toEqual([
      ['pay', 500],
      ['c', 4.5],
    ]);
  });
});
