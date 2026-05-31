import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ApiClient } from '../utils/apiClient';

interface UserMenuProps {
  demoEnabled: boolean;
}

export const UserMenu: React.FC<UserMenuProps> = ({ demoEnabled }) => {
  const { currentUser, setAuth } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (!currentUser) return null;
  const initial = (currentUser.name?.[0] || '?').toUpperCase();

  const handleSignOut = async () => {
    setOpen(false);
    // Best-effort: the backend clears the HttpOnly cookie on /auth/logout.
    // Failure is non-blocking — the UI state reset below is what matters
    // to the in-page experience.
    ApiClient.logout().catch(() => {});
    setAuth(null, null);
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label={currentUser.name}
        title={currentUser.name}
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 rounded-full bg-blue-600 text-white text-sm font-medium flex items-center justify-center hover:bg-blue-700 transition-colors"
      >
        {initial}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 z-50 py-1">
          <div className="px-4 py-2">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {currentUser.name}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {currentUser.email}
            </div>
          </div>
          <div className="border-t border-gray-100 dark:border-gray-800" />
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Settings
          </Link>
          {!demoEnabled && (
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
};
