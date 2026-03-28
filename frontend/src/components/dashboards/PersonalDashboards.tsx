import React, { useState, useEffect, useRef } from 'react';
import { Star, Trash2, Pencil, Plus, LayoutDashboard } from 'lucide-react';
import { Dashboard } from '../../types';
import { LocalStorage } from '../../utils/storage';
import { DashboardView } from './DashboardView';
import { generateId } from '../../utils';
import { toast } from 'react-toastify';

interface PersonalDashboardsProps {
  categories: string[];
  allLabels: string[];
  selectedUserId: string | null;
  dateRange: { start: Date; end: Date };
}

export const PersonalDashboards: React.FC<PersonalDashboardsProps> = ({
  categories,
  allLabels,
  selectedUserId,
  dateRange,
}) => {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const list = await LocalStorage.loadDashboards();
      setDashboards(list);
      if (list.length > 0) {
        const def = list.find((d) => d.isDefault) || list[0];
        setSelectedId(def.id);
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (renamingId && renameInputRef.current) renameInputRef.current.focus();
  }, [renamingId]);

  const selectedDashboard = dashboards.find((d) => d.id === selectedId) || null;

  const handleCreateDashboard = async () => {
    const name = `Dashboard ${dashboards.length + 1}`;
    const created = await LocalStorage.createDashboard({
      id: generateId(),
      name,
      isDefault: dashboards.length === 0,
      dateRangeStart: dateRange.start.toISOString().slice(0, 10),
      dateRangeEnd: dateRange.end.toISOString().slice(0, 10),
    });
    setDashboards((prev) => [...prev, created]);
    setSelectedId(created.id);
  };

  const handleSetDefault = async (id: string) => {
    await LocalStorage.updateDashboard(id, { isDefault: true });
    setDashboards((prev) =>
      prev.map((d) => ({
        ...d,
        isDefault: d.id === id,
      }))
    );
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this dashboard and all its panels?')) return;
    await LocalStorage.deleteDashboard(id);
    const remaining = dashboards.filter((d) => d.id !== id);
    setDashboards(remaining);
    if (selectedId === id) setSelectedId(remaining[0]?.id || null);
    toast.success('Dashboard deleted');
  };

  const handleStartRename = (d: Dashboard) => {
    setRenamingId(d.id);
    setRenameValue(d.name);
  };

  const handleRenameSubmit = async (id: string) => {
    if (!renameValue.trim()) {
      setRenamingId(null);
      return;
    }
    const updated = await LocalStorage.updateDashboard(id, { name: renameValue.trim() });
    setDashboards((prev) => prev.map((d) => (d.id === id ? { ...d, name: updated.name } : d)));
    setRenamingId(null);
  };

  const handleDashboardUpdated = (updated: Dashboard) => {
    setDashboards((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Empty state
  if (dashboards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-4 p-8">
        <LayoutDashboard size={48} className="text-gray-300 dark:text-gray-600" />
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">No dashboards yet</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Create your first dashboard to start visualizing your transactions.
          </p>
        </div>
        <button
          onClick={handleCreateDashboard}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
        >
          <Plus size={16} />
          Create your first dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Dashboard selector header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {/* Dropdown */}
        <select
          value={selectedId || ''}
          onChange={(e) => setSelectedId(e.target.value)}
          className="text-sm font-medium bg-transparent text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {dashboards.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {/* Inline rename */}
        {selectedDashboard &&
          (renamingId === selectedDashboard.id ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRenameSubmit(selectedDashboard.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit(selectedDashboard.id);
                if (e.key === 'Escape') setRenamingId(null);
              }}
              className="text-sm border border-blue-400 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none"
            />
          ) : (
            <button
              onClick={() => handleStartRename(selectedDashboard)}
              className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
              title="Rename dashboard"
            >
              <Pencil size={14} />
            </button>
          ))}

        {/* Set default */}
        {selectedDashboard && (
          <button
            onClick={() => handleSetDefault(selectedDashboard.id)}
            className={`p-1.5 rounded transition-colors ${
              selectedDashboard.isDefault
                ? 'text-yellow-500'
                : 'text-gray-400 hover:text-yellow-500'
            }`}
            title={selectedDashboard.isDefault ? 'Default dashboard' : 'Set as default'}
          >
            <Star size={14} fill={selectedDashboard.isDefault ? 'currentColor' : 'none'} />
          </button>
        )}

        {/* Delete */}
        {selectedDashboard && (
          <button
            onClick={() => handleDelete(selectedDashboard.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 rounded transition-colors"
            title="Delete dashboard"
          >
            <Trash2 size={14} />
          </button>
        )}

        <div className="ml-auto">
          <button
            onClick={handleCreateDashboard}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
          >
            <Plus size={13} />
            New Dashboard
          </button>
        </div>
      </div>

      {/* Dashboard content */}
      {selectedDashboard && (
        <DashboardView
          key={selectedDashboard.id}
          dashboard={selectedDashboard}
          categories={categories}
          allLabels={allLabels}
          selectedUserId={selectedUserId}
          dateRange={dateRange}
          onDashboardUpdated={handleDashboardUpdated}
        />
      )}
    </div>
  );
};
