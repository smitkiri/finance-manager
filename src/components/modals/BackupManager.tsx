import React, { useState, useRef } from 'react';
import { Download, Upload, Server, AlertTriangle, Calendar, Loader, CheckCircle, XCircle } from 'lucide-react';
import { DateRange, DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';

type Notification = {
  message: string;
  type: 'success' | 'error';
};

export const BackupManager: React.FC = () => {
  const [backupOption, setBackupOption] = useState<'all' | 'range'>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<Notification | null>(null);

  const handleBackup = async () => {
    setIsLoading(true);
    setNotification(null);
    try {
      let url = 'http://localhost:3001/api/backup';
      if (backupOption === 'range' && dateRange?.from && dateRange?.to) {
        const params = new URLSearchParams({
          dateFrom: dateRange.from.toISOString().split('T')[0],
          dateTo: dateRange.to.toISOString().split('T')[0],
        });
        url += `?${params.toString()}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to download backup.');
      }

      const backupData = await response.json();
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      const date = new Date().toISOString().split('T')[0];
      link.download = `expense-tracker-backup-${date}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);

      setNotification({ message: 'Backup downloaded successfully.', type: 'success' });
    } catch (error) {
      setNotification({ message: 'Error creating backup.', type: 'error' });
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setNotification(null);

    const formData = new FormData();
    formData.append('backupFile', file);

    try {
      const response = await fetch('http://localhost:3001/api/restore', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to restore from backup.');
      }
      
      setNotification({ message: result.message || 'Restore successful!', type: 'success' });
    } catch (error: any) {
      setNotification({ message: error.message, type: 'error' });
      console.error(error);
    } finally {
      setIsLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const NotificationComponent = () => {
    if (!notification) return null;

    const icon = notification.type === 'success' 
      ? <CheckCircle className="text-green-500" /> 
      : <XCircle className="text-red-500" />;

    return (
        <div className={`mt-4 p-3 rounded-lg flex items-center space-x-3 ${notification.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800/50' : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50'}`}>
            {icon}
            <span className={`text-sm ${notification.type === 'success' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
                {notification.message}
            </span>
            <button onClick={() => setNotification(null)} className="ml-auto text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">&times;</button>
        </div>
    );
  };

  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
        <Server size={18} className="mr-2" />
        Backup & Restore
      </h3>
      <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-800">
        {/* Backup Section */}
        <div className="mb-6">
          <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Create Backup</h4>
          <div className="space-y-2 mb-4">
            <div className="flex items-center">
              <input
                type="radio"
                id="backup-all"
                name="backup-option"
                value="all"
                checked={backupOption === 'all'}
                onChange={() => setBackupOption('all')}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <label htmlFor="backup-all" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                Backup all data
              </label>
            </div>
            <div className="flex items-center">
              <input
                type="radio"
                id="backup-range"
                name="backup-option"
                value="range"
                checked={backupOption === 'range'}
                onChange={() => setBackupOption('range')}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <label htmlFor="backup-range" className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300">
                Backup transactions in a specific date range
              </label>
            </div>
          </div>
          {backupOption === 'range' && (
            <div className="relative mb-4">
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="flex items-center justify-between w-full md:w-auto px-3 py-2 text-sm text-left text-gray-700 bg-white border border-gray-300 rounded-md dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Calendar className="w-4 h-4 mr-2" />
                {dateRange?.from && dateRange?.to
                  ? `${dateRange.from.toLocaleDateString()} - ${dateRange.to.toLocaleDateString()}`
                  : 'Select Date Range'}
              </button>
              {showDatePicker && (
                <div className="absolute z-10 top-full mt-2 bg-white dark:bg-gray-900 border rounded-lg shadow-lg">
                  <DayPicker
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => {
                      setDateRange(range);
                      if (range?.from && range?.to) {
                        setShowDatePicker(false);
                      }
                    }}
                    numberOfMonths={2}
                  />
                </div>
              )}
            </div>
          )}
          <button
            onClick={handleBackup}
            disabled={isLoading || (backupOption === 'range' && (!dateRange?.from || !dateRange?.to))}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading && backupOption === 'all' ? <Loader size={16} className="animate-spin" /> : <Download size={16} />}
            <span>{isLoading && backupOption === 'all' ? 'Backing up...' : 'Download Backup'}</span>
          </button>
        </div>

        {/* Restore Section */}
        <div>
          <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">Restore from Backup</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Restore data from a JSON backup file.
          </p>
          <div className="flex items-center space-x-3">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleRestore}
                className="hidden"
                accept="application/json"
                disabled={isLoading}
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isLoading ? <Loader size={16} className="animate-spin" /> : <Upload size={16} />}
                <span>{isLoading ? 'Restoring...' : 'Choose Backup File'}</span>
            </button>
          </div>
          <NotificationComponent />
          <div className="mt-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800/50">
                <div className="flex items-start">
                    <AlertTriangle size={18} className="text-yellow-500 dark:text-yellow-400 mr-3 mt-0.5" />
                    <div>
                        <h5 className="font-semibold text-yellow-800 dark:text-yellow-300">Important</h5>
                        <p className="text-sm text-yellow-700 dark:text-yellow-200">
                            Restoring from a backup will add to your existing data. It will not overwrite or delete current data. The process automatically skips duplicates.
                        </p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
