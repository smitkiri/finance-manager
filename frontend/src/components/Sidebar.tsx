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

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  // When true, the toggle button sits below the demo banner so it doesn't
  // straddle the banner/header boundary.
  topOffset?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onToggle, topOffset = false }) => {
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
      {/* Hamburger button */}
      <button
        onClick={onToggle}
        className={`fixed left-4 z-50 p-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all ${
          topOffset ? 'top-[52px]' : 'top-4'
        }`}
        aria-label="Toggle menu"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {isOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onToggle} />}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out z-50 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <Logo className="h-7 w-auto text-gray-900 dark:text-white" />
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4">
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
                      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
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
