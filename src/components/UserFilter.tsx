import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, User } from 'lucide-react';
import { User as UserType } from '../types';

interface UserFilterProps {
  users: UserType[];
  selectedUserId: string | null;
  onUserChange: (userId: string | null) => void;
}

export const UserFilter: React.FC<UserFilterProps> = ({
  users,
  selectedUserId,
  onUserChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getSelectedUserText = () => {
    if (selectedUserId === null) {
      return 'All Users';
    }
    const user = users.find(u => u.id === selectedUserId);
    return user ? user.name : 'All Users';
  };

  const handleUserSelect = (userId: string | null) => {
    onUserChange(userId);
    setIsOpen(false);
  };

  if (users.length === 0) {
    return (
      <div className="relative">
        <button
          disabled
          className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg cursor-not-allowed"
        >
          <User size={16} />
          <span>No Users</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-lg"
      >
        <User size={16} />
        <span>{getSelectedUserText()}</span>
        <ChevronDown 
          size={14} 
          className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 z-50">
          <div className="py-1">
            <button
              onClick={() => handleUserSelect(null)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                selectedUserId === null 
                  ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              All Users
            </button>
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => handleUserSelect(user.id)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                  selectedUserId === user.id 
                    ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                {user.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}; 