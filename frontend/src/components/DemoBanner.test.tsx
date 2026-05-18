import React from 'react';
import { render, screen } from '@testing-library/react';
import { DemoBanner } from './DemoBanner';

test('renders banner text when enabled', () => {
  render(<DemoBanner enabled={true} />);
  expect(screen.getByText(/demo mode/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /github/i })).toBeInTheDocument();
});

test('renders nothing when disabled', () => {
  const { container } = render(<DemoBanner enabled={false} />);
  expect(container).toBeEmptyDOMElement();
});
