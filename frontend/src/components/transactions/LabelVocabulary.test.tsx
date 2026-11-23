import { fireEvent, render, screen } from '@testing-library/react';
import { TransactionList } from './TransactionList';
import { TransactionFiltersComponent } from './TransactionFilters';
import { ReportCreator } from '../reports/ReportCreator';
import { FilterBuilder } from '../dashboards/FilterBuilder';
import type { Expense } from '../../types';

const expense: Expense = {
  id: 'one',
  date: '2024-01-15',
  description: 'Only loaded row',
  category: 'Travel',
  amount: 10,
  type: 'expense',
  user: 'alice',
  labels: ['CurrentPage'],
};

describe('authoritative label choices', () => {
  it('offers unused and cross-page vocabulary in the row selector', () => {
    const onAddLabel = vi.fn();
    render(
      <TransactionList
        expenses={[expense]}
        categories={['Travel']}
        allLabels={['OtherPage', 'Unused']}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onUpdateCategory={vi.fn()}
        onAddLabel={onAddLabel}
        onRemoveLabel={vi.fn()}
        onViewDetails={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('Add label'));
    fireEvent.click(screen.getByText('Unused'));
    expect(onAddLabel).toHaveBeenCalledWith('one', 'Unused');
  });

  it('keeps the existing three-label add limit for rows', () => {
    render(
      <TransactionList
        expenses={[{ ...expense, labels: ['A', 'B', 'C'] }]}
        categories={['Travel']}
        allLabels={['Unused']}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onUpdateCategory={vi.fn()}
        onAddLabel={vi.fn()}
        onRemoveLabel={vi.fn()}
        onViewDetails={vi.fn()}
      />
    );
    expect(screen.queryByTitle('Add label')).not.toBeInTheDocument();
  });

  it('uses household vocabulary for report choices even with no matching expenses', () => {
    render(
      <ReportCreator
        expenses={[]}
        categories={['Travel']}
        sources={[]}
        allLabels={['Unused']}
        onCreateReport={vi.fn()}
        onCancel={vi.fn()}
        globalDateRange={{ start: new Date('2024-01-01'), end: new Date('2024-01-31') }}
      />
    );
    expect(screen.getByLabelText('Unused')).toBeInTheDocument();
  });

  it('keeps a removed selected filter visible and clearable after vocabulary refresh', () => {
    const onFiltersChange = vi.fn();
    const props = { filters: { labels: ['Old'] }, onFiltersChange, categories: [], sources: [] };
    const { rerender } = render(<TransactionFiltersComponent {...props} allLabels={['Old']} />);
    rerender(<TransactionFiltersComponent {...props} allLabels={[]} />);
    fireEvent.click(screen.getByLabelText('Old'));
    expect(onFiltersChange).toHaveBeenCalledWith({ labels: undefined });
  });

  it('keeps selected label names available in saved dashboard conditions', () => {
    const onChange = vi.fn();
    render(
      <FilterBuilder
        categories={[]}
        allLabels={[]}
        onChange={onChange}
        filterGroups={[{ conditions: [{ field: 'labels', operator: 'excludes', value: ['Old'] }] }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Old' }));
    expect(onChange).toHaveBeenCalledWith([
      { conditions: [{ field: 'labels', operator: 'excludes', value: [] }] },
    ]);
  });
});
