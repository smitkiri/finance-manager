import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Mock } from 'vitest';
import { BudgetPage } from './BudgetPage';
import { ApiClient } from '../utils/apiClient';
import type { BudgetCategory, BudgetMonthResponse } from '../types';

vi.mock('../utils/apiClient', async () => {
  const actual = await vi.importActual<typeof import('../utils/apiClient')>('../utils/apiClient');
  return {
    ...actual,
    ApiClient: {
      ...actual.ApiClient,
      getBudgets: vi.fn(),
      saveBudget: vi.fn(),
      getBudgetTypical: vi.fn(),
      loadCategories: vi.fn().mockResolvedValue(['Dining', 'Groceries', 'Shopping']),
    },
  };
});

const getBudgets = ApiClient.getBudgets as Mock;

const row = (category: string, limit: number, actual: number, extra = {}): BudgetCategory => ({
  category,
  limit,
  actual,
  inCategoryList: true,
  history: [{ month: '2026-10', limit, actual, hasData: true }],
  ...extra,
});

const response = (overrides: Partial<BudgetMonthResponse> = {}): BudgetMonthResponse => ({
  month: '2026-10',
  earliestMonth: '2026-01',
  hasData: true,
  categories: [row('C', 650, 588), row('B', 200, 231), row('A', 300, 462)],
  ...overrides,
});

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/budget" element={<BudgetPage />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 5));
  getBudgets.mockReset();
  getBudgets.mockImplementation(async (month: string) => response({ month }));
});

afterEach(() => {
  vi.useRealTimers();
});

it('renders rows sorted with summary', async () => {
  renderAt('/budget?month=2026-10');
  expect(await screen.findByText('2 of 3 over')).toBeInTheDocument();
  const names = screen.getAllByTestId('budget-row-name').map((el) => el.textContent);
  expect(names).toEqual(['A', 'B', 'C']);
});

it('defaults to last full month', async () => {
  renderAt('/budget');
  await waitFor(() => expect(getBudgets).toHaveBeenCalledWith('2026-10'));
  expect(await screen.findByText('October 2026')).toBeInTheDocument();
});

it('clamps future month param', async () => {
  renderAt('/budget?month=2027-01');
  await waitFor(() => expect(getBudgets).toHaveBeenCalledWith('2026-10'));
  expect(getBudgets).not.toHaveBeenCalledWith('2027-01');
});

it('next disabled on last full month; prev disabled at earliest', async () => {
  getBudgets.mockImplementation(async (month: string) =>
    response({ month, earliestMonth: '2026-10' })
  );
  renderAt('/budget?month=2026-10');
  await screen.findByText('2 of 3 over');
  expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Previous month' })).toBeDisabled();
});

it('prev navigates to the previous month', async () => {
  getBudgets.mockImplementation(async (month: string) =>
    response({ month, earliestMonth: '2026-08' })
  );
  renderAt('/budget?month=2026-10');
  await screen.findByText('2 of 3 over');
  await userEvent.click(screen.getByRole('button', { name: 'Previous month' }));
  await waitFor(() => expect(getBudgets).toHaveBeenCalledWith('2026-09'));
  expect(await screen.findByText('September 2026')).toBeInTheDocument();
});

it('empty state copy', async () => {
  getBudgets.mockImplementation(async (month: string) =>
    response({ month, earliestMonth: null, categories: [] })
  );
  renderAt('/budget?month=2026-10');
  expect(
    await screen.findByText('Set a monthly limit on the categories you want to spend less on.')
  ).toBeInTheDocument();
  expect(screen.queryByText(/of \d+ over/)).not.toBeInTheDocument();
});

it('no-data copy', async () => {
  getBudgets.mockImplementation(async (month: string) => response({ month, hasData: false }));
  renderAt('/budget?month=2026-10');
  expect(
    await screen.findByText('No transactions imported for October 2026 yet.')
  ).toBeInTheDocument();
  expect(screen.queryByText('2 of 3 over')).not.toBeInTheDocument();
});

it('orphan note', async () => {
  getBudgets.mockImplementation(async (month: string) =>
    response({ month, categories: [row('Dining Out', 100, 20, { inCategoryList: false })] })
  );
  renderAt('/budget?month=2026-10');
  expect(await screen.findByText('Category no longer in your list')).toBeInTheDocument();
});
