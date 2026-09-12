'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings2,
  TriangleAlert,
  X,
} from 'lucide-react';
import BrandMark from '@/components/brand-mark';
import Comparison from '@/components/comparison';
import Overview from '@/components/overview';
import PartExplorer from '@/components/part-explorer';
import PeriodPicker from '@/components/period-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  browserConnection,
  browserSnapshot,
  isStaticApp,
  saveBrowserConnection,
  saveBrowserSnapshot,
} from '@/lib/client-store';
import { demoSnapshot } from '@/lib/demo';
import { scopeBranches } from '@/lib/explore';
import { restorePeriod, validDate, validRange, type Snapshot } from '@/lib/model';
import { normalize, type RawPayload } from '@/lib/normalize';

type Tab = 'overview' | 'dynamics' | 'ads';
const TITLES: Record<Tab, string> = {
  overview: 'Обзор недели',
  dynamics: 'Динамика',
  ads: 'Объявления',
};
const ACTIVE_BRANCHES = ['И31', 'Х7', 'Автово', 'Б116', 'Ворошилова'];

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [branch, setBranch] = useState('И31');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [scriptUrl, setScriptUrl] = useState('');
  const [token, setToken] = useState('');
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [settingNotice, setSettingNotice] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('pik-sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });

  function applySnapshot(value: Snapshot, initial = false) {
    if (
      value.version !== 1 ||
      !Array.isArray(value.stats) ||
      !Array.isArray(value.ads) ||
      !Array.isArray(value.issues)
    ) {
      throw new Error('Сохранённые данные повреждены. Обновите их из таблиц.');
    }
    if (!value.stats.length || value.stats.some((row) => !validDate(row.end))) {
      throw new Error('В статистике нет корректных отчётных недель.');
    }
    setSnapshot(value);
    setLoadError('');
    if (!initial) return;
    const dates = value.stats.map((row) => row.end).sort();
    const min = dates[0];
    const max = dates.at(-1)!;
    let saved: { branch?: string; from?: string; to?: string; tab?: string } = {};
    try {
      const parsed = JSON.parse(localStorage.getItem('pik-filters') ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed;
    } catch {
      /* Defaults are safe. */
    }
    const restored = restorePeriod(saved, min, max);
    setFrom(restored.from);
    setTo(restored.to);
    if (saved.branch && ACTIVE_BRANCHES.includes(saved.branch)) setBranch(saved.branch);
    if (saved.tab === 'overview' || saved.tab === 'dynamics' || saved.tab === 'ads') {
      setTab(saved.tab);
    }
    if (restored.reset) {
      setNotice('Сохранённый период был вне доступной истории и восстановлен.');
    }
  }

  async function load(initial = false) {
    if (isStaticApp()) {
      const saved = await browserSnapshot().catch(() => null);
      applySnapshot(saved ?? demoSnapshot(), initial);
      return;
    }
    let response = await fetch('/api/snapshot', { cache: 'no-store' });
    if (!response.ok && process.env.NODE_ENV === 'development') {
      response = await fetch('/data/snapshot.json', { cache: 'no-store' });
    }
    if (!response.ok) {
      throw new Error('Данные ещё не загружены. Подключите таблицы и нажмите «Обновить».');
    }
    applySnapshot((await response.json()) as Snapshot, initial);
  }

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Loading persisted external state is intentional.
    load(true).catch((error) => {
      setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить данные.');
    });
    if (isStaticApp()) {
      const connection = browserConnection();
      queueMicrotask(() => {
        setConfigured(Boolean(connection.url && connection.token));
        if (connection.url) setScriptUrl(connection.url);
      });
    } else {
      fetch('/api/settings')
        .then((response) => response.json() as Promise<{ configured: boolean; url?: string }>)
        .then((value) => {
          setConfigured(Boolean(value.configured));
          if (value.url) setScriptUrl(value.url);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!validRange(from, to)) return;
    try {
      localStorage.setItem('pik-filters', JSON.stringify({ branch, from, to, tab }));
    } catch {
      /* Device preferences are optional. */
    }
  }, [branch, from, to, tab]);

  useEffect(() => {
    try {
      localStorage.setItem('pik-sidebar-collapsed', String(sidebarCollapsed));
    } catch {
      /* Device preferences are optional. */
    }
  }, [sidebarCollapsed]);

  const bounds = useMemo(() => {
    const dates = snapshot?.stats.map((row) => row.end).sort() ?? [];
    return { min: dates[0] ?? '', max: dates.at(-1) ?? '' };
  }, [snapshot]);
  const relevantIssues =
    snapshot?.issues.filter(
      (issue) =>
        (!issue.branch || scopeBranches(branch).includes(issue.branch)) &&
        (!issue.end || (issue.end >= from && issue.end <= to)),
    ) ?? [];

  async function refresh() {
    if (!configured) {
      setShowSettings(true);
      return;
    }
    setBusy(true);
    setNotice('Читаем таблицы и проверяем новую неделю…');
    try {
      if (isStaticApp()) {
        const connection = browserConnection();
        if (!connection.url || !connection.token) {
          throw new Error('Сначала сохраните подключение.');
        }
        const response = await fetch(connection.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ token: connection.token }),
          redirect: 'follow',
        });
        if (!response.ok) throw new Error('Источник данных не ответил.');
        const raw = (await response.json()) as RawPayload & { error?: string };
        if (raw.error) throw new Error(raw.error);
        const next = normalize(raw, 'google');
        const errors = next.issues.filter((issue) => issue.severity === 'error');
        if (errors.length) {
          throw new Error(`Новая версия не сохранена: ${errors.length} строк требуют проверки.`);
        }
        await saveBrowserSnapshot(next);
        applySnapshot(next);
        setNotice(`Готово. Загружено ${next.ads.length.toLocaleString('ru-RU')} записей.`);
      } else {
        const response = await fetch('/api/refresh', { method: 'POST' });
        const result = (await response.json()) as { error?: string; rows?: number };
        if (!response.ok) throw new Error(result.error ?? 'Не удалось обновить данные.');
        await load();
        setNotice(`Готово. Загружено ${(result.rows ?? 0).toLocaleString('ru-RU')} записей.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ошибка обновления.';
      setNotice(`${message} Предыдущая версия сохранена.`);
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    setBusy(true);
    setSettingNotice('');
    try {
      if (isStaticApp()) {
        const url = scriptUrl.trim();
        const secret = token.trim();
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
          throw new Error('Нужна ссылка Apps Script, заканчивающаяся на /exec.');
        }
        if (secret.length < 24) throw new Error('Введите ключ SYNC_TOKEN.');
        saveBrowserConnection(url, secret);
        setConfigured(true);
        setToken('');
        setSettingNotice('Подключение сохранено.');
      } else {
        const response = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: scriptUrl.trim(), token: token.trim() }),
        });
        const result = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(result.error ?? 'Не удалось сохранить подключение.');
        setConfigured(true);
        setToken('');
        setSettingNotice('Подключение сохранено.');
      }
    } catch (error) {
      setSettingNotice(error instanceof Error ? error.message : 'Ошибка сохранения.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
        <button className="brand" onClick={() => setTab('overview')}>
          <BrandMark size={40} />
          <span><strong>ПИК</strong><small>АНАЛИТИКА АВИТО</small></span>
        </button>
        <nav aria-label="Разделы">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>
            <BarChart3 /><span>Обзор недели</span>
          </button>
          <button className={tab === 'dynamics' ? 'active' : ''} onClick={() => setTab('dynamics')}>
            <LineChart /><span>Динамика</span>
          </button>
          <button className={tab === 'ads' ? 'active' : ''} onClick={() => setTab('ads')}>
            <Search /><span>Объявления</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <button onClick={() => setShowIssues(true)}>
            <TriangleAlert /><span>Проверка данных</span>
            {relevantIssues.length > 0 && <b>{relevantIssues.length}</b>}
          </button>
          <button onClick={() => setShowSettings(true)}><Settings2 /><span>Подключение</span></button>
          <span className="connection-state">
            <i className={configured ? 'online' : ''} />
            <span>
              {configured
                ? 'Таблицы подключены'
                : snapshot?.mode === 'demo'
                  ? 'Демонстрационные данные'
                  : 'Нет подключения'}
            </span>
          </span>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? 'Развернуть боковое меню' : 'Свернуть боковое меню'}
            title={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            <span>{sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}</span>
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div><span>АНАЛИТИКА АВИТО</span><h1>{TITLES[tab]}</h1></div>
          <div className="topbar-actions">
            {snapshot && (
              <span className="updated-at">
                {snapshot.mode === 'demo' ? 'Демо-данные' : 'Обновлено'}
                <strong>
                  {new Date(snapshot.updatedAt).toLocaleString('ru-RU', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </strong>
              </span>
            )}
            <Button className="refresh-button" disabled={busy} onClick={refresh}>
              <RefreshCw className={busy ? 'spin' : ''} />
              {busy ? 'Обновляем…' : 'Обновить'}
            </Button>
          </div>
        </header>

        {snapshot && from && to && (
          <section className="controlbar">
            <PeriodPicker
              key={`${from}:${to}:${bounds.min}:${bounds.max}`}
              from={from}
              to={to}
              min={bounds.min}
              max={bounds.max}
              onApply={(start, end) => {
                if (validRange(start, end) && start >= bounds.min && end <= bounds.max) {
                  setFrom(start);
                  setTo(end);
                  setNotice('');
                }
              }}
            />
          </section>
        )}

        {notice && (
          <output className="notice">
            {notice}
            <button onClick={() => setNotice('')} aria-label="Закрыть сообщение"><X /></button>
          </output>
        )}
        {snapshot?.mode === 'demo' && !notice && (
          <div className="demo-banner">
            <span><strong>Демонстрационные данные.</strong> Подключите таблицы для рабочей статистики.</span>
            <button onClick={() => setShowSettings(true)}>Подключить</button>
          </div>
        )}
        {loadError && (
          <div className="notice error">
            {loadError}<button onClick={() => setShowSettings(true)}>Подключить</button>
          </div>
        )}
        {!snapshot && !loadError && (
          <div className="loading-state"><RefreshCw className="spin" />Загружаем данные…</div>
        )}

        {snapshot && (
          <div className="content">
            {tab === 'overview' && (
              <Overview
                snapshot={snapshot}
                from={from}
                to={to}
                branch={branch}
                onBranchChange={setBranch}
              />
            )}
            {tab === 'dynamics' && <Comparison snapshot={snapshot} from={from} to={to} />}
            {tab === 'ads' && (
              <PartExplorer
                key={branch}
                snapshot={snapshot}
                from={from}
                to={to}
                initialScope="network"
              />
            )}
          </div>
        )}
      </main>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>Подключение таблиц</DialogTitle>
            <DialogDescription>
              Укажите опубликованный Apps Script и ключ. После этого обновление выполняется одной кнопкой.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="source-url">
            <span>Ссылка веб-приложения</span>
            <Input
              id="source-url"
              value={scriptUrl}
              onChange={(event) => setScriptUrl(event.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
            />
          </label>
          <label htmlFor="source-token">
            <span>Ключ SYNC_TOKEN</span>
            <Input
              id="source-token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={configured ? 'Введите только для изменения' : 'Ключ из свойств скрипта'}
            />
          </label>
          {settingNotice && <output className="dialog-notice">{settingNotice}</output>}
          <Button disabled={busy} onClick={saveSettings}><Check />Сохранить подключение</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={showIssues} onOpenChange={setShowIssues}>
        <DialogContent className="issues-dialog">
          <DialogHeader>
            <DialogTitle>Проверка данных</DialogTitle>
            <DialogDescription>Замечания источника для {branch} и выбранного периода.</DialogDescription>
          </DialogHeader>
          <div className="issues-list">
            {relevantIssues.length ? (
              relevantIssues.map((issue, index) => (
                <div className="issue" key={`${issue.code}:${index}`}>
                  <TriangleAlert />
                  <div>
                    <strong>{issue.end ?? 'История'}{issue.row ? ` · строка ${issue.row}` : ''}</strong>
                    <p>{issue.message}</p>
                    <small>{issue.source}</small>
                  </div>
                </div>
              ))
            ) : (
              <p>Замечаний нет.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
