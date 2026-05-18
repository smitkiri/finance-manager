import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DemoBanner } from './DemoBanner';

const STORAGE_KEY = 'demoBannerDismissed';

beforeEach(() => {
  localStorage.clear();
});

test('renders banner text when enabled', () => {
  render(<DemoBanner enabled={true} />);
  expect(screen.getByText(/demo mode/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /github/i })).toBeInTheDocument();
});

test('renders nothing when disabled', () => {
  const { container } = render(<DemoBanner enabled={false} />);
  expect(container).toBeEmptyDOMElement();
});

test('dismiss hides banner and persists', () => {
  const { rerender, container } = render(<DemoBanner enabled={true} />);
  fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
  expect(container).toBeEmptyDOMElement();
  expect(localStorage.getItem(STORAGE_KEY)).toBe('true');

  // Remount: still dismissed
  rerender(<DemoBanner enabled={true} />);
  expect(container).toBeEmptyDOMElement();
});
