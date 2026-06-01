import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CSVPreviewEditor } from './CSVPreviewEditor';
import { CSVPreview, Source } from '../../types';

// ---------- Test data factories ----------

function makeCSVPreview(overrides?: Partial<CSVPreview>): CSVPreview {
  return {
    headers: ['Date', 'Description', 'Amount'],
    sampleRows: [
      ['2025-01-01', 'Grocery Store', '50.00'],
      ['2025-01-02', 'Electric Bill', '120.00'],
      ['2025-01-03', 'Coffee Shop', '5.75'],
    ],
    totalRows: 3,
    ...overrides,
  };
}

function makeSource(overrides?: Partial<Source>): Source {
  return {
    id: 'src-1',
    name: 'Test Bank',
    mappings: [
      { csvColumn: 'Date', standardColumn: 'Transaction Date' },
      { csvColumn: 'Description', standardColumn: 'Description' },
      { csvColumn: 'Amount', standardColumn: 'Amount' },
    ],
    createdAt: '2025-01-01T00:00:00Z',
    lastUsed: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeSourceWithCategory(overrides?: Partial<Source>): Source {
  return makeSource({
    mappings: [
      { csvColumn: 'Date', standardColumn: 'Transaction Date' },
      { csvColumn: 'Description', standardColumn: 'Description' },
      { csvColumn: 'Amount', standardColumn: 'Amount' },
      { csvColumn: 'Category', standardColumn: 'Category' },
    ],
    ...overrides,
  });
}

function makeCsvPreviewWithCategory(): CSVPreview {
  return {
    headers: ['Date', 'Description', 'Amount', 'Category'],
    sampleRows: [
      ['2025-01-01', 'Grocery Store', '50.00', 'Food & Dining'],
      ['2025-01-02', 'Electric Bill', '120.00', 'Utilities'],
    ],
    totalRows: 2,
  };
}

const defaultProps = () => ({
  isOpen: true,
  onClose: jest.fn(),
  csvPreview: makeCSVPreview(),
  source: makeSource(),
  onImport: jest.fn(),
});

// ---------- Tests ----------

describe('CSVPreviewEditor', () => {
  // 1. Returns null when isOpen is false
  test('returns null when isOpen is false', () => {
    const { container } = render(<CSVPreviewEditor {...defaultProps()} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  // 2. Renders table with headers and rows when open
  test('renders table with headers and rows when open', () => {
    render(<CSVPreviewEditor {...defaultProps()} />);

    // Headers
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();

    // Row data
    expect(screen.getByText('Grocery Store')).toBeInTheDocument();
    expect(screen.getByText('Electric Bill')).toBeInTheDocument();
    expect(screen.getByText('Coffee Shop')).toBeInTheDocument();
    expect(screen.getByText('50.00')).toBeInTheDocument();
  });

  // 3. Shows correct valid row count in header
  test('shows correct valid row count in header', () => {
    render(<CSVPreviewEditor {...defaultProps()} />);
    expect(screen.getByText('3 of 3 rows will be imported')).toBeInTheDocument();
  });

  // 4. Delete row: clicking delete button marks row as deleted
  test('clicking delete button marks row as deleted', () => {
    render(<CSVPreviewEditor {...defaultProps()} />);

    const deleteButtons = screen.getAllByTitle('Delete row');
    expect(deleteButtons).toHaveLength(3);

    fireEvent.click(deleteButtons[0]);

    // After deletion, a restore button should appear
    expect(screen.getAllByTitle('Restore row')).toHaveLength(1);
    // Remaining delete buttons
    expect(screen.getAllByTitle('Delete row')).toHaveLength(2);
  });

  // 5. Restore row: clicking restore button on deleted row restores it
  test('clicking restore button on deleted row restores it', () => {
    render(<CSVPreviewEditor {...defaultProps()} />);

    const deleteButtons = screen.getAllByTitle('Delete row');
    fireEvent.click(deleteButtons[0]);

    const restoreButton = screen.getByTitle('Restore row');
    fireEvent.click(restoreButton);

    // All rows should have delete buttons again
    expect(screen.getAllByTitle('Delete row')).toHaveLength(3);
    expect(screen.queryByTitle('Restore row')).not.toBeInTheDocument();
  });

  // 6. Deleted rows excluded from valid count
  test('deleted rows are excluded from valid count', () => {
    render(<CSVPreviewEditor {...defaultProps()} />);

    expect(screen.getByText('3 of 3 rows will be imported')).toBeInTheDocument();

    const deleteButtons = screen.getAllByTitle('Delete row');
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText('2 of 3 rows will be imported')).toBeInTheDocument();
  });

  // 7. Invalid rows (empty/zero/NaN amount) shown as invalid
  test('invalid rows with empty, zero, or NaN amounts are excluded from valid count', () => {
    const csvPreview = makeCSVPreview({
      sampleRows: [
        ['2025-01-01', 'Valid', '50.00'],
        ['2025-01-02', 'Empty Amount', ''],
        ['2025-01-03', 'Zero Amount', '0'],
        ['2025-01-04', 'NaN Amount', 'abc'],
      ],
      totalRows: 4,
    });

    render(<CSVPreviewEditor {...defaultProps()} csvPreview={csvPreview} />);

    // Only 1 valid row out of 4
    expect(screen.getByText('1 of 4 rows will be imported')).toBeInTheDocument();
  });

  // 8. Cell editing: clicking cell shows input, typing changes value
  test('clicking a cell enters edit mode and typing changes value', () => {
    render(<CSVPreviewEditor {...defaultProps()} />);

    const cell = screen.getByText('Grocery Store');
    fireEvent.click(cell);

    const input = screen.getByDisplayValue('Grocery Store');
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe('INPUT');

    fireEvent.change(input, { target: { value: 'Updated Store' } });
    expect(screen.getByDisplayValue('Updated Store')).toBeInTheDocument();

    // Blur to exit edit mode
    fireEvent.blur(input);
    expect(screen.getByText('Updated Store')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('Updated Store')).not.toBeInTheDocument();
  });

  // 9. Category override: shows category dropdown when Category not mapped
  test('shows category dropdown when Category column is not mapped', () => {
    render(<CSVPreviewEditor {...defaultProps()} />);

    // Should have a "Category" column header added
    const categoryHeaders = screen.getAllByText('Category');
    expect(categoryHeaders.length).toBeGreaterThanOrEqual(1);

    // Should have select dropdowns for each row (3 rows)
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(3);
  });

  // 10. Category override: does not show dropdown when Category is mapped
  test('does not show category dropdown when Category column is mapped', () => {
    const csvPreview = makeCsvPreviewWithCategory();
    const source = makeSourceWithCategory();

    render(<CSVPreviewEditor {...defaultProps()} csvPreview={csvPreview} source={source} />);

    // No select dropdowns for category overrides
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
  });

  // 11. Import: calls onImport with only valid, non-deleted rows
  test('import calls onImport with only valid non-deleted rows', () => {
    const onImport = jest.fn();
    const onClose = jest.fn();

    const csvPreview = makeCSVPreview({
      sampleRows: [
        ['2025-01-01', 'Valid Row', '50.00'],
        ['2025-01-02', 'Invalid Row', ''],
        ['2025-01-03', 'Another Valid', '25.00'],
      ],
      totalRows: 3,
    });

    render(
      <CSVPreviewEditor
        {...defaultProps()}
        csvPreview={csvPreview}
        onImport={onImport}
        onClose={onClose}
      />
    );

    // Delete the first valid row
    const deleteButtons = screen.getAllByTitle('Delete row');
    fireEvent.click(deleteButtons[0]);

    // Click Import button
    const importButton = screen.getByText(/Import 1 Rows/);
    fireEvent.click(importButton);

    expect(onImport).toHaveBeenCalledTimes(1);
    const importedData = onImport.mock.calls[0][0];
    // Only the third row should be imported (first deleted, second invalid)
    expect(importedData).toHaveLength(1);
    expect(importedData[0]).toContain('Another Valid');
    expect(importedData[0]).toContain('25.00');

    // Source passed through
    expect(onImport.mock.calls[0][1]).toEqual(expect.objectContaining({ id: 'src-1' }));

    // onClose also called
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 12. Import: applies category overrides to imported data
  test('import applies category overrides to imported data', () => {
    const onImport = jest.fn();
    const onClose = jest.fn();

    render(<CSVPreviewEditor {...defaultProps()} onImport={onImport} onClose={onClose} />);

    // Change category for the first row
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'Transportation' } });

    // Click import
    const importButton = screen.getByText(/Import 3 Rows/);
    fireEvent.click(importButton);

    expect(onImport).toHaveBeenCalledTimes(1);
    const importedData = onImport.mock.calls[0][0];

    // First row should have Transportation appended (category column added)
    expect(importedData[0][importedData[0].length - 1]).toBe('Transportation');
    // Other rows get default 'Uncategorized'
    expect(importedData[1][importedData[1].length - 1]).toBe('Uncategorized');
    expect(importedData[2][importedData[2].length - 1]).toBe('Uncategorized');
  });

  // 13. Import button disabled when no valid rows
  test('import button is disabled when no valid rows', () => {
    const csvPreview = makeCSVPreview({
      sampleRows: [
        ['2025-01-01', 'Empty Amount', ''],
        ['2025-01-02', 'Zero Amount', '0'],
      ],
      totalRows: 2,
    });

    render(<CSVPreviewEditor {...defaultProps()} csvPreview={csvPreview} />);

    const importButton = screen.getByText(/Import 0 Rows/).closest('button');
    expect(importButton).toBeDisabled();
  });

  // 14. Close button (X) calls onClose
  test('close button (X icon) calls onClose', () => {
    const onClose = jest.fn();
    render(<CSVPreviewEditor {...defaultProps()} onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 15. Cancel button calls onClose
  test('cancel button calls onClose', () => {
    const onClose = jest.fn();
    render(<CSVPreviewEditor {...defaultProps()} onClose={onClose} />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
