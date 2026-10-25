import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SubscriptionMergePicker } from './SubscriptionMergePicker';
import { ApiClient } from '../../utils/apiClient';
import { Subscription } from '../../types';

jest.mock('../../utils/apiClient', () => ({
  ApiClient: { listSubscriptions: jest.fn() },
}));

const sub = (id: string, name: string): Subscription => ({
  id,
  name,
  cadence: 'monthly',
  expected_amount: 20,
  status: 'active',
  first_seen: null,
  last_seen: null,
  detection_signature: null,
  user_overrides: {
    excludedTxnIds: [],
    includedTxnIds: [],
    lockName: false,
    lockAmount: false,
    lockCadence: false,
  },
  member_count: 3,
  monthly_normalized_amount: 20,
  price_change: null,
});

const target = sub('a', 'Claude Ai Subscription');
const other = sub('b', 'Anthropic Claude Sub');

const setup = async () => {
  (ApiClient.listSubscriptions as jest.Mock).mockResolvedValue({
    subscriptions: [target, other, sub('c', 'Netflix')],
    last_detected_at: null,
    total: 3,
  });
  const onMerge = jest.fn();
  render(<SubscriptionMergePicker target={target} onMerge={onMerge} onCancel={jest.fn()} />);
  await screen.findByText('Anthropic Claude Sub');
  return { onMerge };
};

describe('SubscriptionMergePicker', () => {
  test('lists other subscriptions and requires a pick', async () => {
    await setup();
    expect(screen.queryByText('Claude Ai Subscription')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next/ })).toBeDisabled();
  });

  test('merges keeping the target name by default', async () => {
    const { onMerge } = await setup();
    fireEvent.click(screen.getByText('Anthropic Claude Sub'));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(onMerge).toHaveBeenCalledWith(['b'], 'Claude Ai Subscription');
  });

  test('merges with a picked or custom name', async () => {
    const { onMerge } = await setup();
    fireEvent.click(screen.getByText('Anthropic Claude Sub'));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByLabelText('Anthropic Claude Sub'));
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(onMerge).toHaveBeenLastCalledWith(['b'], 'Anthropic Claude Sub');

    fireEvent.change(screen.getByPlaceholderText('Custom name'), {
      target: { value: '  Claude  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Merge' }));
    expect(onMerge).toHaveBeenLastCalledWith(['b'], 'Claude');
  });
});
