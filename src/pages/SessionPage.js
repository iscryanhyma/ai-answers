import React, { useState, useEffect } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from '../services/AuthService.js';

DataTable.use(DT);

const SessionPage = ({ lang: propLang }) => {
  const { language } = usePageContext();
  const lang = propLang || language || 'en';
  const { t } = useTranslations(lang);
  const [sessions, setSessions] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    setError('');
    try {
      const url = getApiUrl('chat-session-metrics');
      const resp = await fetch(url, { headers: { ...AuthService.getAuthHeader(), Accept: 'application/json' } });
      if (!resp.ok) {
        const txt = await resp.text();
        setError(t('session.errorLoading', 'Failed to load sessions: {status} {text}', { status: resp.status, text: txt }));
        setSessions([]);
      } else {
        const json = await resp.json();
        setSessions(json.sessions || []);
      }
    } catch (e) {
      setError(t('session.errorGeneric', 'Error: {message}', { message: e.message }));
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const iv = setInterval(fetchSessions, 5000);
    return () => clearInterval(iv);
  }, []);

  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
  <h1 className="mb-400">{t('session.title', 'Sessions')}</h1>
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'Admin Navigation')}>
        <GcdsText>
          <GcdsLink href={`/${lang}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</GcdsLink>
        </GcdsText>
      </nav>

  {error && <div style={{ color: 'red' }}>{error}</div>}
  {loading && <div>{t('admin.filters.loading', 'Loading...')}</div>}

      <DataTable
        data={sessions}
        columns={[
          { title: t('admin.session.chatId', 'Chat ID'), data: 'chatId' },
          { title: t('admin.session.lastSeen', 'Last seen'), data: 'lastSeen', render: (data) => new Date(data).toLocaleString() },
          { title: t('admin.session.requests', 'Requests'), data: 'requestCount' },
          { title: t('admin.session.errors', 'Errors'), data: 'errorCount' },
          { title: t('admin.session.lastLatency', 'Last latency (ms)'), data: 'lastLatencyMs' },
          { title: t('admin.session.avgLatency', 'Avg latency (ms)'), data: 'avgLatencyMs' }
        ]}
        options={{ paging: true, searching: true, ordering: true }}
      />
    </GcdsContainer>
  );
};

export default SessionPage;
