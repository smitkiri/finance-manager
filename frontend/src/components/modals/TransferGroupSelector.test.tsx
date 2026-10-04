import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransferGroupSelector } from './TransferGroupSelector';
import { ApiClient } from '../../utils/apiClient';
import { Expense } from '../../types';

jest.mock('../../utils/apiClient', () => ({
  ApiClient: { loadExpenses: jest.fn() },
}));

const tx = (id: string, amount: number, type: Expense['type'], date: string): Expense => ({
  id,
  date,
  description: id,
  category: 'Transfers',
  amount,
  type,
  user: 'alice',
});

const venmos = Array.from({ length: 5 }, (_, i) =>
  tx(`Venmo ${i}`, 900, 'expense', `2024-01-0${i + 2}`)
);

const setup = async (anchor: Expense) => {
  (ApiClient.loadExpenses as jest.Mock).mockResolvedValue([anchor, ...venmos]);
  const onConfirm = jest.fn();
  render(
    <TransferGroupSelector isOpen onClose={jest.fn()} anchor={anchor} onConfirm={onConfirm} />
  );
  await screen.findByText('Venmo 0');
  const selectAll = () => venmos.forEach((v) => fireEvent.click(screen.getByText(v.description)));
  return { onConfirm, selectAll };
};

describe('TransferGroupSelector', () => {
  test('disables linking until something is selected', async () => {
    await setup(tx('Paycheck', 5000, 'income', '2024-01-01'));
    expect(screen.getByRole('button', { name: /Link/ })).toBeDisabled();
  });

  test('previews the remainder staying on the anchor', async () => {
    const { onConfirm, selectAll } = await setup(tx('Paycheck', 5000, 'income', '2024-01-01'));
    selectAll();
    expect(screen.getByText('+$500.00 stays counted on this transaction')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Link 5 transactions' }));
    expect(onConfirm).toHaveBeenCalledWith(venmos.map((v) => v.id));
  });

  test('previews the remainder on the oldest member', async () => {
    const { selectAll } = await setup(tx('Paycheck', 4000, 'income', '2024-01-01'));
    selectAll();
    expect(screen.getByText('-$500.00 stays counted on "Venmo 0"')).toBeInTheDocument();
  });

  test('previews a full offset', async () => {
    const { selectAll } = await setup(tx('Paycheck', 4500, 'income', '2024-01-01'));
    selectAll();
    expect(screen.getByText('Fully offset')).toBeInTheDocument();
  });
});
