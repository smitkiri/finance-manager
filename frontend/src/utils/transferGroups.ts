import { Expense } from '../types';

/**
 * Transfer/refund group helpers. Counted amounts come from the API
 * (`effectiveAmount`); only `allocate` re-derives them, for the live preview
 * in the group selector before anything is saved.
 */

export type CountState = 'normal' | 'partial' | 'offset';

const toCents = (amount: number) => Math.round(Math.abs(amount) * 100);

/**
 * Mirror of the backend allocation: the anchor keeps whatever the members
 * don't cancel; otherwise the remainder stays on members oldest-first.
 */
export function allocate(anchor: Expense, members: Expense[]): Map<string, number> {
  const result = new Map<string, number>([[anchor.id, 0]]);
  members.forEach((m) => result.set(m.id, 0));

  const anchorCents = toCents(anchor.amount);
  const memberCents = members.reduce((sum, m) => sum + toCents(m.amount), 0);
  if (anchorCents >= memberCents) {
    result.set(anchor.id, (anchorCents - memberCents) / 100);
    return result;
  }

  let remaining = memberCents - anchorCents;
  const ordered = [...members].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
  );
  for (const member of ordered) {
    if (remaining <= 0) break;
    const keep = Math.min(toCents(member.amount), remaining);
    result.set(member.id, keep / 100);
    remaining -= keep;
  }
  return result;
}

/** The amount a transaction contributes to totals (positive; `type` carries the sign). */
export function countedAmount(e: Expense, selectedUserId: string | null = null): number {
  if (e.excludedFromCalculations) return 0;
  // Transfers between household members count in full when viewing one user.
  if (e.transferGroup?.kind === 'user' && selectedUserId) return e.amount;
  return e.effectiveAmount ?? e.amount;
}

export function countState(e: Expense, selectedUserId: string | null = null): CountState {
  const counted = countedAmount(e, selectedUserId);
  if (counted === 0) return 'offset';
  if (counted < e.amount) return 'partial';
  return 'normal';
}

/** Expenses with `amount` replaced by the counted amount; fully offset rows dropped. */
export function countedExpenses(expenses: Expense[], selectedUserId: string | null): Expense[] {
  return expenses
    .map((e) => ({ ...e, amount: countedAmount(e, selectedUserId) }))
    .filter((e) => e.amount !== 0);
}
