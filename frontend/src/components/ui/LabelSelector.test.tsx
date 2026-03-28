import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { LabelSelector } from './LabelSelector';

const defaultProps = {
  isOpen: true,
  onClose: jest.fn(),
  onAddLabel: jest.fn(),
  existingLabels: [] as string[],
  allLabels: ['Food', 'Travel', 'Shopping', 'Entertainment', 'Utilities', 'Health', 'Rent'],
  maxLabels: 5,
  position: { x: 100, y: 200 },
};

function renderSelector(overrides: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(<LabelSelector {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('LabelSelector', () => {
  // 1. Returns null when isOpen is false
  test('returns null when isOpen is false', () => {
    const { container } = renderSelector({ isOpen: false });
    expect(container.innerHTML).toBe('');
  });

  // 2. Returns null when existingLabels.length >= maxLabels
  test('returns null when existingLabels.length >= maxLabels', () => {
    const { container } = renderSelector({
      existingLabels: ['a', 'b', 'c', 'd', 'e'],
      maxLabels: 5,
    });
    expect(container.innerHTML).toBe('');
  });

  test('returns null when existingLabels exceed maxLabels', () => {
    const { container } = renderSelector({
      existingLabels: ['a', 'b', 'c', 'd', 'e', 'f'],
      maxLabels: 5,
    });
    expect(container.innerHTML).toBe('');
  });

  // 3. Renders when isOpen is true and under maxLabels
  test('renders when isOpen is true and under maxLabels', () => {
    renderSelector();
    expect(screen.getByText('Add Label')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Type to search or create new label...')
    ).toBeInTheDocument();
  });

  // 4. Shows recently used labels (first 2 from allLabels) when search is empty
  test('shows first 2 labels from allLabels as suggestions when search is empty', () => {
    renderSelector();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Travel')).toBeInTheDocument();
    expect(screen.queryByText('Shopping')).not.toBeInTheDocument();
  });

  // 5. Excludes existingLabels from suggestions
  test('excludes existingLabels from suggestions', () => {
    renderSelector({ existingLabels: ['Food'] });
    // Food is excluded, so the first 2 non-existing are Travel and Shopping
    expect(screen.queryByText('Food')).not.toBeInTheDocument();
    expect(screen.getByText('Travel')).toBeInTheDocument();
    expect(screen.getByText('Shopping')).toBeInTheDocument();
  });

  // 6. Filters labels by search term (case-insensitive)
  test('filters labels by search term case-insensitively', () => {
    renderSelector();
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    fireEvent.change(input, { target: { value: 'ent' } });
    expect(screen.getByText('Entertainment')).toBeInTheDocument();
    expect(screen.getByText('Rent')).toBeInTheDocument();
    expect(screen.queryByText('Food')).not.toBeInTheDocument();
  });

  test('filters labels case-insensitively with uppercase search', () => {
    renderSelector();
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    fireEvent.change(input, { target: { value: 'FOOD' } });
    expect(screen.getByText('Food')).toBeInTheDocument();
  });

  // 7. Limits filtered results to 5
  test('limits filtered results to 5', () => {
    const manyLabels = Array.from({ length: 10 }, (_, i) => `Label${i}`);
    renderSelector({ allLabels: manyLabels });
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    fireEvent.change(input, { target: { value: 'Label' } });
    const buttons = screen
      .getAllByRole('button')
      .filter((btn) => btn.textContent && btn.textContent.startsWith('Label'));
    expect(buttons.length).toBe(5);
  });

  // 8. Clicking a label calls onAddLabel and onClose
  test('clicking a label calls onAddLabel and onClose', () => {
    const onAddLabel = jest.fn();
    const onClose = jest.fn();
    renderSelector({ onAddLabel, onClose });
    fireEvent.click(screen.getByText('Food'));
    expect(onAddLabel).toHaveBeenCalledWith('Food');
    expect(onClose).toHaveBeenCalled();
  });

  // 9. Pressing Enter creates a new label
  test('pressing Enter creates a new label from search term', () => {
    const onAddLabel = jest.fn();
    const onClose = jest.fn();
    renderSelector({ onAddLabel, onClose });
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    fireEvent.change(input, { target: { value: 'NewLabel' } });
    fireEvent.submit(input.closest('form')!);
    expect(onAddLabel).toHaveBeenCalledWith('NewLabel');
    expect(onClose).toHaveBeenCalled();
  });

  test('pressing Enter trims whitespace from search term', () => {
    const onAddLabel = jest.fn();
    renderSelector({ onAddLabel });
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    fireEvent.change(input, { target: { value: '  Trimmed  ' } });
    fireEvent.submit(input.closest('form')!);
    expect(onAddLabel).toHaveBeenCalledWith('Trimmed');
  });

  test('pressing Enter with empty input does nothing', () => {
    const onAddLabel = jest.fn();
    const onClose = jest.fn();
    renderSelector({ onAddLabel, onClose });
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    fireEvent.submit(input.closest('form')!);
    expect(onAddLabel).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // 10. Does not add duplicate labels (already in existingLabels)
  test('does not add duplicate label via Enter if already in existingLabels', () => {
    const onAddLabel = jest.fn();
    const onClose = jest.fn();
    renderSelector({ onAddLabel, onClose, existingLabels: ['Food'] });
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    fireEvent.change(input, { target: { value: 'Food' } });
    fireEvent.submit(input.closest('form')!);
    expect(onAddLabel).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('excludes existingLabels from filtered search results', () => {
    renderSelector({ existingLabels: ['Food'] });
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    fireEvent.change(input, { target: { value: 'Food' } });
    // Food should not appear as a clickable suggestion
    expect(screen.queryByRole('button', { name: /Food/ })).not.toBeInTheDocument();
  });

  // 11. Pressing Escape calls onClose
  test('pressing Escape calls onClose', () => {
    const onClose = jest.fn();
    renderSelector({ onClose });
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  // 12. Clicking backdrop calls onClose
  test('clicking the backdrop calls onClose', () => {
    const onClose = jest.fn();
    renderSelector({ onClose });
    // The backdrop is the first child div with class "fixed inset-0 z-40"
    const backdrop = document.querySelector('.fixed.inset-0.z-40') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  // 13. Shows "Press Enter to create" message when no matches found
  test('shows "Press Enter to create" message when search has no matches', () => {
    renderSelector();
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    fireEvent.change(input, { target: { value: 'nonexistent' } });
    expect(screen.getByText(/Press Enter to create/)).toBeInTheDocument();
    expect(screen.getByText(/nonexistent/)).toBeInTheDocument();
  });

  // 14. Shows "No labels available" when no labels and no search
  test('shows "No labels available" when allLabels is empty and no search', () => {
    renderSelector({ allLabels: [] });
    expect(screen.getByText('No labels available')).toBeInTheDocument();
  });

  test('shows "No labels available" when all labels are already existing', () => {
    renderSelector({ allLabels: ['Food', 'Travel'], existingLabels: ['Food', 'Travel'] });
    expect(screen.getByText('No labels available')).toBeInTheDocument();
  });

  // 15. Input auto-focuses when opened
  test('input auto-focuses when opened', () => {
    renderSelector();
    const input = screen.getByPlaceholderText('Type to search or create new label...');
    expect(document.activeElement).toBe(input);
  });
});
