import React, { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Dashboard, DashboardPanel as DashboardPanelType, PanelMonthData } from '../../types';
import { ApiClient } from '../../utils/apiClient';
import { DashboardPanel } from './DashboardPanel';
import { PanelEditor } from './PanelEditor';
import { PanelTransactionsModal } from './PanelTransactionsModal';

// Sortable wrapper for each panel
const SortablePanel: React.FC<{
  panel: DashboardPanelType;
  data: PanelMonthData[];
  loading: boolean;
  onEdit: (p: DashboardPanelType) => void;
  onDelete: (id: string) => void;
  onViewTransactions: (p: DashboardPanelType) => void;
}> = ({ panel, data, loading, onEdit, onDelete, onViewTransactions }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: panel.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: 'grab',
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <DashboardPanel
        panel={panel}
        data={data}
        loading={loading}
        onEdit={onEdit}
        onDelete={onDelete}
        onViewTransactions={onViewTransactions}
      />
    </div>
  );
};

interface DashboardViewProps {
  dashboard: Dashboard;
  categories: string[];
  allLabels: string[];
  selectedUserId: string | null;
  dateRange: { start: Date; end: Date };
  onDashboardUpdated: (d: Dashboard) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dashboard,
  categories,
  allLabels,
  selectedUserId,
  dateRange,
  onDashboardUpdated,
}) => {
  const [panels, setPanels] = useState<DashboardPanelType[]>([]);
  const [panelDataMap, setPanelDataMap] = useState<Record<string, PanelMonthData[]>>({});
  const [dataLoading, setDataLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<DashboardPanelType | null>(null);
  const [viewingTransactionsPanel, setViewingTransactionsPanel] =
    useState<DashboardPanelType | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load panels list (not data) — only when dashboard changes
  useEffect(() => {
    // Panels come embedded in the data response; seed from empty until first fetch
    setPanels([]);
    setPanelDataMap({});
  }, [dashboard.id]);

  // Fetch batched panel data
  const fetchData = useCallback(async () => {
    setDataLoading(true);
    const results = await ApiClient.loadDashboardData(dashboard.id, {
      userId: selectedUserId,
      dateRangeStart: dateRange.start.toISOString().slice(0, 10),
      dateRangeEnd: dateRange.end.toISOString().slice(0, 10),
    });
    const map: Record<string, PanelMonthData[]> = {};
    results.forEach((r) => {
      map[r.panelId] = r.data;
    });
    setPanelDataMap(map);
    setDataLoading(false);
  }, [dashboard.id, selectedUserId, dateRange]);

  // Load panel configs on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await ApiClient.loadPanels(dashboard.id);
        if (!cancelled) setPanels(data);
      } catch {
        /* ignore */
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [dashboard.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = panels.findIndex((p) => p.id === active.id);
    const newIndex = panels.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(panels, oldIndex, newIndex);
    setPanels(reordered); // optimistic update
    await ApiClient.reorderPanels(
      dashboard.id,
      reordered.map((p) => p.id)
    );
  };

  const handlePanelSaved = async (saved: DashboardPanelType) => {
    setPanels((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
    setEditorOpen(false);
    setEditingPanel(null);
    await fetchData(); // refresh chart data for updated panel
  };

  const handleDeletePanel = async (panelId: string) => {
    if (!window.confirm('Delete this panel?')) return;
    await ApiClient.deletePanel(panelId);
    setPanels((prev) => prev.filter((p) => p.id !== panelId));
    setPanelDataMap((prev) => {
      const n = { ...prev };
      delete n[panelId];
      return n;
    });
  };

  const panelLimitReached = panels.length >= 15;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      {/* Toolbar */}
      <div className="flex items-center justify-end mb-4 md:mb-6">
        <button
          onClick={() => {
            setEditingPanel(null);
            setEditorOpen(true);
          }}
          disabled={panelLimitReached}
          title={panelLimitReached ? 'Maximum of 15 panels reached' : 'Add panel'}
          className="w-full md:w-auto flex items-center justify-center gap-2 px-4 min-h-[44px] md:min-h-0 md:py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus size={16} />
          Add Panel
        </button>
      </div>

      {/* Panel grid */}
      {panels.length === 0 && !dataLoading ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
          <p className="text-sm">No panels yet.</p>
          <button
            onClick={() => {
              setEditingPanel(null);
              setEditorOpen(true);
            }}
            className="mt-3 text-sm text-blue-500 hover:underline"
          >
            Add your first panel
          </button>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={panels.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {panels.map((panel) => (
                <SortablePanel
                  key={panel.id}
                  panel={panel}
                  data={panelDataMap[panel.id] || []}
                  loading={dataLoading}
                  onEdit={(p) => {
                    setEditingPanel(p);
                    setEditorOpen(true);
                  }}
                  onDelete={handleDeletePanel}
                  onViewTransactions={(p) => setViewingTransactionsPanel(p)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Full-page panel editor */}
      {editorOpen && (
        <PanelEditor
          dashboard={dashboard}
          panel={editingPanel}
          categories={categories}
          allLabels={allLabels}
          selectedUserId={selectedUserId}
          dateRange={dateRange}
          onSave={handlePanelSaved}
          onCancel={() => {
            setEditorOpen(false);
            setEditingPanel(null);
          }}
        />
      )}

      {/* Panel transactions modal */}
      {viewingTransactionsPanel && (
        <PanelTransactionsModal
          panel={viewingTransactionsPanel}
          dashboard={dashboard}
          dateRange={dateRange}
          selectedUserId={selectedUserId}
          onClose={() => setViewingTransactionsPanel(null)}
        />
      )}
    </div>
  );
};
