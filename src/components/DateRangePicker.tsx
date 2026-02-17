import React, { useState } from 'react';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { format, subMonths, subYears, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';

interface DateRange {
  start: Date;
  end: Date;
}

interface DateRangePickerProps {
  onDateRangeChange: (range: DateRange) => void;
  currentRange: DateRange;
}

const quickRanges = [
  { label: '1M', months: 1 },
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1Y', years: 1 },
];

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ onDateRangeChange, currentRange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(currentRange.start);
  const [tempEndDate, setTempEndDate] = useState(currentRange.end);

  const areSameDay = (date1: Date, date2: Date): boolean => {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  };

  const getQuickRange = (months?: number, years?: number): DateRange => {
    const end = new Date();
    let start: Date;
    
    if (years) {
      start = subYears(end, years);
    } else if (months) {
      start = subMonths(end, months);
    } else {
      start = end;
    }
    
    return {
      start: startOfDay(start),
      end: endOfDay(end)
    };
  };

  const handleQuickRange = (months?: number, years?: number) => {
    const range = getQuickRange(months, years);
    onDateRangeChange(range);
    setIsOpen(false);
  };

  const handleMonthSelect = (monthOffset: number) => {
    const now = new Date();
    const targetMonth = subMonths(now, monthOffset);
    const range: DateRange = {
      start: startOfMonth(targetMonth),
      end: endOfMonth(targetMonth)
    };
    onDateRangeChange(range);
    setIsOpen(false);
  };

  const handleCustomRangeApply = () => {
    onDateRangeChange({
      start: startOfDay(tempStartDate),
      end: endOfDay(tempEndDate)
    });
    setIsOpen(false);
  };

  const formatDateRange = (range: DateRange): string => {
    const startStr = format(range.start, 'MMM d, yyyy');
    const endStr = format(range.end, 'MMM d, yyyy');
    
    // Check if it's "since the beginning" (start date is epoch)
    if (range.start.getTime() === 0) {
      return 'Since the Beginning';
    }
    
    // Check if it's a quick range
    const now = new Date();
    const oneMonthAgo = subMonths(now, 1);
    const threeMonthsAgo = subMonths(now, 3);
    const sixMonthsAgo = subMonths(now, 6);
    const oneYearAgo = subYears(now, 1);
    
    // Check for quick ranges
    if (areSameDay(range.start, startOfDay(oneMonthAgo)) && 
        areSameDay(range.end, endOfDay(now))) {
      return 'Last 1 month';
    }
    
    if (areSameDay(range.start, startOfDay(threeMonthsAgo)) && 
        areSameDay(range.end, endOfDay(now))) {
      return 'Last 3 months';
    }
    
    if (areSameDay(range.start, startOfDay(sixMonthsAgo)) && 
        areSameDay(range.end, endOfDay(now))) {
      return 'Last 6 months';
    }
    
    if (areSameDay(range.start, startOfDay(oneYearAgo)) && 
        areSameDay(range.end, endOfDay(now))) {
      return 'Last 1 year';
    }
    
    // Check if it's a single month
    const startMonth = startOfMonth(range.start);
    const endMonth = endOfMonth(range.end);
    if (areSameDay(range.start, startMonth) && 
        areSameDay(range.end, endMonth)) {
      return format(range.start, 'MMMM yyyy');
    }
    
    // Check if it's a single day
    if (startStr === endStr) {
      return startStr;
    }
    
    // Default to date range
    return `${startStr} - ${endStr}`;
  };

  const getCurrentMonthOptions = () => {
    const options = [];
    for (let i = 0; i < 12; i++) {
      const date = subMonths(new Date(), i);
      options.push({
        label: format(date, 'MMMM yyyy'),
        value: i
      });
    }
    return options;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <Calendar size={16} className="text-gray-600 dark:text-gray-400" />
        <span className="text-gray-700 dark:text-gray-300 font-medium">
          {formatDateRange(currentRange)}
        </span>
        <ChevronDown size={16} className="text-gray-600 dark:text-gray-400" />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-0 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 p-6 min-w-80 z-20">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Date Range</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X size={20} />
            </button>
          </div>

          {/* Quick Ranges */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Quick Ranges</h4>
            <div className="grid grid-cols-4 gap-2">
              {quickRanges.map((range) => (
                <button
                  key={range.label}
                  onClick={() => handleQuickRange(range.months, range.years)}
                  className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Month Selection */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Select Month</h4>
            <select
              onChange={(e) => handleMonthSelect(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="">Choose a month...</option>
              {getCurrentMonthOptions().map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Range */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Custom Range</h4>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={format(tempStartDate, 'yyyy-MM-dd')}
                  onChange={(e) => setTempStartDate(new Date(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={format(tempEndDate, 'yyyy-MM-dd')}
                  onChange={(e) => setTempEndDate(new Date(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>
              <button
                onClick={handleCustomRangeApply}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Apply Custom Range
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 