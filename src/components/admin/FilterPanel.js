// FilterPanel.js
import React, { useState } from 'react';
import { DateRange } from 'react-date-range';
import { format } from 'date-fns';
import { enCA, frCA } from 'date-fns/locale';
import { useTranslations } from '../../hooks/useTranslations.js';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';

const FilterPanel = ({ onApplyFilters, onClearFilters, isVisible = false }) => {
  const { t } = useTranslations();
  const [dateRange, setDateRange] = useState([
    {
      startDate: new Date(),
      endDate: new Date(),
      key: 'selection'
    }
  ]);
  const [department, setDepartment] = useState('');
  const [referringUrl, setReferringUrl] = useState('');

  const handleApply = () => {
    const filters = {
      dateRange: {
        startDate: dateRange[0].startDate,
        endDate: dateRange[0].endDate
      },
      department,
      referringUrl
    };
    onApplyFilters(filters);
  };

  const handleClear = () => {
    setDateRange([
      {
        startDate: new Date(),
        endDate: new Date(),
        key: 'selection'
      }
    ]);
    setDepartment('');
    setReferringUrl('');
    onClearFilters();
  };

  const formatDate = (date) => {
    const locale = t('locale') === 'fr' ? frCA : enCA;
    return format(date, 'MMM dd, yyyy', { locale });
  };

  if (!isVisible) return null;

  return (
    <details className="filter-panel" open>
      <summary className="filter-panel-summary">
        {t('admin.filters.title')}
      </summary>
      <div className="filter-panel-content">
        <div className="filter-grid">
          <div className="filter-row">
            <label htmlFor="date-range" className="filter-label">
              {t('admin.filters.dateRange')}
            </label>
            <div className="filter-field">
              <DateRange
                ranges={dateRange}
                onChange={setDateRange}
                locale={t('locale') === 'fr' ? frCA : enCA}
                showSelectionPreview={true}
                moveRangeOnFirstSelection={false}
                months={1}
                direction="horizontal"
                className="date-range-picker"
              />
            </div>
          </div>

          <div className="filter-row">
            <label htmlFor="department" className="filter-label">
              {t('admin.filters.department')}
            </label>
            <div className="filter-field">
              <select
                id="department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="filter-select"
              >
                <option value="">{t('admin.filters.allDepartments')}</option>
                {/* TODO: Add departments with scenarios files */}
              </select>
            </div>
          </div>

          <div className="filter-row">
            <label htmlFor="referring-url" className="filter-label">
              {t('admin.filters.referringUrl')}
            </label>
            <div className="filter-field">
              <input
                type="text"
                id="referring-url"
                value={referringUrl}
                onChange={(e) => setReferringUrl(e.target.value)}
                placeholder={t('admin.filters.referringUrlPlaceholder')}
                className="filter-input"
              />
            </div>
          </div>
        </div>

        <div className="filter-actions">
          <button
            type="button"
            onClick={handleApply}
            className="filter-button filter-button-primary"
          >
            {t('admin.filters.apply')}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="filter-button filter-button-secondary"
          >
            {t('admin.filters.clearAll')}
          </button>
        </div>
      </div>
    </details>
  );
};

export default FilterPanel; 