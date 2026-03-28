import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionForm } from './TransactionForm';
import { Expense } from '../../types';

// --- Factory helpers ---

const defaultCategories = ['Food', 'Transport', 'Entertainment'];

const defaultUsers = [
  { id: 'user-1', name: 'Alice' },
  { id: 'user-2', name: 'Bob' },
];

function createDefaultProps(overrides: Partial<React.ComponentProps<typeof TransactionForm>> = {}) {
  return {
    onSubmit: jest.fn(),
    onCancel: jest.fn(),
    isOpen: true,
    categories: defaultCategories,
    users: defaultUsers,
    ...overrides,
  };
}

function createExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    date: '2026-01-15',
    description: 'Grocery shopping',
    category: 'Food',
    amount: 42.5,
    type: 'expense',
    user: 'user-1',
    ...overrides,
  };
}

// --- Tests ---

describe('TransactionForm', () => {
  it('returns null when isOpen is false', () => {
    const props = createDefaultProps({ isOpen: false });
    const { container } = render(<TransactionForm {...props} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the form when isOpen is true', () => {
    const props = createDefaultProps({ isOpen: true });
    render(<TransactionForm {...props} />);
    expect(screen.getByText('Add New Transaction')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter description')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
  });

  it('shows "Add New Transaction" title when no editingExpense', () => {
    const props = createDefaultProps();
    render(<TransactionForm {...props} />);
    expect(screen.getByText('Add New Transaction')).toBeInTheDocument();
  });

  it('shows "Edit Transaction" title when editingExpense is provided', () => {
    const props = createDefaultProps({ editingExpense: createExpense() });
    render(<TransactionForm {...props} />);
    expect(screen.getByText('Edit Transaction')).toBeInTheDocument();
  });

  it('populates form fields when editing an existing expense', () => {
    const expense = createExpense({
      date: '2026-02-20',
      description: 'Monthly rent',
      category: 'Transport',
      amount: 1200,
      type: 'income',
      user: 'user-2',
    });
    const props = createDefaultProps({ editingExpense: expense });
    render(<TransactionForm {...props} />);

    expect(screen.getByDisplayValue('2026-02-20')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Monthly rent')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1200')).toBeInTheDocument();

    // Category select should reflect the editing expense value
    const categorySelect = screen.getByDisplayValue('Transport') as HTMLSelectElement;
    expect(categorySelect.value).toBe('Transport');

    // User select should reflect the editing expense value
    const userSelect = screen.getByDisplayValue('Bob') as HTMLSelectElement;
    expect(userSelect.value).toBe('user-2');
  });

  it('type toggle switches between expense and income', async () => {
    const props = createDefaultProps();
    render(<TransactionForm {...props} />);

    const expenseButton = screen.getByText('Expense');
    const incomeButton = screen.getByText('Income');

    // Default is expense - the expense button should have the active class
    expect(expenseButton.className).toContain('border-danger-500');
    expect(incomeButton.className).not.toContain('border-success-500');

    // Click income
    await userEvent.click(incomeButton);
    expect(incomeButton.className).toContain('border-success-500');
    expect(expenseButton.className).not.toContain('border-danger-500');

    // Click expense again
    await userEvent.click(expenseButton);
    expect(expenseButton.className).toContain('border-danger-500');
    expect(incomeButton.className).not.toContain('border-success-500');
  });

  describe('validation', () => {
    const getSelectByLabel = (container: HTMLElement, labelText: string) => {
      const label = Array.from(container.querySelectorAll('label')).find(
        (l) => l.textContent === labelText
      );
      return label?.parentElement?.querySelector('select') as HTMLSelectElement;
    };

    it('does not call onSubmit when description is empty', async () => {
      const props = createDefaultProps();
      const { container } = render(<TransactionForm {...props} />);

      // Fill everything except description
      await userEvent.type(screen.getByPlaceholderText('0.00'), '50');
      const userSelect = getSelectByLabel(container, 'User');
      fireEvent.change(userSelect, { target: { value: 'user-1' } });

      fireEvent.click(screen.getByText('Add'));
      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it('does not call onSubmit when amount is empty', async () => {
      const props = createDefaultProps();
      const { container } = render(<TransactionForm {...props} />);

      await userEvent.type(screen.getByPlaceholderText('Enter description'), 'Coffee');
      const userSelect = getSelectByLabel(container, 'User');
      fireEvent.change(userSelect, { target: { value: 'user-1' } });

      fireEvent.click(screen.getByText('Add'));
      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it('does not call onSubmit when category is empty', async () => {
      const props = createDefaultProps({ categories: ['', 'Food'] });
      const { container } = render(<TransactionForm {...props} />);

      await userEvent.type(screen.getByPlaceholderText('Enter description'), 'Coffee');
      await userEvent.type(screen.getByPlaceholderText('0.00'), '5');
      const userSelect = getSelectByLabel(container, 'User');
      fireEvent.change(userSelect, { target: { value: 'user-1' } });

      // Category defaults to first option which is empty string
      fireEvent.click(screen.getByText('Add'));
      expect(props.onSubmit).not.toHaveBeenCalled();
    });

    it('does not call onSubmit when user is not selected', async () => {
      const props = createDefaultProps();
      render(<TransactionForm {...props} />);

      await userEvent.type(screen.getByPlaceholderText('Enter description'), 'Coffee');
      await userEvent.type(screen.getByPlaceholderText('0.00'), '5');
      // Category will default to first option ('Food') - that's fine
      // Do not select a user (default is empty string "Select user")

      fireEvent.click(screen.getByText('Add'));
      expect(props.onSubmit).not.toHaveBeenCalled();
    });
  });

  it('calls onSubmit with form data when all fields are filled', async () => {
    const props = createDefaultProps();
    const { container } = render(<TransactionForm {...props} />);

    const getSelectByLabel = (labelText: string) => {
      const label = Array.from(container.querySelectorAll('label')).find(
        (l) => l.textContent === labelText
      );
      return label?.parentElement?.querySelector('select') as HTMLSelectElement;
    };

    // Fill in all fields
    await userEvent.type(screen.getByPlaceholderText('Enter description'), 'Coffee');
    await userEvent.type(screen.getByPlaceholderText('0.00'), '4.50');

    // Select category
    fireEvent.change(getSelectByLabel('Category'), { target: { value: 'Food' } });

    // Select user
    fireEvent.change(getSelectByLabel('User'), { target: { value: 'user-1' } });

    fireEvent.click(screen.getByText('Add'));

    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    const submittedData = (props.onSubmit as jest.Mock).mock.calls[0][0];
    expect(submittedData).toMatchObject({
      description: 'Coffee',
      amount: '4.5',
      category: 'Food',
      type: 'expense',
      user: 'user-1',
    });
    expect(submittedData.date).toBeTruthy();
  });

  it('resets form after successful submission', async () => {
    const props = createDefaultProps();
    const { container } = render(<TransactionForm {...props} />);

    const getSelectByLabel = (labelText: string) => {
      const label = Array.from(container.querySelectorAll('label')).find(
        (l) => l.textContent === labelText
      );
      return label?.parentElement?.querySelector('select') as HTMLSelectElement;
    };

    const descriptionInput = screen.getByPlaceholderText('Enter description') as HTMLInputElement;
    const amountInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;

    // Fill and submit
    await userEvent.type(descriptionInput, 'Coffee');
    await userEvent.type(amountInput, '4.50');
    fireEvent.change(getSelectByLabel('Category'), { target: { value: 'Food' } });
    fireEvent.change(getSelectByLabel('User'), { target: { value: 'user-1' } });

    fireEvent.click(screen.getByText('Add'));

    // After submit the form fields should be reset
    expect(descriptionInput.value).toBe('');
    expect(amountInput.value).toBe('');
  });

  it('calls onCancel when cancel button is clicked', async () => {
    const props = createDefaultProps();
    render(<TransactionForm {...props} />);

    await userEvent.click(screen.getByText('Cancel'));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when X button is clicked', async () => {
    const props = createDefaultProps();
    render(<TransactionForm {...props} />);

    // The X button is in the header, rendered via lucide-react's X icon.
    // It's the button in the header area that is not "Cancel" or "Add".
    const header = screen.getByText('Add New Transaction').closest('div')!;
    const xButton = header.querySelector('button')!;
    await userEvent.click(xButton);
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders all provided categories in the dropdown', () => {
    const categories = ['Groceries', 'Rent', 'Utilities', 'Savings'];
    const props = createDefaultProps({ categories });
    const { container } = render(<TransactionForm {...props} />);

    const label = Array.from(container.querySelectorAll('label')).find(
      (l) => l.textContent === 'Category'
    );
    const categorySelect = label?.parentElement?.querySelector('select') as HTMLSelectElement;
    const options = Array.from(categorySelect.options).map((o) => o.textContent);

    categories.forEach((cat) => {
      expect(options).toContain(cat);
    });
  });

  it('renders all provided users in the dropdown', () => {
    const users = [
      { id: 'u1', name: 'Charlie' },
      { id: 'u2', name: 'Dana' },
      { id: 'u3', name: 'Eve' },
    ];
    const props = createDefaultProps({ users });
    const { container } = render(<TransactionForm {...props} />);

    const label = Array.from(container.querySelectorAll('label')).find(
      (l) => l.textContent === 'User'
    );
    const userSelect = label?.parentElement?.querySelector('select') as HTMLSelectElement;
    const options = Array.from(userSelect.options).map((o) => o.textContent);

    // Should contain the placeholder plus all users
    expect(options).toContain('Select user');
    users.forEach((u) => {
      expect(options).toContain(u.name);
    });
  });
});
