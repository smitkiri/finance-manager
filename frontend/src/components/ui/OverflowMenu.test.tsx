import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { OverflowMenu } from './OverflowMenu';

const items = [
  { label: 'First', onClick: jest.fn() },
  { label: 'Second', onClick: jest.fn() },
];

describe('OverflowMenu', () => {
  beforeEach(() => {
    items.forEach((i) => (i.onClick as jest.Mock).mockReset());
  });

  test('renders trigger but no items initially', () => {
    render(<OverflowMenu items={items} triggerAriaLabel="More" />);
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });

  test('opens on trigger click and shows items', () => {
    render(<OverflowMenu items={items} triggerAriaLabel="More" />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  test('fires action onClick and closes', () => {
    render(<OverflowMenu items={items} triggerAriaLabel="More" />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByText('First'));
    expect(items[0].onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });

  test('closes on Escape', () => {
    render(<OverflowMenu items={items} triggerAriaLabel="More" />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('First')).not.toBeInTheDocument();
  });

  test('skips items where hidden is true', () => {
    const withHidden = [...items, { label: 'Hidden', onClick: jest.fn(), hidden: true }];
    render(<OverflowMenu items={withHidden} triggerAriaLabel="More" />);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });
});
