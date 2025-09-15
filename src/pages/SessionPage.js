import React, { useState, useEffect } from 'react';
import { GcdsContainer, GcdsText, GcdsLink } from '@cdssnc/gcds-components-react';
import DataTable from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { useTranslations } from '../hooks/useTranslations.js';
import { usePageContext } from '../hooks/usePageParam.js';
import { getApiUrl } from '../utils/apiToUrl.js';
import AuthService from '../services/AuthService.js';

DataTable.use(DT);

const SessionPage = ({ lang }) => {
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
        setError(`Failed to load sessions: ${resp.status} ${txt}`);
        setSessions([]);
      } else {
        const json = await resp.json();
        setSessions(json.sessions || []);
      }
    } catch (e) {
      setError(`Error: ${e.message}`);
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

  const { language } = usePageContext();
  return (
    <GcdsContainer size="xl" mainContainer centered tag="main" className="mb-600">
      <h1 className="mb-400">{t('publicEval.sessionsTitle', 'Active sessions')}</h1>
      <nav className="mb-400" aria-label={t('admin.navigation.ariaLabel', 'Admin Navigation')}>
        <GcdsText>
          <GcdsLink href={`/${language}/admin`}>{t('common.backToAdmin', 'Back to Admin')}</GcdsLink>
        </GcdsText>
      </nav>

      {error && <div style={{ color: 'red' }}>{error}</div>}
      {loading && <div>{t('admin.filters.loading', 'Loading...')}</div>}

      <DataTable
        data={sessions}
        columns={[
          { title: t('publicEval.sessions.chatId', 'Chat ID'), data: 'chatId' },
          { title: t('publicEval.sessions.lastSeen', 'Last seen'), data: 'lastSeen', render: (data) => new Date(data).toLocaleString() },
          { title: t('publicEval.sessions.requests', 'Requests'), data: 'requestCount' },
          { title: t('publicEval.sessions.errors', 'Errors'), data: 'errorCount' },
          { title: t('publicEval.sessions.lastLatency', 'Last latency (ms)'), data: 'lastLatencyMs' },
          { title: t('publicEval.sessions.avgLatency', 'Avg latency (ms)'), data: 'avgLatencyMs' }
        ]}
        options={{ paging: true, searching: true, ordering: true }}
      />
    </GcdsContainer>
  );
};

export default SessionPage;
