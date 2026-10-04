import React from 'react';
import { render, screen } from '@testing-library/react';
import { CountedAmount } from './CountedAmount';
import { Expense } from '../../types';

const base: Expense = {
  id: 'v0',
  date: '2024-01-02',
  description: 'Venmo',
  category: 'Transfers',
  amount: 900,
  type: 'expense',
  user: 'alice',
};
const group = {
  id: 'g',
  role: 'member' as const,
  kind: 'self' as const,
  includeInCalculations: false,
};

describe('CountedAmount', () => {
  test('renders a plain amount for ungrouped transactions', () => {
    const { container } = render(<CountedAmount expense={base} />);
    expect(screen.getByText('-$900.00')).toBeInTheDocument();
    expect(container.querySelector('s')).toBeNull();
  });

  test('strikes the original and shows the counted amount when partial', () => {
    render(<CountedAmount expense={{ ...base, effectiveAmount: 500, transferGroup: group }} />);
    expect(screen.getByText('-$500.00')).toBeInTheDocument();
    const original = screen.getByText('-$900.00');
    expect(original.tagName).toBe('S');
    expect(screen.getByLabelText('Counted $500.00 of $900.00')).toBeInTheDocument();
  });

  test('strikes the original only when fully offset', () => {
    render(<CountedAmount expense={{ ...base, effectiveAmount: 0, transferGroup: group }} />);
    expect(screen.getByText('-$900.00').tagName).toBe('S');
    expect(screen.queryByText('-$0.00')).toBeNull();
    expect(screen.getByLabelText('Not counted: -$900.00 is offset')).toBeInTheDocument();
  });

  test('counts user transfers in full when one user is selected', () => {
    const { container } = render(
      <CountedAmount
        expense={{ ...base, effectiveAmount: 0, transferGroup: { ...group, kind: 'user' } }}
        selectedUserId="alice"
      />
    );
    expect(container.querySelector('s')).toBeNull();
  });
});
