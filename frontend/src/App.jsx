import { useCallback, useEffect, useRef, useState } from 'react';
import Keycloak from 'keycloak-js';
import { apiRequest, newIncidents, SessionExpiredError } from './api.js';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: 'aegis',
  clientId: 'aegis-web',
});
let initialization;

const paths = {
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  pulse: <><path d="M3 12h4l3-7 4 14 3-7h4" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  logout: <><path d="M10 17v3H4V4h6v3M14 8l4 4-4 4M8 12h10" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
};

function Icon({ name, size = 18 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function dateTime(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
}

function label(value) {
  return String(value || 'unknown').replace(/[_-]/g, ' ');
}

function Badge({ value, kind = 'severity' }) {
  const normalized = String(value || 'unknown').toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return <span className={`badge ${kind} ${normalized}`}><span className="badge-dot" />{label(value)}</span>;
}

function App() {
  const [auth, setAuth] = useState('loading');
  const [authError, setAuthError] = useState('');
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [report, setReport] = useState('');
  const [alerts, setAlerts] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const seen = useRef(null);
  const alertsRef = useRef(false);
  const selectedRef = useRef(null);
  const detailVersion = useRef(0);
  const overviewVersion = useRef(0);

  useEffect(() => {
    let active = true;
    initialization ||= keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256' });
    initialization.then((authenticated) => {
      if (active) setAuth(authenticated ? 'ready' : 'expired');
    }).catch((error) => {
      if (active) {
        setAuthError(error.message || 'Unable to connect to Keycloak.');
        setAuth('error');
      }
    });
    return () => { active = false; };
  }, []);

  const request = useCallback(async (path, options) => {
    try {
      return await apiRequest(keycloak, path, options);
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        setAuthError(error.message);
        setAuth('expired');
      }
      throw error;
    }
  }, []);

  const loadOverview = useCallback(async () => {
    const version = ++overviewVersion.current;
    try {
      const data = await request('/api/overview');
      if (version !== overviewVersion.current) return;
      if (!data || !Array.isArray(data.incidents)) throw new Error('The overview response is invalid.');
      const result = newIncidents(seen.current, data.incidents);
      seen.current = result.seen;
      if (alertsRef.current && document.visibilityState === 'visible' && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        result.fresh.forEach((incident) => {
          try { new Notification('New AEGIS-ID incident', { body: incident.title || `Incident ${incident.id}` }); } catch { setAlertMessage('Unable to display a browser notification.'); }
        });
      }
      setOverview(data);
      setOverviewError('');
      setLastUpdated(new Date());
    } catch (error) {
      if (version === overviewVersion.current && !(error instanceof SessionExpiredError)) setOverviewError(error.message || 'Unable to load the overview.');
    }
  }, [request]);

  useEffect(() => {
    if (auth !== 'ready') return;
    let active = true;
    let timer;
    const poll = async () => {
      await loadOverview();
      if (active) timer = window.setTimeout(poll, 5000);
    };
    poll();
    return () => { active = false; window.clearTimeout(timer); overviewVersion.current++; };
  }, [auth, loadOverview]);

  const loadDetail = useCallback(async (id) => {
    const version = ++detailVersion.current;
    setDetailLoading(true);
    setDetailError('');
    try {
      const data = await request(`/api/incidents/${encodeURIComponent(id)}`);
      if (version === detailVersion.current) setDetail(data);
    } catch (error) {
      if (version === detailVersion.current && !(error instanceof SessionExpiredError)) setDetailError(error.message || 'Unable to load the incident.');
    } finally {
      if (version === detailVersion.current) setDetailLoading(false);
    }
  }, [request]);

  useEffect(() => {
    selectedRef.current = selectedId;
    setDetail(null);
    setReport('');
    setActionError('');
    if (selectedId !== null && auth === 'ready') loadDetail(selectedId);
    return () => { detailVersion.current++; };
  }, [selectedId, auth, loadDetail]);

  const enableAlerts = async () => {
    if (alerts) {
      alertsRef.current = false;
      setAlerts(false);
      setAlertMessage('Browser alerts are off.');
      return;
    }
    if (typeof Notification === 'undefined') {
      setAlertMessage('Browser notifications are not supported here.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      alertsRef.current = permission === 'granted';
      setAlerts(permission === 'granted');
      setAlertMessage(permission === 'granted' ? 'Alerts enabled while this page is in the foreground.' : 'Notification permission was not granted.');
    } catch {
      setAlertMessage('Could not enable browser notifications.');
    }
  };

  const perform = async (type, operation) => {
    setBusy(type);
    setActionError('');
    try {
      await operation();
    } catch (error) {
      if (!(error instanceof SessionExpiredError)) setActionError(error.message || 'The request failed.');
    } finally {
      setBusy('');
    }
  };

  const simulate = () => perform('simulation', async () => {
    const incident = await request('/api/simulations', { method: 'POST' });
    if (incident?.id !== undefined && incident?.id !== null) setSelectedId(incident.id);
    await loadOverview();
  });

  const changeStatus = () => {
    const id = selectedId;
    const status = String(detail?.status).toLowerCase() === 'contained' ? 'open' : 'contained';
    perform('status', async () => {
      await request(`/api/incidents/${encodeURIComponent(id)}/status`, { method: 'POST', body: { status } });
      await loadOverview();
      if (selectedRef.current === id) await loadDetail(id);
    });
  };

  const submitReport = (event) => {
    event.preventDefault();
    const body = report.trim();
    if (!body) return;
    const id = selectedId;
    perform('report', async () => {
      await request(`/api/incidents/${encodeURIComponent(id)}/reports`, { method: 'POST', body: { body } });
      if (selectedRef.current === id) {
        setReport('');
        await loadDetail(id);
      }
      await loadOverview();
    });
  };

  if (auth !== 'ready') {
    return <main className="auth-screen"><div className="auth-mark"><Icon name="shield" size={30} /></div><h1>AEGIS<span>-ID</span></h1><p>{auth === 'loading' ? 'Connecting to your secure workspace…' : authError || 'Your session has ended.'}</p>{auth !== 'loading' && <button className="button primary" onClick={() => window.location.reload()}>Sign in again <Icon name="arrow" /></button>}</main>;
  }

  const incidents = overview?.incidents || [];
  const openCount = incidents.filter((incident) => String(incident.status).toLowerCase() === 'open').length;
  const containedCount = incidents.filter((incident) => String(incident.status).toLowerCase() === 'contained').length;
  const progress = overview?.progress || {};
  const username = keycloak.tokenParsed?.preferred_username || 'Analyst';
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-icon"><Icon name="shield" size={24} /></div><div><strong>AEGIS<span>-ID</span></strong><small>SECURITY OPERATIONS</small></div></div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation"><a className="nav-item active" href="#overview" aria-current="page"><Icon name="grid" /> Overview <span /></a><a className="nav-item" href="#incidents"><Icon name="pulse" /> Incidents</a></nav>
        <div className="sidebar-bottom"><div className="environment"><span className="environment-dot" /><div><strong>Simulation environment</strong><small>Training mode active</small></div></div><button className="logout" onClick={() => keycloak.logout()}><Icon name="logout" /> Sign out</button></div>
      </aside>
      <div className="main-wrap">
        <header className="topbar"><div className="breadcrumb">WORKSPACE <span>/</span> <strong>OVERVIEW</strong></div><div className="top-actions"><span className="live-indicator"><i /> {overviewError ? 'API UNAVAILABLE' : overview ? 'API CONNECTED' : 'CONNECTING'}</span><button className="avatar" onClick={() => keycloak.logout()} aria-label={`Sign out ${username}`} title="Sign out">{username.charAt(0).toUpperCase()}</button></div></header>
        <main className="content" id="overview">
          <div className="page-heading"><div><div className="eyebrow"><span /> YOUR SECURITY WORKSPACE</div><h1>Operations overview<span className="heading-dot">.</span></h1><p>Stay ahead of threats and sharpen your response.</p></div><div className="heading-actions"><button className={`button secondary ${alerts ? 'enabled' : ''}`} onClick={enableAlerts}><Icon name="bell" /> {alerts ? 'Alerts on' : 'Enable alerts'}</button><button className="button primary" disabled={!!busy} onClick={simulate}><Icon name="plus" /> {busy === 'simulation' ? 'Launching…' : 'Run simulation'}</button></div></div>
          <div className="notice" role="note"><Icon name="shield" size={16} /><span><strong>Training environment.</strong> Traffic is simulated. Browser alerts are foreground only.</span><span className="notice-label">SIMULATION MODE</span></div>
          {alertMessage && <p className="inline-message" role="status">{alertMessage}</p>}
          {overviewError && <div className="error-banner" role="alert">Overview: {overviewError} <button onClick={loadOverview}>Retry</button></div>}
          {actionError && <div className="error-banner" role="alert">{actionError}</div>}
          <div className="section-title"><div><div className="eyebrow">AT A GLANCE</div><h2>Security posture</h2></div><div className="updated"><span /> {lastUpdated ? `Updated ${dateTime(lastUpdated)}` : 'Waiting for data'}</div></div>
          <div className="stats">
            <div className="stat-card"><div className="stat-top"><span>OPEN INCIDENTS</span><div className="stat-icon amber"><Icon name="pulse" /></div></div><div className="stat-number">{overview ? openCount : '—'}</div><div className="stat-caption"><span className="amber-text">●</span> Require your attention</div></div>
            <div className="stat-card"><div className="stat-top"><span>CONTAINED</span><div className="stat-icon green"><Icon name="shield" /></div></div><div className="stat-number">{overview ? containedCount : '—'}</div><div className="stat-caption"><span className="green-text">●</span> Threats under control</div></div>
            <div className="stat-card"><div className="stat-top"><span>REPORTS SUBMITTED</span><div className="stat-icon blue"><Icon name="file" /></div></div><div className="stat-number">{progress.reports ?? '—'}</div><div className="stat-caption">Analyses completed</div></div>
            <div className="stat-card"><div className="stat-top"><span>AVERAGE SCORE</span><div className="stat-icon purple"><Icon name="target" /></div></div><div className="stat-number">{progress.average_score ?? '—'}</div><div className="stat-caption">Level {overview?.level ?? '—'} analyst</div></div>
          </div>
          <div className="work-grid" id="incidents">
            <section className="panel incidents-panel" aria-labelledby="incidents-title"><div className="panel-head"><div><div className="eyebrow">THREAT MONITOR</div><h2 id="incidents-title">Incident queue <span className="count">{incidents.length}</span></h2><p>Investigate and respond to active scenarios.</p></div><span className="live-pill"><i /> LIVE</span></div>
              <div className="table-head"><span>INCIDENT</span><span>SEVERITY</span><span>STATUS</span><span /></div>
              {!overview && !overviewError && <div className="empty">Loading incidents…</div>}
              {overview && incidents.length === 0 && <div className="empty"><div className="empty-icon"><Icon name="shield" size={24} /></div><strong>All clear for now</strong><p>Run a simulation to generate an incident.</p></div>}
              {incidents.map((incident) => <button key={incident.id} className={`incident-row ${String(selectedId) === String(incident.id) ? 'selected' : ''}`} onClick={() => setSelectedId(incident.id)} aria-pressed={String(selectedId) === String(incident.id)}><span className="incident-info"><span className="row-icon"><Icon name="pulse" size={17} /></span><span><strong>{incident.title || `Incident ${incident.id}`}</strong><small>{label(incident.scenario)} <span>·</span> {dateTime(incident.created_at)}</small></span></span><Badge value={incident.severity} /><Badge value={incident.status} kind="status" /><Icon name="chevron" size={16} /></button>)}
              <div className="panel-footer"><span>Showing {incidents.length} incident{incidents.length === 1 ? '' : 's'}</span><span>Auto-refreshes every 5s <Icon name="clock" size={14} /></span></div>
            </section>
            <section className="panel detail-panel" aria-labelledby="detail-title"><div className="panel-head detail-head"><div><div className="eyebrow">INVESTIGATION</div><h2 id="detail-title">Incident details</h2><p>Context for your next move.</p></div><Icon name="target" size={20} /></div>
              {selectedId === null ? <div className="detail-empty"><div className="radar"><Icon name="target" size={32} /></div><h3>Select an incident</h3><p>Choose an incident from the queue to view its timeline and submit an analysis.</p></div> : <>
                {detailLoading && !detail && <div className="empty">Loading incident…</div>}
                {detailError && <div className="error-banner" role="alert">Incident: {detailError} <button onClick={() => loadDetail(selectedId)}>Retry</button></div>}
                {detail && <div className="detail-content"><div className="detail-title"><div><span className="detail-id">INCIDENT #{detail.id}</span><h3>{detail.title}</h3></div><Badge value={detail.severity} /></div><div className="detail-meta"><Badge value={detail.status} kind="status" /><span>{label(detail.scenario)}</span><span>{dateTime(detail.created_at)}</span></div><button className="button secondary status-button" disabled={!!busy} onClick={changeStatus}>{busy === 'status' ? 'Updating…' : String(detail.status).toLowerCase() === 'contained' ? 'Reopen incident' : 'Mark as contained'}</button>
                  <div className="subheading">EVENT TIMELINE <span>{detail.events?.length || 0}</span></div><div className="timeline">{(detail.events || []).length === 0 ? <p className="muted">No events recorded.</p> : detail.events.map((event, index) => <div className="event" key={index}><span className="event-dot" /><div><div className="event-line"><strong>{event.action || 'Event'}</strong><time>{dateTime(event.timestamp)}</time></div><small>{event.source}</small><p>{event.detail}</p></div></div>)}</div>
                  <div className="subheading">ANALYST REPORTS <span>{detail.reports?.length || 0}</span></div><div className="reports">{(detail.reports || []).map((item, index) => <article className="report" key={index}><div className="event-line"><strong>Analysis {index + 1}</strong><time>{dateTime(item.created_at)}</time></div><p>{item.body}</p><small>Score: {item.score ?? '—'}</small>{item.feedback && <p className="feedback">{typeof item.feedback === 'string' ? item.feedback : JSON.stringify(item.feedback)}</p>}</article>)}</div>
                  <form onSubmit={submitReport}><label htmlFor="report">SUBMIT AN ANALYSIS</label><textarea id="report" value={report} onChange={(event) => setReport(event.target.value)} placeholder="Document your findings and response…" rows="4" required /><button className="button primary report-button" type="submit" disabled={!!busy || !report.trim()}>{busy === 'report' ? 'Submitting…' : 'Submit report'} <Icon name="arrow" size={16} /></button></form>
                </div>}
              </>}
            </section>
          </div>
          <footer className="footer"><span>AEGIS-ID <span> / </span> SECURITY OPERATIONS</span><span>Built for better incident response <span>✦</span></span></footer>
        </main>
      </div>
    </div>
  );
}

export default App;
