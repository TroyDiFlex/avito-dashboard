'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Check,
  Lightbulb,
  LineChart,
  Megaphone,
  PackageSearch,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings2,
  TriangleAlert,
  X,
} from 'lucide-react';
import AdsExplorer from '@/components/ads-explorer';
import Comparison from '@/components/comparison';
import Insights from '@/components/insights';
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
import { Switch } from '@/components/ui/switch';
import {
  browserConnection,
  browserSnapshot,
  isStaticApp,
  saveBrowserConnection,
  saveBrowserSnapshot,
} from '@/lib/client-store';
import { demoSnapshot } from '@/lib/demo';
import { DEFAULT_DEMAND_TEXT, parseDemandAnalysis } from '@/lib/demand';
import { scopeBranches } from '@/lib/explore';
import { describeIssue, filterIssues, isBlockingIssue } from '@/lib/issues';
import {
  BRANCHES,
  BRANCH_COLORS,
  restorePeriod,
  validDate,
  validRange,
  type PeriodPreset,
  type Snapshot,
} from '@/lib/model';
import { normalize, type RawPayload } from '@/lib/normalize';

type Tab = 'overview' | 'insights' | 'dynamics' | 'parts' | 'ads';
type NoticeKind = 'progress' | 'success' | 'warning' | 'error';
const TITLES: Record<Tab, string> = {
  overview: 'Обзор недели',
  insights: 'Точки роста',
  dynamics: 'Динамика',
  parts: 'Запчасти',
  ads: 'Объявления',
};
const DEFAULT_VISIBLE_BRANCHES = BRANCHES.filter((branch) => branch !== 'К20');
const PERIODS: PeriodPreset[] = ['1m', '3m', '6m', 'all', 'custom'];

function isTab(value: unknown): value is Tab {
  return typeof value === 'string' && Object.hasOwn(TITLES, value);
}

function isPeriod(value: unknown): value is PeriodPreset {
  return PERIODS.includes(value as PeriodPreset);
}

function dashboardUrl(values: Record<string, string | null>) {
  const url = new URL(window.location.href);
  Object.entries(values).forEach(([key, value]) => {
    if (value == null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  });
  return `${url.pathname}${url.search}${url.hash}`;
}

function urlNavigation() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab');
  const period = params.get('period');
  const partBranch = params.get('partBranch');
  const partId = params.get('partId');
  return {
    tab: isTab(tab) ? tab : null,
    branch: params.get('branch'),
    from: params.get('from'),
    to: params.get('to'),
    period: isPeriod(period) ? period : null,
    partTarget:
      partBranch && partId ? { branch: partBranch, id: partId } : null,
  };
}

function currentHistoryState() {
  return window.history.state && typeof window.history.state === 'object'
    ? window.history.state
    : {};
}

function storedVisibleBranches() {
  if (typeof window === 'undefined') return DEFAULT_VISIBLE_BRANCHES;
  try {
    const saved = JSON.parse(
      localStorage.getItem('pik-visible-branches') ?? 'null',
    );
    if (!Array.isArray(saved)) return DEFAULT_VISIBLE_BRANCHES;
    const valid = BRANCHES.filter((branch) => saved.includes(branch));
    return valid.length ? valid : DEFAULT_VISIBLE_BRANCHES;
  } catch {
    return DEFAULT_VISIBLE_BRANCHES;
  }
}

function storedDemandText() {
  if (typeof window === 'undefined') return DEFAULT_DEMAND_TEXT;
  try {
    return localStorage.getItem('pik-demand-analysis') ?? DEFAULT_DEMAND_TEXT;
  } catch {
    return DEFAULT_DEMAND_TEXT;
  }
}

