import React, { createContext, useContext, useState, useCallback } from 'react';
import { AuthUser, AuthHousehold } from '../utils/apiClient';

interface AuthContextType {
  currentUser: AuthUser | null;
  currentHousehold: AuthHousehold | null;
  setAuth: (user: AuthUser | null, household: AuthHousehold | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [currentHousehold, setCurrentHousehold] = useState<AuthHousehold | null>(null);

  const setAuth = useCallback((user: AuthUser | null, household: AuthHousehold | null) => {
    setCurrentUser(user);
    setCurrentHousehold(household);
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, currentHousehold, setAuth }}>
      {children}
    </AuthContext.Provider>
  );
};
