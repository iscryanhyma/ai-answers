import React, { useEffect, useState } from 'react';
import { GcdsContainer } from '@cdssnc/gcds-components-react';
import DataStoreService from '../services/DataStoreService.js';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';

const SettingsPage = ({ lang = 'en' }) => {
  const { t } = useTranslations(lang);
  const { language } = usePageContext();
  const [status, setStatus] = useState('available');
  const [saving, setSaving] = useState(false);
  const [deploymentMode, setDeploymentMode] = useState('CDS');
  const [savingDeployment, setSavingDeployment] = useState(false);
  const [vectorServiceType, setVectorServiceType] = useState('imvectordb');
  const [savingVectorType, setSavingVectorType] = useState(false);

  // New state for logging chats to database
  const [logChats, setLogChats] = useState('no');
  const [savingLogChats, setSavingLogChats] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const current = await DataStoreService.getSetting('siteStatus', 'available');
      setStatus(current);
      const mode = await DataStoreService.getSetting('deploymentMode', 'CDS');
      setDeploymentMode(mode);
      const type = await DataStoreService.getSetting('vectorServiceType', 'imvectordb');
      setVectorServiceType(type);
  // Load logChats setting
  const logChatsSetting = await DataStoreService.getSetting('logChatsToDatabase', 'no');
  setLogChats(logChatsSetting);
    }
    loadSettings();
  }, []);

  const handleChange = async (e) => {
    const newStatus = e.target.value;
    setStatus(newStatus);
    setSaving(true);
    try {
      await DataStoreService.setSetting('siteStatus', newStatus);
    } finally {
      setSaving(false);
    }
  };

  const handleDeploymentModeChange = async (e) => {
    const newMode = e.target.value;
    setDeploymentMode(newMode);
    setSavingDeployment(true);
    try {
      await DataStoreService.setSetting('deploymentMode', newMode);
    } finally {
      setSavingDeployment(false);
    }
  };

  // Handler for logChats setting
  const handleLogChatsChange = async (e) => {
    const newValue = e.target.value;
    setLogChats(newValue);
    setSavingLogChats(true);
    try {
      await DataStoreService.setSetting('logChatsToDatabase', newValue);
    } finally {
      setSavingLogChats(false);
    }
  };

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('settings.title', 'Settings')}</h1>
      <nav className="mb-400">
        <a href={`/${language}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</a>
      </nav>
      <label htmlFor="site-status" className="mb-200 display-block">
        {t('settings.statusLabel', 'Service status')}
      </label>
      <select id="site-status" value={status} onChange={handleChange} disabled={saving}>
        <option value="available">{t('settings.statuses.available', 'Available')}</option>
        <option value="unavailable">{t('settings.statuses.unavailable', 'Unavailable')}</option>
      </select>

      <label htmlFor="deployment-mode" className="mb-200 display-block mt-400">
        {t('settings.deploymentModeLabel', 'Deployment Mode')}
      </label>
      <select id="deployment-mode" value={deploymentMode} onChange={handleDeploymentModeChange} disabled={savingDeployment}>
        <option value="CDS">{t('settings.deploymentMode.cds', 'CDS (Background worker)')}</option>
  <option value="Vercel">{t('settings.deploymentMode.serverless', 'Serverless (Wait for completion)')}</option>
      </select>

      <label htmlFor="vector-service-type" className="mb-200 display-block mt-400">
        {t('settings.vectorServiceTypeLabel', 'Vector Service Type')}
      </label>
      <select
        id="vector-service-type"
        value={vectorServiceType}
        onChange={async (e) => {
          const newType = e.target.value;
          setSavingVectorType(true);
          setVectorServiceType(newType);
          await DataStoreService.setSetting('vectorServiceType', newType);
          setSavingVectorType(false);
        }}
        disabled={savingVectorType}
      >
        <option value="imvectordb">{t('settings.vectorServiceType.imvectordb', 'IMVectorDB (local)')}</option>
        <option value="documentdb">{t('settings.vectorServiceType.documentdb', 'DocumentDB (AWS)')}</option>
      </select>
      <label htmlFor="log-chats-db" className="mb-200 display-block mt-400">
        {t('settings.logChatsToDatabaseLabel', 'Log chats to database')}
      </label>
      <select
        id="log-chats-db"
        value={logChats}
        onChange={handleLogChatsChange}
        disabled={savingLogChats}
      >
        <option value="yes">{t('common.yes', 'Yes')}</option>
        <option value="no">{t('common.no', 'No')}</option>
      </select>
    </GcdsContainer>
  );
};

export default SettingsPage;