function Sidebar({
  tab,
  onTabChange,
  onShowIssues,
  onShowSettings,
  issueCount,
  configured,
  snapshotMode,
}: {
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onShowIssues: () => void;
  onShowSettings: () => void;
  issueCount: number;
  configured: boolean;
  snapshotMode?: Snapshot['mode'];
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('pik-sidebar-collapsed');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('pik-sidebar-collapsed', String(collapsed));
    } catch {
      /* Device preferences are optional. */
    }
  }, [collapsed]);

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <button
        className="brand"
        onClick={() => onTabChange('overview')}
        aria-label="Перейти к обзору"
      >
        <span>
          <strong>ПИК</strong>
          <small>АНАЛИТИКА АВИТО</small>
        </span>
      </button>
      <nav aria-label="Разделы">
        <button
          className={tab === 'overview' ? 'active' : ''}
          onClick={() => onTabChange('overview')}
        >
          <BarChart3 />
          <span>Обзор недели</span>
        </button>
        <button
          className={tab === 'dynamics' ? 'active' : ''}
          onClick={() => onTabChange('dynamics')}
        >
          <LineChart />
          <span>Динамика</span>
        </button>
        <button
          className={tab === 'ads' ? 'active' : ''}
          onClick={() => onTabChange('ads')}
        >
          <Megaphone />
          <span>Объявления</span>
        </button>
        <button
          className={tab === 'parts' ? 'active' : ''}
          onClick={() => onTabChange('parts')}
        >
          <PackageSearch />
          <span>Запчасти</span>
        </button>
        <button
          className={tab === 'insights' ? 'active' : ''}
          onClick={() => onTabChange('insights')}
        >
          <Lightbulb />
          <span>Точки роста</span>
        </button>
      </nav>
      <div className="sidebar-footer">
        <button onClick={onShowIssues}>
          <TriangleAlert />
          <span>Проверка данных</span>
          {issueCount > 0 && <b>{issueCount}</b>}
        </button>
        <button onClick={onShowSettings}>
          <Settings2 />
          <span>Настройки</span>
        </button>
        <span className="connection-state">
          <i className={configured ? 'online' : ''} />
          <span>
            {configured
              ? 'Таблицы подключены'
              : snapshotMode === 'demo'
                ? 'Демонстрационные данные'
                : 'Нет подключения'}
          </span>
        </span>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={
            collapsed
              ? 'Закрепить боковое меню раскрытым'
              : 'Свернуть боковое меню'
          }
          title={collapsed ? 'Закрепить раскрытым' : 'Свернуть меню'}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          <span>{collapsed ? 'Закрепить раскрытым' : 'Свернуть меню'}</span>
        </button>
      </div>
    </aside>
  );
}

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [branch, setBranch] = useState('И31');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [period, setPeriod] = useState<PeriodPreset>('6m');
  const [showSettings, setShowSettings] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [scriptUrl, setScriptUrl] = useState('');
  const [token, setToken] = useState('');
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeKind, setNoticeKind] = useState<NoticeKind>('progress');
  const [settingNotice, setSettingNotice] = useState('');
  const [demandNotice, setDemandNotice] = useState('');
  const [demandText, setDemandText] = useState(storedDemandText);
  const [visibleBranches, setVisibleBranches] = useState(storedVisibleBranches);
  const [partTarget, setPartTarget] = useState<{
    branch: string;
    id: string;
  } | null>(null);

  function changeTab(nextTab: Tab) {
    if (nextTab === tab) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    const currentState = currentHistoryState();
    window.history.replaceState(
      {
        ...currentState,
        pikDashboard: {
          tab,
          partTarget,
          scrollY: window.scrollY,
        },
      },
      '',
      dashboardUrl({
        tab,
        partBranch: partTarget?.branch ?? null,
        partId: partTarget?.id ?? null,
      }),
    );
    window.history.pushState(
      {
        ...currentState,
        pikDashboard: { tab: nextTab, partTarget: null },
      },
      '',
      dashboardUrl({ tab: nextTab, partBranch: null, partId: null }),
    );
    if (nextTab !== 'parts') setPartTarget(null);
    setTab(nextTab);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function openPart(
    ad: { branch: string; id: string },
    sourceTab: 'insights' | 'ads',
  ) {
    const currentState = currentHistoryState();
    window.history.replaceState(
      {
        ...currentState,
        pikDashboard: {
          tab: sourceTab,
          partTarget: null,
          scrollY: window.scrollY,
        },
      },
      '',
      dashboardUrl({ tab: sourceTab, partBranch: null, partId: null }),
    );
    window.history.pushState(
      {
        ...currentState,
        pikDashboard: { tab: 'parts', partTarget: ad },
      },
      '',
      dashboardUrl({
        tab: 'parts',
        partBranch: ad.branch,
        partId: ad.id,
      }),
    );
    setPartTarget(ad);
    setTab('parts');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

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
    const dates = value.stats.map((row) => row.end).sort();
    const min = dates[0];
    const max = dates.at(-1)!;
    if (!initial) {
      const nextPeriod = restorePeriod({ from, to, period }, min, max);
      setFrom(nextPeriod.from);
      setTo(nextPeriod.to);
      setPeriod(nextPeriod.period);
      return;
    }
    let saved: {
      branch?: string;
      from?: string;
      to?: string;
      tab?: string;
      period?: string;
      navigationVersion?: number;
    } = {};
    try {
      const parsed = JSON.parse(localStorage.getItem('pik-filters') ?? '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        saved = parsed;
    } catch {
      /* Defaults are safe. */
    }
    const url = urlNavigation();
    const restored = restorePeriod(
      {
        from: url.from ?? saved.from,
        to: url.to ?? saved.to,
        period: url.period ?? saved.period,
      },
      min,
      max,
    );
    setFrom(restored.from);
    setTo(restored.to);
    setPeriod(restored.period);
    const restoredBranch = url.branch ?? saved.branch;
    if (restoredBranch && visibleBranches.includes(restoredBranch))
      setBranch(restoredBranch);
    const restoredTab = url.tab ?? saved.tab;
    if (
      restoredTab === 'overview' ||
      restoredTab === 'insights' ||
      restoredTab === 'dynamics' ||
      restoredTab === 'parts'
    ) {
      setTab(restoredTab);
    } else if (restoredTab === 'ads') {
      setTab(
        url.tab === 'ads' || saved.navigationVersion === 2 ? 'ads' : 'parts',
      );
    }
    setPartTarget(restoredTab === 'parts' ? url.partTarget : null);
    if (restored.reset) {
      setNoticeKind('warning');
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
      throw new Error(
        'Данные ещё не загружены. Подключите таблицы и нажмите «Обновить».',
      );
    }
    applySnapshot((await response.json()) as Snapshot, initial);
  }

  // oxlint-disable react-hooks/exhaustive-deps -- Initial external load intentionally runs once.
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Loading persisted external state is intentional.
    load(true).catch((error) => {
      setLoadError(
        error instanceof Error ? error.message : 'Не удалось загрузить данные.',
      );
    });
    if (isStaticApp()) {
      const connection = browserConnection();
      queueMicrotask(() => {
        setConfigured(Boolean(connection.url && connection.token));
        if (connection.url) setScriptUrl(connection.url);
      });
    } else {
      fetch('/api/settings')
        .then(
          (response) =>
            response.json() as Promise<{ configured: boolean; url?: string }>,
        )
        .then((value) => {
          setConfigured(Boolean(value.configured));
          if (value.url) setScriptUrl(value.url);
        })
        .catch(() => {});
    }
  }, []);
  // oxlint-enable react-hooks/exhaustive-deps

  useEffect(() => {
    const restoreNavigation = (event: PopStateEvent) => {
      const state = event.state as {
        pikDashboard?: {
          tab?: Tab;
          partTarget?: { branch?: string; id?: string } | null;
          scrollY?: number;
        };
      } | null;
      const navigation = state?.pikDashboard;
      const url = urlNavigation();
      const nextTab = isTab(navigation?.tab) ? navigation.tab : url.tab;
      if (!nextTab) return;
      const target = navigation?.partTarget ?? url.partTarget;
      setPartTarget(
        target &&
          typeof target.branch === 'string' &&
          typeof target.id === 'string'
          ? { branch: target.branch, id: target.id }
          : null,
      );
      setTab(nextTab);
      if (url.branch && visibleBranches.includes(url.branch))
        setBranch(url.branch);
      if (validRange(url.from, url.to)) {
        setFrom(url.from!);
        setTo(url.to!);
      }
      if (url.period) setPeriod(url.period);
      requestAnimationFrame(() =>
        window.scrollTo({
          top: typeof navigation?.scrollY === 'number' ? navigation.scrollY : 0,
          behavior: 'auto',
        }),
      );
    };
    window.addEventListener('popstate', restoreNavigation);
    return () => window.removeEventListener('popstate', restoreNavigation);
  }, [visibleBranches]);

  useEffect(() => {
    if (!validRange(from, to)) return;
    try {
      localStorage.setItem(
        'pik-filters',
        JSON.stringify({ branch, from, to, tab, period, navigationVersion: 2 }),
      );
    } catch {
      /* Device preferences are optional. */
    }
    const currentState = currentHistoryState();
    const currentNavigation =
      currentState.pikDashboard && typeof currentState.pikDashboard === 'object'
        ? currentState.pikDashboard
        : {};
    window.history.replaceState(
      {
        ...currentState,
        pikDashboard: {
          ...currentNavigation,
          tab,
          partTarget,
        },
      },
      '',
      dashboardUrl({
        tab,
        branch,
        from,
        to,
        period,
        partBranch: tab === 'parts' ? (partTarget?.branch ?? null) : null,
        partId: tab === 'parts' ? (partTarget?.id ?? null) : null,
      }),
    );
  }, [branch, from, partTarget, period, tab, to]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'pik-visible-branches',
        JSON.stringify(visibleBranches),
      );
    } catch {
      /* Device preferences are optional. */
    }
  }, [visibleBranches]);

  function toggleBranchVisibility(name: string) {
    if (visibleBranches.includes(name)) {
      if (visibleBranches.length === 1) return;
      const next = visibleBranches.filter((branchName) => branchName !== name);
      setVisibleBranches(next);
      if (branch === name) setBranch(next[0]);
      return;
    }
    setVisibleBranches(
      BRANCHES.filter(
        (branchName) =>
          visibleBranches.includes(branchName) || branchName === name,
      ),
    );
  }

  const bounds = useMemo(() => {
    const dates = snapshot?.stats.map((row) => row.end).sort() ?? [];
    return { min: dates[0] ?? '', max: dates.at(-1) ?? '' };
  }, [snapshot]);
  const relevantBranches = visibleBranches.filter((name) =>
    scopeBranches(branch).includes(name),
  );
  const relevantIssues = filterIssues(
    snapshot?.issues ?? [],
    relevantBranches,
    from,
    to,
  );
  const demandAnalysis = useMemo(
    () => parseDemandAnalysis(demandText),
    [demandText],
  );

  async function refresh() {
    if (!configured) {
      setShowSettings(true);
      return;
    }
    setBusy(true);
    setNoticeKind('progress');
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
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Источник данных не ответил.');
        const raw = (await response.json()) as RawPayload & { error?: string };
        if (raw.error) throw new Error(raw.error);
        const next = normalize(raw, 'google');
        const errors = filterIssues(next.issues, BRANCHES).filter(
          (issue) => issue.severity === 'error',
        );
        const blockingErrors = errors.filter(isBlockingIssue);
        if (blockingErrors.length) {
          throw new Error(
            `Новые данные не применены. ${describeIssue(blockingErrors[0])}` +
              (blockingErrors.length > 1
                ? ` Ещё ошибок: ${blockingErrors.length - 1}.`
                : ''),
          );
        }
        await saveBrowserSnapshot(next);
        applySnapshot(next);
        if (errors.length) {
          setNoticeKind('warning');
          setNotice(
            `Данные обновлены. Исключено строк: ${errors.length}. ${describeIssue(errors[0])}` +
              (errors.length > 1 ? ` Ещё ошибок: ${errors.length - 1}.` : ''),
          );
        } else {
          setNoticeKind('success');
          setNotice(
            `Готово. Загружено ${next.ads.length.toLocaleString('ru-RU')} записей.`,
          );
        }
      } else {
        const response = await fetch('/api/refresh', { method: 'POST' });
        const result = (await response.json()) as {
          error?: string;
          rows?: number;
        };
        if (!response.ok)
          throw new Error(result.error ?? 'Не удалось обновить данные.');
        await load();
        setNoticeKind('success');
        setNotice(
          `Готово. Загружено ${(result.rows ?? 0).toLocaleString('ru-RU')} записей.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Ошибка обновления.';
      setNoticeKind('error');
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
        if (
          !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
            url,
          )
        ) {
          throw new Error(
            'Нужна ссылка Apps Script, заканчивающаяся на /exec.',
          );
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
        if (!response.ok)
          throw new Error(result.error ?? 'Не удалось сохранить подключение.');
        setConfigured(true);
        setToken('');
        setSettingNotice('Подключение сохранено.');
      }
    } catch (error) {
      setSettingNotice(
        error instanceof Error ? error.message : 'Ошибка сохранения.',
      );
    } finally {
      setBusy(false);
    }
  }

  function saveDemandAnalysis() {
    setDemandNotice('');
    try {
      localStorage.setItem('pik-demand-analysis', demandText);
      setDemandNotice(
        `Сохранено: ${demandAnalysis.recognized} артикулов, ${demandAnalysis.withValue} со спросом, ${demandAnalysis.withCategory} с категорией.`,
      );
    } catch {
      setDemandNotice('Не удалось сохранить аналитику товаров на устройстве.');
    }
  }

  return (
    <div className="app-shell">
      <Sidebar
        tab={tab}
        onTabChange={changeTab}
        onShowIssues={() => setShowIssues(true)}
        onShowSettings={() => setShowSettings(true)}
        issueCount={relevantIssues.length}
        configured={configured}
        snapshotMode={snapshot?.mode}
      />

      <main className="workspace">
        <header className="topbar">
          <div>
            <span>АНАЛИТИКА АВИТО</span>
            <h1>{TITLES[tab]}</h1>
          </div>
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
            <Button
              className="refresh-button"
              disabled={busy}
              onClick={refresh}
            >
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
              period={period}
              onApply={(start, end, nextPeriod) => {
                if (
                  validRange(start, end) &&
                  start >= bounds.min &&
                  end <= bounds.max
                ) {
                  setFrom(start);
                  setTo(end);
                  setPeriod(nextPeriod);
                  setNotice('');
                }
              }}
            />
          </section>
        )}

        {notice && (
          <output className={`notice ${noticeKind}`}>
            {notice}
            <button
              onClick={() => setNotice('')}
              aria-label="Закрыть сообщение"
            >
              <X />
            </button>
          </output>
        )}
        {snapshot?.mode === 'demo' && !notice && (
          <div className="demo-banner">
            <span>
              <strong>Демонстрационные данные.</strong> Подключите таблицы для
              рабочей статистики.
            </span>
            <button onClick={() => setShowSettings(true)}>Подключить</button>
          </div>
        )}
        {loadError && (
          <div className="notice error">
            {loadError}
            <button onClick={() => setShowSettings(true)}>Подключить</button>
          </div>
        )}
        {!snapshot && !loadError && (
          <div className="loading-state">
            <RefreshCw className="spin" />
            Загружаем данные…
          </div>
        )}

        {snapshot && (
          <div className="content">
            <div key={tab} className="view-enter">
              {tab === 'overview' && (
                <Overview
                  snapshot={snapshot}
                  from={from}
                  to={to}
                  branch={branch}
                  onBranchChange={setBranch}
                  branches={visibleBranches}
                  onRefresh={refresh}
                  refreshing={busy}
                />
              )}
              {tab === 'dynamics' && (
                <Comparison
                  snapshot={snapshot}
                  from={from}
                  to={to}
                  availableBranches={visibleBranches}
                />
              )}
              {tab === 'insights' && (
                <Insights
                  snapshot={snapshot}
                  from={from}
                  to={to}
                  initialBranch={branch}
                  availableBranches={visibleBranches}
                  demandByArticle={demandAnalysis.values}
                  categoryByArticle={demandAnalysis.categories}
                  onOpenPart={(ad) => openPart(ad, 'insights')}
                />
              )}
              {tab === 'parts' && (
                <PartExplorer
                  key={
                    partTarget
                      ? `${partTarget.branch}:${partTarget.id}`
                      : branch
                  }
                  snapshot={snapshot}
                  from={from}
                  to={to}
                  initialScope="network"
                  availableBranches={visibleBranches}
                  initialAd={partTarget}
                />
              )}
              {tab === 'ads' && (
                <AdsExplorer
                  snapshot={snapshot}
                  from={from}
                  to={to}
                  initialBranch={branch}
                  availableBranches={visibleBranches}
                  onOpenPart={(ad) => openPart(ad, 'ads')}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>Настройки</DialogTitle>
            <DialogDescription>
              Подразделения, аналитика товаров и подключение таблиц.
            </DialogDescription>
          </DialogHeader>
          <section className="settings-section">
            <div className="settings-section-heading">
              <h3>Отображаемые подразделения</h3>
              <p>Скрытые подразделения не показываются в отчётах и фильтрах.</p>
            </div>
            <div className="settings-branches">
              {BRANCHES.map((name) => {
                const checked = visibleBranches.includes(name);
                return (
                  <label className="settings-branch-row" key={name}>
                    <span>
                      <i style={{ background: BRANCH_COLORS[name] }} />
                      {name}
                    </span>
                    <Switch
                      checked={checked}
                      disabled={checked && visibleBranches.length === 1}
                      onCheckedChange={() => toggleBranchVisibility(name)}
                      aria-label={`${checked ? 'Скрыть' : 'Показать'} ${name}`}
                    />
                  </label>
                );
              })}
            </div>
          </section>
          <section className="settings-section demand-settings">
            <div className="settings-section-heading">
              <h3>Аналитика спроса и категорий</h3>
              <p>
                Вставьте артикул, спрос и категорию через Tab или целую
                Markdown-таблицу. Суффикс VRN удаляется автоматически.
              </p>
            </div>
            <label htmlFor="demand-analysis">
              <span>Артикул, спрос и категория</span>
              <textarea
                id="demand-analysis"
                value={demandText}
                onChange={(event) => {
                  setDemandText(event.target.value);
                  setDemandNotice('');
                }}
                rows={9}
                spellCheck={false}
                placeholder={'03L115389HVRN\t66\tA\n11428596283VRN\t569\tC'}
              />
            </label>
            <div className="demand-import-summary">
              <span>
                <b>{demandAnalysis.recognized}</b> артикулов
              </span>
              <span>
                <b>{demandAnalysis.withValue}</b> со спросом
              </span>
              <span>
                <b>{demandAnalysis.withCategory}</b> с категорией
              </span>
              {demandAnalysis.withoutValue > 0 && (
                <span>
                  <b>{demandAnalysis.withoutValue}</b> без значения
                </span>
              )}
              {demandAnalysis.invalid > 0 && (
                <span
                  className="warning"
                  title="Пропускаются строки без корректного артикула или числового значения спроса."
                >
                  <b>{demandAnalysis.invalid}</b> строк пропущено
                </span>
              )}
            </div>
            {demandNotice && (
              <output className="dialog-notice demand-notice">
                {demandNotice}
              </output>
            )}
            <Button type="button" onClick={saveDemandAnalysis}>
              <Check />
              Сохранить аналитику товаров
            </Button>
          </section>
          <section className="settings-section connection-settings">
            <div className="settings-section-heading">
              <h3>Подключение таблиц</h3>
              <p>Параметры источника данных.</p>
            </div>
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
                placeholder={
                  configured
                    ? 'Введите только для изменения'
                    : 'Ключ из свойств скрипта'
                }
              />
            </label>
            {settingNotice && (
              <output className="dialog-notice">{settingNotice}</output>
            )}
            <Button disabled={busy} onClick={saveSettings}>
              <Check />
              Сохранить подключение
            </Button>
          </section>
        </DialogContent>
      </Dialog>

      <Dialog open={showIssues} onOpenChange={setShowIssues}>
        <DialogContent className="issues-dialog">
          <DialogHeader>
            <DialogTitle>Проверка данных</DialogTitle>
            <DialogDescription>
              Замечания источника для всех подразделений за выбранный период.
            </DialogDescription>
          </DialogHeader>
          <div className="issues-list">
            {relevantIssues.length ? (
              relevantIssues.map((issue, index) => (
                <div className="issue" key={`${issue.code}:${index}`}>
                  <TriangleAlert />
                  <div>
                    <strong>
                      {issue.branch ? `${issue.branch} · ` : ''}
                      {issue.end ?? 'История'}
                      {issue.row ? ` · строка ${issue.row}` : ''}
                    </strong>
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
