import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Sheet } from './Sheet';

describe('Sheet', () => {
  test('renders nothing when closed', () => {
    const { container } = render(
      <Sheet isOpen={false} onClose={() => {}} title="Edit">
        body
      </Sheet>
    );
    expect(container).toBeEmptyDOMElement();
  });

  test('renders title and body when open', () => {
    render(
      <Sheet isOpen={true} onClose={() => {}} title="Edit">
        <span>body content</span>
      </Sheet>
    );
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  test('calls onClose when close button clicked', () => {
    const onClose = jest.fn();
    render(
      <Sheet isOpen={true} onClose={onClose} title="Edit">
        body
      </Sheet>
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls onClose on Escape', () => {
    const onClose = jest.fn();
    render(
      <Sheet isOpen={true} onClose={onClose} title="Edit">
        body
      </Sheet>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('renders footer when provided', () => {
    render(
      <Sheet isOpen={true} onClose={() => {}} title="Edit" footer={<button>Save</button>}>
        body
      </Sheet>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('locks body scroll when open and restores on close', () => {
    const { rerender } = render(
      <Sheet isOpen={true} onClose={() => {}} title="Edit">
        body
      </Sheet>
    );
    expect(document.body.style.overflow).toBe('hidden');
    rerender(
      <Sheet isOpen={false} onClose={() => {}} title="Edit">
        body
      </Sheet>
    );
    expect(document.body.style.overflow).toBe('');
  });
});
