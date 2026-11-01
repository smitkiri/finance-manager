import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { toast } from 'react-toastify';
import { BudgetLimitSheet } from './BudgetLimitSheet';
import { ApiClient } from '../../utils/apiClient';

vi.mock('react-toastify', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('../../utils/apiClient', async () => {
  const actual =
    await vi.importActual<typeof import('../../utils/apiClient')>('../../utils/apiClient');
  return {
    ...actual,
    ApiClient: { ...actual.ApiClient, saveBudget: vi.fn(), getBudgetTypical: vi.fn() },
  };
});

const saveBudget = ApiClient.saveBudget as Mock;
const getBudgetTypical = ApiClient.getBudgetTypical as Mock;

const setup = (mode: React.ComponentProps<typeof BudgetLimitSheet>['mode']) => {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <BudgetLimitSheet isOpen onClose={onClose} month="2026-10" mode={mode} onSaved={onSaved} />
  );
  return { onClose, onSaved };
};

const amountInput = () => screen.getByLabelText('Monthly limit') as HTMLInputElement;
const saveButton = () => screen.getByRole('button', { name: 'Save' });

beforeEach(() => {
  saveBudget.mockReset().mockResolvedValue(undefined);
  getBudgetTypical.mockReset();
  (toast.success as Mock).mockReset();
  (toast.error as Mock).mockReset();
});

it('add mode prefills typical', async () => {
  getBudgetTypical.mockResolvedValue(410);
  setup({ kind: 'add', availableCategories: ['Dining', 'Groceries'] });
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'Dining');
  await waitFor(() => expect(amountInput().value).toBe('410'));
  expect(getBudgetTypical).toHaveBeenCalledWith('Dining', '2026-10');
  expect(screen.getByText('Typical month: $410')).toBeInTheDocument();
  expect(screen.getByText('Applies from October 2026 onward.')).toBeInTheDocument();
});

it('add mode leaves empty when no typical', async () => {
  getBudgetTypical.mockResolvedValue(null);
  setup({ kind: 'add', availableCategories: ['Dining'] });
  await userEvent.selectOptions(screen.getByLabelText('Category'), 'Dining');
  await waitFor(() => expect(getBudgetTypical).toHaveBeenCalled());
  expect(amountInput().value).toBe('');
  expect(saveButton()).toBeDisabled();
});

it('save calls api with month', async () => {
  const { onSaved, onClose } = setup({ kind: 'edit', category: 'Dining', limit: 300 });
  expect(screen.getByText('Dining limit')).toBeInTheDocument();
  await userEvent.clear(amountInput());
  await userEvent.type(amountInput(), '250');
  await userEvent.click(saveButton());
  await waitFor(() =>
    expect(saveBudget).toHaveBeenCalledWith({ category: 'Dining', month: '2026-10', amount: 250 })
  );
  expect(toast.success).toHaveBeenCalledWith('Budget saved');
  expect(onSaved).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

it('remove sends null', async () => {
  setup({ kind: 'edit', category: 'Dining', limit: 300 });
  await userEvent.click(screen.getByRole('button', { name: 'Remove limit' }));
  await waitFor(() =>
    expect(saveBudget).toHaveBeenCalledWith({ category: 'Dining', month: '2026-10', amount: null })
  );
  expect(toast.success).toHaveBeenCalledWith('Limit removed');
});

it('rejects fractional', async () => {
  setup({ kind: 'edit', category: 'Dining', limit: 300 });
  await userEvent.clear(amountInput());
  await userEvent.type(amountInput(), '12.5');
  expect(saveButton()).toBeDisabled();
});

it('failure keeps sheet open', async () => {
  saveBudget.mockRejectedValue(new Error('boom'));
  const { onClose } = setup({ kind: 'edit', category: 'Dining', limit: 300 });
  await userEvent.click(saveButton());
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to save budget'));
  expect(onClose).not.toHaveBeenCalled();
});
