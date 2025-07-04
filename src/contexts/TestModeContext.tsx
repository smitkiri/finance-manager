import React, { createContext, useContext, useState, useEffect } from 'react';

interface TestModeContextType {
  isTestMode: boolean;
  toggleTestMode: () => void;
  setTestMode: (enabled: boolean) => void;
}

const TestModeContext = createContext<TestModeContextType | undefined>(undefined);

export const useTestMode = () => {
  const context = useContext(TestModeContext);
  if (context === undefined) {
    throw new Error('useTestMode must be used within a TestModeProvider');
  }
  return context;
};

interface TestModeProviderProps {
  children: React.ReactNode;
}

export const TestModeProvider: React.FC<TestModeProviderProps> = ({ children }) => {
  const [isTestMode, setIsTestMode] = useState(() => {
    const saved = localStorage.getItem('testMode');
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem('testMode', JSON.stringify(isTestMode));
    
    // Sync with backend
    fetch('http://localhost:3001/api/test-mode', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isTestMode }),
    }).catch(error => {
      console.error('Error syncing test mode with backend:', error);
    });
  }, [isTestMode]);

  const toggleTestMode = () => {
    setIsTestMode(!isTestMode);
  };

  const setTestMode = (enabled: boolean) => {
    setIsTestMode(enabled);
  };

  return (
    <TestModeContext.Provider value={{ isTestMode, toggleTestMode, setTestMode }}>
      {children}
    </TestModeContext.Provider>
  );
}; 