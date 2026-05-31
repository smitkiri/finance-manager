import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ListRow } from './ListRow';

describe('ListRow', () => {
  test('renders primary, amount, meta, and trailing content', () => {
    render(
      <ListRow
        primary="Coffee"
        amount={<span>$4.50</span>}
        meta="May 30 · Food"
        trailing={<span data-testid="chip">work</span>}
      />
    );
    expect(screen.getByText('Coffee')).toBeInTheDocument();
    expect(screen.getByText('$4.50')).toBeInTheDocument();
    expect(screen.getByText('May 30 · Food')).toBeInTheDocument();
    expect(screen.getByTestId('chip')).toBeInTheDocument();
  });

  test('fires onClick when clicked', () => {
    const onClick = jest.fn();
    render(<ListRow primary="Coffee" amount="$4.50" meta="May 30" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('uses ariaLabel for the row when provided', () => {
    render(
      <ListRow
        primary="Coffee"
        amount="$4.50"
        meta="May 30"
        onClick={() => {}}
        ariaLabel="Open Coffee transaction"
      />
    );
    expect(screen.getByRole('button', { name: 'Open Coffee transaction' })).toBeInTheDocument();
  });

  test('activates on Enter', () => {
    const onClick = jest.fn();
    render(<ListRow primary="Coffee" amount="$4.50" meta="May 30" onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
