import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { EverydaySpendingCard } from './EverydaySpendingCard';
import type { EverydayRow, EverydaySummary } from '../utils/everydaySpending';

const MONTHS = ['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'];

const row = (
  category: string,
  amounts: number[],
  typical: number,
  spikeAt?: number
): EverydayRow => ({
  category,
  typical,
  min: Math.min(...amounts),
  max: Math.max(...amounts),
  plainMean: amounts.reduce((s, a) => s + a, 0) / amounts.length,
  months: amounts.map((amount, i) => ({ month: MONTHS[i], amount, isSpike: i === spikeAt })),
});

const summary: EverydaySummary = {
  rows: [
    row('Groceries', [540, 600, 612, 690, 580, 600], 600),
    row('Food & Drink', [400, 390, 1450, 410, 360, 405], 402.5, 2),
  ],
  totalTypical: 1002.5,
  countedMonths: MONTHS,
};

const categories = ['Groceries', 'Food & Drink', 'Gas', 'Travel'];

test('shows an empty state when nothing is pinned', () => {
  render(
    <EverydaySpendingCard
      summary={{ rows: [], totalTypical: 0, countedMonths: MONTHS }}
      pinned={[]}
      categories={categories}
      onChangePinned={vi.fn()}
    />
  );
  expect(
    screen.getByText(
      'Pick the categories you spend on every month to see what a typical month costs.'
    )
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Choose categories' })).toBeInTheDocument();
});

test('renders rows with typical, range and a total', () => {
  render(
    <EverydaySpendingCard
      summary={summary}
      pinned={['Groceries', 'Food & Drink']}
      categories={categories}
      onChangePinned={vi.fn()}
    />
  );
  expect(screen.getByText('Everyday Spending')).toBeInTheDocument();
  expect(screen.getByText('Groceries')).toBeInTheDocument();
  expect(screen.getByText('$600')).toBeInTheDocument();
  expect(screen.getByText('$540 –')).toBeInTheDocument();
  expect(screen.getByText('$690')).toBeInTheDocument();
  expect(screen.getByText('Total')).toBeInTheDocument();
  expect(screen.getByText('$1,003')).toBeInTheDocument();
});

test('flags a spike and explains it on focus', () => {
  render(
    <EverydaySpendingCard
      summary={summary}
      pinned={['Groceries', 'Food & Drink']}
      categories={categories}
      onChangePinned={vi.fn()}
    />
  );
  const spike = screen.getByRole('button', { name: /\$1,450 ▲/ });
  fireEvent.focus(spike);
  expect(screen.getByText(/Jun 2026: \$1,450 — 3\.6× a typical month/)).toBeInTheDocument();
  expect(screen.getByText(/Plain average incl\. spikes: \$569/)).toBeInTheDocument();
});

test('notes when the numbers rest on only a couple of months', () => {
  render(
    <EverydaySpendingCard
      summary={{ ...summary, countedMonths: MONTHS.slice(0, 2) }}
      pinned={['Groceries']}
      categories={categories}
      onChangePinned={vi.fn()}
    />
  );
  expect(screen.getByText('Based on 2 months.')).toBeInTheDocument();
});

test('asks for a wider range when no full months are counted', () => {
  render(
    <EverydaySpendingCard
      summary={{ rows: [], totalTypical: 0, countedMonths: [] }}
      pinned={['Groceries']}
      categories={categories}
      onChangePinned={vi.fn()}
    />
  );
  expect(
    screen.getByText('Pick a date range with at least one full past month.')
  ).toBeInTheDocument();
  expect(screen.queryByText('Total')).not.toBeInTheDocument();
});

test('editing appends new picks in order', () => {
  const onChangePinned = vi.fn();
  render(
    <EverydaySpendingCard
      summary={summary}
      pinned={['Groceries', 'Food & Drink']}
      categories={categories}
      onChangePinned={onChangePinned}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit everyday categories' }));
  fireEvent.click(screen.getByRole('button', { name: 'Gas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(onChangePinned).toHaveBeenCalledWith(['Groceries', 'Food & Drink', 'Gas']);
});
