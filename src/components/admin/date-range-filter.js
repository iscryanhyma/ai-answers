// DateRangeFilter.js
import React, { useState, useEffect } from 'react';

const DateRangeFilter = ({ onDateRangeChange, t, lang = 'en', className = '' }) => {
  // Helper function to format date for datetime-local input
  const formatDateTimeLocal = (date) => {
    const d = new Date(date);
    // Subtract timezone offset to get local time
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  // Default to last 24 hours
  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
    return {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
  };

  const [dateRange, setDateRange] = useState(getDefaultDates());
  const [filterType, setFilterType] = useState('preset');
  const [presetValue, setPresetValue] = useState('1');

  // Preset options
  const presetOptions = [
    { 
      value: '1', 
      label: t('admin.chatLogs.last1Day'), 
      hours: 24 
    },
    { 
      value: '7', 
      label: t('admin.chatLogs.last7Days'), 
      hours: 24 * 7 
    },
    { 
      value: '30', 
      label: t('admin.chatLogs.last30Days'), 
      hours: 24 * 30 
    },
    { 
      value: '60', 
      label: t('admin.chatLogs.last60Days'), 
      hours: 24 * 60 
    },
    { 
      value: '90', 
      label: t('admin.chatLogs.last90Days'), 
      hours: 24 * 90 
    },
    { 
      value: 'all', 
      label: t('admin.chatLogs.allLogs'), 
      hours: null 
    }
  ];

  // Update date range when preset changes
  useEffect(() => {
    if (filterType === 'preset' && presetValue !== 'all') {
      const end = new Date();
      const hours = presetOptions.find(opt => opt.value === presetValue)?.hours;
      if (hours) {
        const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
        const newRange = {
          startDate: formatDateTimeLocal(start),
          endDate: formatDateTimeLocal(end)
        };
        setDateRange(newRange);
        onDateRangeChange({ type: 'preset', value: presetValue, ...newRange });
      }
    }
  }, [filterType, presetValue, onDateRangeChange]);

  // Initialize with default on mount
  useEffect(() => {
    onDateRangeChange({ type: 'preset', value: '1', ...getDefaultDates() });
  }, []);

  const handleDateChange = (field, value) => {
    const newRange = { ...dateRange, [field]: value };
    setDateRange(newRange);
    
    if (filterType === 'custom') {
      onDateRangeChange({ type: 'custom', ...newRange });
    }
  };

  const handlePresetChange = (value) => {
    setPresetValue(value);
    if (value === 'all') {
      onDateRangeChange({ type: 'preset', value: 'all' });
    }
  };

  const handleFilterTypeChange = (type) => {
    setFilterType(type);
    if (type === 'custom') {
      onDateRangeChange({ type: 'custom', ...dateRange });
    } else if (type === 'preset') {
      handlePresetChange(presetValue);
    }
  };

  const quickSetToday = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    
    const newRange = {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
    setDateRange(newRange);
    setFilterType('custom');
    onDateRangeChange({ type: 'custom', ...newRange });
  };

  const quickSetYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const start = new Date(yesterday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(yesterday);
    end.setHours(23, 59, 59, 999);
    
    const newRange = {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
    setDateRange(newRange);
    setFilterType('custom');
    onDateRangeChange({ type: 'custom', ...newRange });
  };

  const quickSetThisWeek = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    
    const newRange = {
      startDate: formatDateTimeLocal(start),
      endDate: formatDateTimeLocal(end)
    };
    setDateRange(newRange);
    setFilterType('custom');
    onDateRangeChange({ type: 'custom', ...newRange });
  };

  return (
    <div className={`bg-white shadow rounded-lg p-4 mb-6 ${className}`}>
      <h2 className="text-lg font-semibold mb-4 text-gray-800">
        {t('admin.dateRange.title')}
      </h2>
      
      {/* Filter Type Toggle */}
      <div className="mb-6">
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-3">
            {t('admin.dateRange.filterType')}
          </legend>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="filter-type"
                value="preset"
                checked={filterType === 'preset'}
                onChange={(e) => handleFilterTypeChange(e.target.value)}
                className="mr-3 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                {t('admin.dateRange.presetRanges')}
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="filter-type"
                value="custom"
                checked={filterType === 'custom'}
                onChange={(e) => handleFilterTypeChange(e.target.value)}
                className="mr-3 w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                {t('admin.dateRange.customRange')}
              </span>
            </label>
          </div>
        </fieldset>
      </div>

      {/* Preset Options */}
      {filterType === 'preset' && (
        <div className="mb-6">
          <label htmlFor="preset-select" className="block text-sm font-medium text-gray-700 mb-2">
            {t('admin.dateRange.chooseRange')}
          </label>
          <select
            id="preset-select"
            value={presetValue}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {presetOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Custom Date Range */}
      {filterType === 'custom' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="start-datetime" className="block text-sm font-medium text-gray-700 mb-2">
                {t('admin.dateRange.startDateTime')}
              </label>
              <input
                type="datetime-local"
                id="start-datetime"
                value={dateRange.startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="end-datetime" className="block text-sm font-medium text-gray-700 mb-2">
                {t('admin.dateRange.endDateTime')}
              </label>
              <input
                type="datetime-local"
                id="end-datetime"
                value={dateRange.endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          {/* Quick Set Buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              onClick={quickSetToday}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('admin.dateRange.today')}
            </button>
            <button
              onClick={quickSetYesterday}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('admin.dateRange.yesterday')}
            </button>
            <button
              onClick={quickSetThisWeek}
              className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {t('admin.dateRange.thisWeek')}
            </button>
          </div>
        </div>
      )}

      {/* Current Selection Display */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          {t('admin.dateRange.currentSelection')}
        </h3>
        <div className="text-sm text-gray-600">
          {filterType === 'preset' && presetValue !== 'all' && (
            <p>
              <strong>{t('admin.dateRange.period')}</strong>{' '}
              {presetOptions.find(opt => opt.value === presetValue)?.label}
            </p>
          )}
          {filterType === 'preset' && presetValue === 'all' && (
            <p>
              <strong>{t('admin.dateRange.period')}</strong>{' '}
              {t('admin.chatLogs.allLogs')}
            </p>
          )}
          {(filterType === 'custom' || (filterType === 'preset' && presetValue !== 'all')) && (
            <div className="space-y-1">
              <p>
                <strong>{t('admin.dateRange.from')}</strong>{' '}
                {new Date(dateRange.startDate + ':00Z').toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
              </p>
              <p>
                <strong>{t('admin.dateRange.to')}</strong>{' '}
                {new Date(dateRange.endDate + ':00Z').toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DateRangeFilter;