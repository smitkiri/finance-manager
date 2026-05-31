import React from 'react';
import {
  Menu,
  X,
  BarChart3,
  Receipt,
  FileText,
  Settings,
  TrendingUp,
  LayoutDashboard,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Logo } from './Logo';
import { UserFilter } from './UserFilter';
import { User } from '../types';

interface SidebarTriggerProps {
  isOpen: boolean;
  onToggle: () => void;
}

export const SidebarTrigger: React.FC<SidebarTriggerProps> = ({ isOpen, onToggle }) => (
  <button
    onClick={onToggle}
    className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
    aria-label="Toggle menu"
    aria-expanded={isOpen}
  >
    {isOpen ? <X size={22} /> : <Menu size={22} />}
  </button>
);

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  // Mobile-only props: render UserFilter inside the drawer
  users?: User[];
  selectedUserId?: string | null;
  onUserChange?: (id: string | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onToggle,
  users,
  selectedUserId,
  onUserChange,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: BarChart3 },
    { path: '/transactions', label: 'Transactions', icon: Receipt },
    { path: '/reports', label: 'Reports', icon: FileText },
    { path: '/net-worth', label: 'Net Worth', icon: TrendingUp },
    { path: '/personal-dashboards', label: 'Personal Dashboards', icon: LayoutDashboard },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onToggle} />}
      <div
        className={`fixed left-0 top-0 h-full w-[85vw] max-w-[320px] lg:w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out z-50 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full safe-top">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
            <Logo className="h-7 w-auto text-gray-900 dark:text-white" />
            <button
              onClick={onToggle}
              aria-label="Close menu"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
            >
              <X size={20} />
            </button>
          </div>

          {users && onUserChange !== undefined && (
            <div className="md:hidden p-4 border-b border-gray-200 dark:border-gray-800">
              <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                Filter by user
              </div>
              <UserFilter
                users={users}
                selectedUserId={selectedUserId ?? null}
                onUserChange={(id) => onUserChange(id)}
              />
            </div>
          )}

          <nav className="flex-1 p-4 overflow-y-auto">
            <ul className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  item.path === '/' ? location.pathname === '/' : location.pathname === item.path;
                return (
                  <li key={item.path}>
                    <button
                      onClick={() => {
                        navigate(item.path);
                        onToggle();
                      }}
                      className={`w-full flex items-center space-x-3 px-4 py-3 min-h-[48px] rounded-lg text-left transition-colors ${
                        isActive
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-medium'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <Icon size={20} />
                      <span className="font-medium">{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
};
