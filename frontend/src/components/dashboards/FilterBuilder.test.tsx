import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterBuilder } from './FilterBuilder';
import { FilterGroup } from '../../types';

const defaultCategories = ['Food', 'Transport', 'Entertainment'];
const defaultLabels = ['work', 'personal', 'urgent'];

function renderFilterBuilder(
  filterGroups: FilterGroup[] = [],
  overrides: Partial<{
    onChange: jest.Mock;
    categories: string[];
    allLabels: string[];
  }> = {}
) {
  const onChange = overrides.onChange ?? jest.fn();
  const result = render(
    <FilterBuilder
      filterGroups={filterGroups}
      onChange={onChange}
      categories={overrides.categories ?? defaultCategories}
      allLabels={overrides.allLabels ?? defaultLabels}
    />
  );
  return { onChange, ...result };
}

describe('FilterBuilder', () => {
  // 1. Empty state
  it('renders empty state with just "Add OR group" button', () => {
    renderFilterBuilder([]);
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Add OR group')).toBeInTheDocument();
    expect(screen.queryByText(/Group/)).not.toBeInTheDocument();
  });

  // 2. Renders existing filter groups with conditions
  it('renders existing filter groups with conditions', () => {
    const groups: FilterGroup[] = [
      {
        conditions: [
          { field: 'type', operator: 'is', value: 'expense' },
          { field: 'amount', operator: 'gte', value: 100 },
        ],
      },
    ];
    renderFilterBuilder(groups);
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    // Field selects should show Type and Amount
    const fieldSelects = screen.getAllByDisplayValue('Type');
    expect(fieldSelects).toHaveLength(1);
    expect(screen.getByDisplayValue('Amount')).toBeInTheDocument();
  });

  // 3. Add OR group
  it('calls onChange with new group when "Add OR group" is clicked', () => {
    const { onChange } = renderFilterBuilder([]);
    fireEvent.click(screen.getByText('Add OR group'));
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'type', operator: 'is', value: '' }] },
    ]);
  });

  it('appends new group to existing groups', () => {
    const existing: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ];
    const { onChange } = renderFilterBuilder(existing);
    fireEvent.click(screen.getByText('Add OR group'));
    expect(onChange).toHaveBeenCalledWith([
      ...existing,
      { conditions: [{ field: 'type', operator: 'is', value: '' }] },
    ]);
  });

  // 4. Remove group
  it('removes group when clicking X on group header', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
      { conditions: [{ field: 'amount', operator: 'gte', value: 50 }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    // There are multiple X buttons; the group remove buttons come first in each group header
    // Each group has a header X button plus one per condition. Group 1: 2 X buttons, Group 2: 2 X buttons
    // The first X button in the DOM is the group 1 header remove
    const allButtons = screen.getAllByRole('button');
    // Find buttons that are group remove buttons (in the header area)
    // The group remove button is the one with X icon in the header div
    // We'll click the first X-like button which removes Group 1
    const xButtons = allButtons.filter(
      (btn) =>
        btn.querySelector('svg') && btn.classList.contains('text-red-400') && btn.textContent === ''
    );
    // First X button should be group 1 remove
    fireEvent.click(xButtons[0]);
    expect(onChange).toHaveBeenCalledWith([groups[1]]);
  });

  // 5. Add condition
  it('adds a new condition when "Add condition" is clicked', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    fireEvent.click(screen.getByText('Add condition'));
    expect(onChange).toHaveBeenCalledWith([
      {
        conditions: [
          { field: 'type', operator: 'is', value: 'expense' },
          { field: 'type', operator: 'is', value: '' },
        ],
      },
    ]);
  });

  // 6. Remove condition (not last)
  it('removes a condition from a group with multiple conditions', () => {
    const groups: FilterGroup[] = [
      {
        conditions: [
          { field: 'type', operator: 'is', value: 'expense' },
          { field: 'amount', operator: 'gte', value: 100 },
        ],
      },
    ];
    const { onChange } = renderFilterBuilder(groups);
    // Find condition remove buttons (the ones inside condition rows)
    const xButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.querySelector('svg') && btn.classList.contains('flex-shrink-0'));
    // Remove the second condition (amount)
    fireEvent.click(xButtons[1]);
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ]);
  });

  // 7. Remove last condition removes entire group
  it('removes entire group when removing last condition', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    // The condition remove button (flex-shrink-0)
    const conditionRemoveBtn = screen
      .getAllByRole('button')
      .filter((btn) => btn.classList.contains('flex-shrink-0'));
    fireEvent.click(conditionRemoveBtn[0]);
    expect(onChange).toHaveBeenCalledWith([]);
  });

  // 8. Field change resets operator and value
  it('resets operator and value when field is changed', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    const fieldSelect = screen.getByDisplayValue('Type');
    fireEvent.change(fieldSelect, { target: { value: 'category' } });
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'category', operator: 'is', value: [] }] },
    ]);
  });

  it('resets to amount defaults when field changed to amount', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    const fieldSelect = screen.getByDisplayValue('Type');
    fireEvent.change(fieldSelect, { target: { value: 'amount' } });
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'amount', operator: 'gte', value: '' }] },
    ]);
  });

  it('resets to labels defaults when field changed to labels', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    const fieldSelect = screen.getByDisplayValue('Type');
    fireEvent.change(fieldSelect, { target: { value: 'labels' } });
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'labels', operator: 'includes', value: [] }] },
    ]);
  });

  it('resets to description defaults when field changed to description', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    const fieldSelect = screen.getByDisplayValue('Type');
    fireEvent.change(fieldSelect, { target: { value: 'description' } });
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'description', operator: 'matches', value: '' }] },
    ]);
  });

  // 9. Operator change
  it('updates operator when operator select is changed', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'category', operator: 'is', value: ['Food'] }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    const operatorSelect = screen.getByDisplayValue('is');
    fireEvent.change(operatorSelect, { target: { value: 'is_not' } });
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'category', operator: 'is_not', value: ['Food'] }] },
    ]);
  });

  // 10. OR divider between groups
  it('shows OR divider between multiple groups', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
      { conditions: [{ field: 'type', operator: 'is', value: 'income' }] },
    ];
    renderFilterBuilder(groups);
    expect(screen.getByText('OR')).toBeInTheDocument();
    expect(screen.getByText('Group 1')).toBeInTheDocument();
    expect(screen.getByText('Group 2')).toBeInTheDocument();
  });

  it('does not show OR divider with single group', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ];
    renderFilterBuilder(groups);
    expect(screen.queryByText('OR')).not.toBeInTheDocument();
  });

  // 11. AND divider between conditions
  it('shows AND divider between conditions within a group', () => {
    const groups: FilterGroup[] = [
      {
        conditions: [
          { field: 'type', operator: 'is', value: 'expense' },
          { field: 'amount', operator: 'gte', value: 50 },
        ],
      },
    ];
    renderFilterBuilder(groups);
    expect(screen.getByText('AND')).toBeInTheDocument();
  });

  it('does not show AND divider with single condition', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ];
    renderFilterBuilder(groups);
    expect(screen.queryByText('AND')).not.toBeInTheDocument();
  });

  // 12. Category value input - toggle selection
  it('toggles category selection when clicking category buttons', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'category', operator: 'is', value: [] }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    fireEvent.click(screen.getByText('Food'));
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'category', operator: 'is', value: ['Food'] }] },
    ]);
  });

  it('deselects category when clicking already selected category', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'category', operator: 'is', value: ['Food', 'Transport'] }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    fireEvent.click(screen.getByText('Food'));
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'category', operator: 'is', value: ['Transport'] }] },
    ]);
  });

  // 13. Type value input - dropdown
  it('updates value when selecting type from dropdown', () => {
    const groups: FilterGroup[] = [{ conditions: [{ field: 'type', operator: 'is', value: '' }] }];
    const { onChange } = renderFilterBuilder(groups);
    // The type value select has "Select...", "Expense", "Income" options
    const typeSelect = screen.getByDisplayValue('Select...');
    fireEvent.change(typeSelect, { target: { value: 'expense' } });
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
    ]);
  });

  // 14. Amount value input
  it('updates value when typing a number in amount input', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'amount', operator: 'gte', value: '' }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '42.5' } });
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'amount', operator: 'gte', value: 42.5 }] },
    ]);
  });

  it('sets empty string when amount input is cleared', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'amount', operator: 'gte', value: 100 }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(amountInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'amount', operator: 'gte', value: '' }] },
    ]);
  });

  // 15. Description value input
  it('updates value when typing text in description input', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'description', operator: 'matches', value: '' }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    const descInput = screen.getByPlaceholderText('regex pattern (e.g. uber|lyft)');
    fireEvent.change(descInput, { target: { value: 'grocery' } });
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'description', operator: 'matches', value: 'grocery' }] },
    ]);
  });

  // Labels value input
  it('toggles label selection when clicking label buttons', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'labels', operator: 'includes', value: [] }] },
    ];
    const { onChange } = renderFilterBuilder(groups);
    fireEvent.click(screen.getByText('work'));
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'labels', operator: 'includes', value: ['work'] }] },
    ]);
  });

  it('shows "No labels available" when allLabels is empty', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'labels', operator: 'includes', value: [] }] },
    ];
    renderFilterBuilder(groups, { allLabels: [] });
    expect(screen.getByText('No labels available')).toBeInTheDocument();
  });

  // Multiple groups with OR dividers
  it('shows correct number of OR dividers for three groups', () => {
    const groups: FilterGroup[] = [
      { conditions: [{ field: 'type', operator: 'is', value: 'expense' }] },
      { conditions: [{ field: 'type', operator: 'is', value: 'income' }] },
      { conditions: [{ field: 'amount', operator: 'gte', value: 50 }] },
    ];
    renderFilterBuilder(groups);
    const orDividers = screen.getAllByText('OR');
    expect(orDividers).toHaveLength(2);
  });

  // Remove condition from first position keeps remaining
  it('removes the first condition and keeps remaining conditions', () => {
    const groups: FilterGroup[] = [
      {
        conditions: [
          { field: 'type', operator: 'is', value: 'expense' },
          { field: 'amount', operator: 'gte', value: 100 },
        ],
      },
    ];
    const { onChange } = renderFilterBuilder(groups);
    const conditionRemoveButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.classList.contains('flex-shrink-0'));
    // Click the first condition's remove button
    fireEvent.click(conditionRemoveButtons[0]);
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'amount', operator: 'gte', value: 100 }] },
    ]);
  });
});
