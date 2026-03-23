import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransactionFiltersComponent, TransactionFilters } from './TransactionFilters';
import { Source } from '../../types';

const mockCategories = ['Food', 'Transport', 'Entertainment'];

const mockSources: Source[] = [
  {
    id: 'src-1',
    name: 'Bank Account',
    mappings: [],
    createdAt: '2025-01-01',
    lastUsed: '2025-06-01',
  },
  {
    id: 'src-2',
    name: 'Credit Card',
    mappings: [],
    createdAt: '2025-01-01',
    lastUsed: '2025-06-01',
  },
];

const mockLabels = ['Vacation', 'Business', 'Personal'];

const emptyFilters: TransactionFilters = {};

const defaultProps = {
  filters: emptyFilters,
  onFiltersChange: jest.fn(),
  categories: mockCategories,
  sources: mockSources,
  allLabels: mockLabels,
};

describe('TransactionFiltersComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Compact mode (isCompact=true)', () => {
    it('renders with collapsible sections', () => {
      render(<TransactionFiltersComponent {...defaultProps} isCompact />);

      expect(screen.getByText('Filters')).toBeInTheDocument();
      expect(screen.getByText('Transaction Type')).toBeInTheDocument();
      expect(screen.getByText('Categories')).toBeInTheDocument();
      expect(screen.getByText('Labels')).toBeInTheDocument();
      expect(screen.getByText('Sources')).toBeInTheDocument();
      expect(screen.getByText('Amount Range')).toBeInTheDocument();
    });

    it('toggles section expansion when clicking section header', () => {
      render(<TransactionFiltersComponent {...defaultProps} isCompact />);

      // Types section is expanded by default
      expect(screen.getByText('Expenses')).toBeInTheDocument();
      expect(screen.getByText('Income')).toBeInTheDocument();

      // Categories section is collapsed by default - category buttons should not be visible
      expect(screen.queryByText('Food')).not.toBeInTheDocument();

      // Expand categories
      fireEvent.click(screen.getByText('Categories'));
      expect(screen.getByText('Food')).toBeInTheDocument();
      expect(screen.getByText('Transport')).toBeInTheDocument();
      expect(screen.getByText('Entertainment')).toBeInTheDocument();

      // Collapse categories
      fireEvent.click(screen.getByText('Categories'));
      expect(screen.queryByText('Food')).not.toBeInTheDocument();
    });

    it('clicking type buttons toggles expense/income filters', () => {
      const onFiltersChange = jest.fn();
      render(
        <TransactionFiltersComponent
          {...defaultProps}
          onFiltersChange={onFiltersChange}
          isCompact
        />
      );

      fireEvent.click(screen.getByText('Expenses'));
      expect(onFiltersChange).toHaveBeenCalledWith({ types: ['expense'] });

      onFiltersChange.mockClear();

      fireEvent.click(screen.getByText('Income'));
      expect(onFiltersChange).toHaveBeenCalledWith({ types: ['income'] });
    });

    it('clicking category buttons toggles category filters', () => {
      const onFiltersChange = jest.fn();
      render(
        <TransactionFiltersComponent
          {...defaultProps}
          onFiltersChange={onFiltersChange}
          isCompact
        />
      );

      // Expand categories section
      fireEvent.click(screen.getByText('Categories'));

      fireEvent.click(screen.getByText('Food'));
      expect(onFiltersChange).toHaveBeenCalledWith({ categories: ['Food'] });
    });

    it('shows active filter count badge when filters are active', () => {
      const activeFilters: TransactionFilters = {
        types: ['expense'],
        categories: ['Food', 'Transport'],
      };
      render(<TransactionFiltersComponent {...defaultProps} filters={activeFilters} isCompact />);

      // Total active filter count: 1 type + 2 categories = 3
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows clear button when filters active and onClearFilters provided', () => {
      const onClearFilters = jest.fn();
      const activeFilters: TransactionFilters = { types: ['expense'] };

      render(
        <TransactionFiltersComponent
          {...defaultProps}
          filters={activeFilters}
          onClearFilters={onClearFilters}
          isCompact
        />
      );

      const clearButton = screen.getByText('Clear');
      expect(clearButton).toBeInTheDocument();

      fireEvent.click(clearButton);
      expect(onClearFilters).toHaveBeenCalledTimes(1);
    });

    it('does not show clear button when no active filters', () => {
      const onClearFilters = jest.fn();
      render(
        <TransactionFiltersComponent {...defaultProps} onClearFilters={onClearFilters} isCompact />
      );

      expect(screen.queryByText('Clear')).not.toBeInTheDocument();
    });

    it('does not show clear button when onClearFilters is not provided', () => {
      const activeFilters: TransactionFilters = { types: ['expense'] };
      render(<TransactionFiltersComponent {...defaultProps} filters={activeFilters} isCompact />);

      expect(screen.queryByText('Clear')).not.toBeInTheDocument();
    });
  });

  describe('Full mode (isCompact=false)', () => {
    it('renders checkboxes for categories', () => {
      render(<TransactionFiltersComponent {...defaultProps} isCompact={false} />);

      const checkboxes = screen.getAllByRole('checkbox');
      // 3 categories + 3 labels + 2 types + 2 sources = 10
      expect(checkboxes.length).toBe(10);

      expect(screen.getByText('Food')).toBeInTheDocument();
      expect(screen.getByText('Transport')).toBeInTheDocument();
      expect(screen.getByText('Entertainment')).toBeInTheDocument();
    });

    it('checkbox toggles call onFiltersChange correctly for categories', () => {
      const onFiltersChange = jest.fn();
      render(
        <TransactionFiltersComponent
          {...defaultProps}
          onFiltersChange={onFiltersChange}
          isCompact={false}
        />
      );

      const foodCheckbox = screen.getByLabelText('Food');
      fireEvent.click(foodCheckbox);

      expect(onFiltersChange).toHaveBeenCalledWith({ categories: ['Food'] });
    });

    it('checkbox toggles call onFiltersChange correctly for types', () => {
      const onFiltersChange = jest.fn();
      render(
        <TransactionFiltersComponent
          {...defaultProps}
          onFiltersChange={onFiltersChange}
          isCompact={false}
        />
      );

      const expenseCheckbox = screen.getByLabelText('Expenses');
      fireEvent.click(expenseCheckbox);

      expect(onFiltersChange).toHaveBeenCalledWith({ types: ['expense'] });
    });

    it('renders amount range inputs', () => {
      render(<TransactionFiltersComponent {...defaultProps} isCompact={false} />);

      expect(screen.getByText('Minimum Amount')).toBeInTheDocument();
      expect(screen.getByText('Maximum Amount')).toBeInTheDocument();
    });
  });

  describe('Amount range', () => {
    it('entering values calls onFiltersChange with parsed numbers', () => {
      const onFiltersChange = jest.fn();
      render(
        <TransactionFiltersComponent
          {...defaultProps}
          onFiltersChange={onFiltersChange}
          isCompact={false}
        />
      );

      const inputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(inputs[0], { target: { value: '10.50' } });

      expect(onFiltersChange).toHaveBeenCalledWith({ minAmount: 10.5 });

      onFiltersChange.mockClear();

      fireEvent.change(inputs[1], { target: { value: '100' } });
      expect(onFiltersChange).toHaveBeenCalledWith({ maxAmount: 100 });
    });

    it('clearing input sets undefined', () => {
      const onFiltersChange = jest.fn();
      const filtersWithAmount: TransactionFilters = { minAmount: 50 };

      render(
        <TransactionFiltersComponent
          {...defaultProps}
          filters={filtersWithAmount}
          onFiltersChange={onFiltersChange}
          isCompact={false}
        />
      );

      const inputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(inputs[0], { target: { value: '' } });

      expect(onFiltersChange).toHaveBeenCalledWith({ minAmount: undefined });
    });

    it('amount range works in compact mode after expanding section', () => {
      const onFiltersChange = jest.fn();
      render(
        <TransactionFiltersComponent
          {...defaultProps}
          onFiltersChange={onFiltersChange}
          isCompact
        />
      );

      // Expand amount range section
      fireEvent.click(screen.getByText('Amount Range'));

      expect(screen.getByText('Minimum')).toBeInTheDocument();
      expect(screen.getByText('Maximum')).toBeInTheDocument();

      const inputs = screen.getAllByPlaceholderText('0.00');
      fireEvent.change(inputs[0], { target: { value: '25' } });

      expect(onFiltersChange).toHaveBeenCalledWith({ minAmount: 25 });
    });
  });

  describe('Labels section visibility', () => {
    it('hides labels section when allLabels is empty', () => {
      render(<TransactionFiltersComponent {...defaultProps} allLabels={[]} isCompact />);

      expect(screen.queryByText('Labels')).not.toBeInTheDocument();
    });

    it('hides labels section when allLabels is empty in full mode', () => {
      render(<TransactionFiltersComponent {...defaultProps} allLabels={[]} isCompact={false} />);

      expect(screen.queryByText('Labels')).not.toBeInTheDocument();
    });

    it('shows labels section when allLabels has items', () => {
      render(<TransactionFiltersComponent {...defaultProps} isCompact />);

      expect(screen.getByText('Labels')).toBeInTheDocument();
    });
  });

  describe('Sources section visibility', () => {
    it('hides sources section when sources is empty', () => {
      render(<TransactionFiltersComponent {...defaultProps} sources={[]} isCompact />);

      expect(screen.queryByText('Sources')).not.toBeInTheDocument();
    });

    it('hides sources section when sources is empty in full mode', () => {
      render(<TransactionFiltersComponent {...defaultProps} sources={[]} isCompact={false} />);

      expect(screen.queryByText('Sources')).not.toBeInTheDocument();
    });

    it('shows sources section when sources has items', () => {
      render(<TransactionFiltersComponent {...defaultProps} isCompact />);

      expect(screen.getByText('Sources')).toBeInTheDocument();
    });
  });

  describe('Category filter add/remove', () => {
    it('adds category to filters when not present', () => {
      const onFiltersChange = jest.fn();
      render(
        <TransactionFiltersComponent
          {...defaultProps}
          onFiltersChange={onFiltersChange}
          isCompact={false}
        />
      );

      fireEvent.click(screen.getByLabelText('Food'));
      expect(onFiltersChange).toHaveBeenCalledWith({ categories: ['Food'] });
    });

    it('removes category from filters when already present', () => {
      const onFiltersChange = jest.fn();
      const filtersWithCategory: TransactionFilters = {
        categories: ['Food', 'Transport'],
      };

      render(
        <TransactionFiltersComponent
          {...defaultProps}
          filters={filtersWithCategory}
          onFiltersChange={onFiltersChange}
          isCompact={false}
        />
      );

      // Uncheck Food
      fireEvent.click(screen.getByLabelText('Food'));
      expect(onFiltersChange).toHaveBeenCalledWith({
        categories: ['Transport'],
      });
    });

    it('sets categories to undefined when last category is removed', () => {
      const onFiltersChange = jest.fn();
      const filtersWithOneCategory: TransactionFilters = {
        categories: ['Food'],
      };

      render(
        <TransactionFiltersComponent
          {...defaultProps}
          filters={filtersWithOneCategory}
          onFiltersChange={onFiltersChange}
          isCompact={false}
        />
      );

      fireEvent.click(screen.getByLabelText('Food'));
      expect(onFiltersChange).toHaveBeenCalledWith({
        categories: undefined,
      });
    });
  });

  describe('Type filter add/remove', () => {
    it('adds type to filters when not present', () => {
      const onFiltersChange = jest.fn();
      render(
        <TransactionFiltersComponent
          {...defaultProps}
          onFiltersChange={onFiltersChange}
          isCompact={false}
        />
      );

      fireEvent.click(screen.getByLabelText('Expenses'));
      expect(onFiltersChange).toHaveBeenCalledWith({ types: ['expense'] });
    });

    it('removes type from filters when already present', () => {
      const onFiltersChange = jest.fn();
      const filtersWithTypes: TransactionFilters = {
        types: ['expense', 'income'],
      };

      render(
        <TransactionFiltersComponent
          {...defaultProps}
          filters={filtersWithTypes}
          onFiltersChange={onFiltersChange}
          isCompact={false}
        />
      );

      fireEvent.click(screen.getByLabelText('Expenses'));
      expect(onFiltersChange).toHaveBeenCalledWith({
        types: ['income'],
      });
    });

    it('sets types to undefined when last type is removed', () => {
      const onFiltersChange = jest.fn();
      const filtersWithOneType: TransactionFilters = {
        types: ['expense'],
      };

      render(
        <TransactionFiltersComponent
          {...defaultProps}
          filters={filtersWithOneType}
          onFiltersChange={onFiltersChange}
          isCompact={false}
        />
      );

      fireEvent.click(screen.getByLabelText('Expenses'));
      expect(onFiltersChange).toHaveBeenCalledWith({
        types: undefined,
      });
    });
  });
});
