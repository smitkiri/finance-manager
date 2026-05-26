import React from 'react';
import { Logo } from '../Logo';

interface AuthLayoutProps {
  title: string;
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, children }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <Logo className="h-10 w-auto text-gray-900 dark:text-white mb-8" />
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 p-8">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">{title}</h1>
        {children}
      </div>
    </div>
  );
};
