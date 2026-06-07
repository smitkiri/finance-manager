import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { ApiClient } from '../utils/apiClient';
import type { Subscription, SubscriptionStatus, SubscriptionType } from '../types';
import { SubscriptionsHeader } from '../components/subscriptions/SubscriptionsHeader';
import { SubscriptionsFilters } from '../components/subscriptions/SubscriptionsFilters';
import { SubscriptionList } from '../components/subscriptions/SubscriptionList';
import { SubscriptionDetailSheet } from '../components/subscriptions/SubscriptionDetailSheet';

const DEFAULT_STATUS: SubscriptionStatus[] = ['active', 'possibly_cancelled'];

export const SubscriptionsPage: React.FC = () => {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [status, setStatus] = useState<SubscriptionStatus[]>(DEFAULT_STATUS);
  const [type, setType] = useState<SubscriptionType | null>(null);
  const [lastDetectedAt, setLastDetectedAt] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const res = await ApiClient.listSubscriptions({
      status,
      type: type ?? undefined,
    });
    setSubs(res.subscriptions);
    setLastDetectedAt(res.last_detected_at);
  }, [status, type]);

  useEffect(() => {
    void load();
  }, [load]);

  const monthlyBurn = subs
    .filter((s) => s.status === 'active' && s.type === 'expense')
    .reduce((acc, s) => acc + s.monthly_normalized_amount, 0);

  const onDetect = async () => {
    setDetecting(true);
    try {
      await ApiClient.triggerSubscriptionDetection();
      toast.info('Detection queued');
      setTimeout(() => {
        void load();
        setDetecting(false);
      }, 2500);
    } catch {
      setDetecting(false);
      toast.error('Failed to queue detection');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <SubscriptionsHeader
        monthlyBurn={monthlyBurn}
        lastDetectedAt={lastDetectedAt}
        detecting={detecting}
        onDetect={onDetect}
        onAdd={() => setShowAdd(true)}
      />
      <SubscriptionsFilters
        status={status}
        type={type}
        onStatusChange={setStatus}
        onTypeChange={setType}
      />
      <SubscriptionList subscriptions={subs} onSelect={(s) => setSelectedId(s.id)} />
      {selectedId && (
        <SubscriptionDetailSheet
          subscriptionId={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load()}
        />
      )}
      {showAdd && <div className="hidden">add</div>}
    </div>
  );
};
