'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Check,
  Layers3,
  RefreshCw,
  Search,
  Settings2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { Picker } from '@/components/analytics-ui';
import PeriodPicker from '@/components/period-picker';
import WeeklyAudit from '@/components/weekly-audit';
import Comparison from '@/components/comparison';
import AdExplorer from '@/components/ad-explorer';
import {
  browserConnection,
  browserSnapshot,
  isGithubPages,
  saveBrowserConnection,
  saveBrowserSnapshot,
} from '@/lib/client-store';
import { demoSnapshot } from '@/lib/demo';
import { normalize, type RawPayload } from '@/lib/normalize';
import { scopeBranches, scopeHistory, SCOPES } from '@/lib/explore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  validDate,
  validRange,
  restorePeriod,
  dateRangeLabel,
  type Snapshot,
} from '@/lib/model';

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('stats');
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

  async function load(initial = false) {
    if (isGithubPages()) {
      const saved = await browserSnapshot().catch(() => null);
      applySnapshot(saved ?? demoSnapshot(), initial);
      return;
    }
    let response = await fetch('/api/snapshot', { cache: 'no-store' });
    // The checked-in application never falls back to a stale data file. The
    // local Excel snapshot is only a development aid and is excluded from Git.
    if (!response.ok && process.env.NODE_ENV === 'development')
      response = await fetch('/data/snapshot.json', { cache: 'no-store' });
    if (!response.ok)
      throw new Error(
        'Данные ещё не загружены. Подключите Google-таблицы и нажмите «Обновить данные».',
      );
    const value = (await response.json()) as Snapshot;
    if (value.version !== 1 || !Array.isArray(value.stats))
      throw new Error('Не удалось прочитать данные.');
    applySnapshot(value, initial);
  }

  function applySnapshot(value: Snapshot, initial = false) {
    if (
      value.version !== 1 ||
      !Array.isArray(value.stats) ||
      !Array.isArray(value.ads) ||
      !Array.isArray(value.issues)
    )
      throw new Error(
        'Не удалось прочитать сохранённые данные. Обновите их из таблиц.',
      );
    if (!value.stats.length || value.stats.some((row) => !validDate(row.end)))
      throw new Error('В статистике нет корректных дат отчётных недель.');
    setSnapshot(value);
    setLoadError('');
    if (initial) {
      const end = value.stats
        .map((s) => s.end)
        .sort()
        .at(-1)!;
      let saved: {
        branch?: string;
        from?: string;
        to?: string;
        tab?: string;
      } = {};
      try {
        const parsed = JSON.parse(localStorage.getItem('pik-filters') ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          saved = parsed;
      } catch {
        /* Use defaults. */
      }
      const min = value.stats.map((s) => s.end).sort()[0];
      const restored = restorePeriod(saved, min, end);
      setFrom(restored.from);
      setTo(restored.to);
      if (restored.reset)
        setNotice(
          'Некорректный сохранённый период сброшен. Показаны последние 12 недель; данные и подключение сохранены.',
        );
      if (saved.branch && SCOPES.some((s) => s.value === saved.branch))
        setBranch(saved.branch);
      if (saved.tab && ['stats', 'compare', 'ads'].includes(saved.tab))
        setTab(saved.tab);
    }
  }
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- remote snapshot hydration is an external synchronization.
    load(true).catch((e) => setLoadError(e.message));
    if (isGithubPages()) {
      const connection = browserConnection();
      queueMicrotask(() => {
        setConfigured(!!(connection.url && connection.token));
        if (connection.url) setScriptUrl(connection.url);
      });
    } else {
      fetch('/api/settings')
        .then((r) => r.json() as Promise<{ configured: boolean; url?: string }>)
        .then((s) => {
          setConfigured(!!s.configured);
          if (s.url) setScriptUrl(s.url);
        })
        .catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (validRange(from, to))
      try {
        localStorage.setItem(
          'pik-filters',
          JSON.stringify({ branch, from, to, tab }),
        );
      } catch {
        /* Storage is optional. */
      }
  }, [branch, from, to, tab]);

  const branchStats = useMemo(
    () => (snapshot ? scopeHistory(snapshot.stats, branch) : []),
    [snapshot, branch],
  );
  const bounds = useMemo(() => {
    const dates = snapshot?.stats.map((s) => s.end).sort() ?? [];
    return { min: dates[0] ?? '', max: dates.at(-1) ?? '' };
  }, [snapshot]);
  const relevantIssues =
    snapshot?.issues.filter(
      (i) =>
        (!i.branch || scopeBranches(branch).includes(i.branch)) &&
        (!i.end || (i.end >= from && i.end <= to)),
    ) ?? [];
  async function refresh() {
    if (!configured) {
      setShowSettings(true);
      return;
    }
    setBusy(true);
    setNotice('Читаем обе таблицы и проверяем новую версию…');
    try {
      if (isGithubPages()) {
        const connection = browserConnection();
        if (!connection.url || !connection.token)
          throw new Error('Сначала сохраните подключение в настройках.');
        const response = await fetch(connection.url, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ token: connection.token }),
          redirect: 'follow',
        });
        if (!response.ok) throw new Error('Apps Script не ответил.');
        const raw = (await response.json()) as RawPayload & { error?: string };
        if (raw.error) throw new Error(raw.error);
        const next = normalize(raw, 'google');
        const errors = next.issues.filter(
          (issue) => issue.severity === 'error',
        );
        if (errors.length)
          throw new Error(
            `Новая версия не сохранена: ${errors.length} строк требуют проверки.`,
          );
        await saveBrowserSnapshot(next);
        applySnapshot(next);
        setNotice(
          `Данные обновлены: ${next.ads.length.toLocaleString('ru-RU')} записей. ${next.issues.length ? 'Замечания доступны в проверке данных.' : ''}`,
        );
        return;
      }
      const response = await fetch('/api/refresh', { method: 'POST' });
      const result = (await response.json()) as {
        error: string;
        rows: number;
        warnings: number;
      };
      if (!response.ok) throw new Error(result.error);
      await load();
      setNotice(
        `Данные обновлены: ${result.rows.toLocaleString('ru-RU')} записей. ${result.warnings ? 'Замечания доступны в проверке данных.' : ''}`,
      );
    } catch (e) {
      setNotice(
        `${e instanceof Error ? e.message : 'Ошибка обновления.'} Предыдущие данные сохранены.`,
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings() {
    setBusy(true);
    setSettingNotice('');
    try {
      if (isGithubPages()) {
        const url = scriptUrl.trim();
        const secret = token.trim();
        if (
          !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
            url,
          )
        )
          throw new Error(
            'Нужна ссылка Apps Script, заканчивающаяся на /exec.',
          );
        if (secret.length < 24)
          throw new Error('Введите ключ SYNC_TOKEN из свойств скрипта.');
        saveBrowserConnection(url, secret);
        setConfigured(true);
        setToken('');
        setSettingNotice(
          'Подключение сохранено в этом браузере. Теперь нажмите «Обновить данные».',
        );
        return;
      }
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: scriptUrl.trim(), token: token.trim() }),
      });
      const result = (await response.json()) as { error: string };
      if (!response.ok) throw new Error(result.error);
      setConfigured(true);
      setToken('');
      setSettingNotice(
        'Подключение сохранено. Закройте настройки и нажмите «Обновить данные».',
      );
    } catch (e) {
      setSettingNotice(e instanceof Error ? e.message : 'Ошибка сохранения.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="masthead">
        <div className="brand">
          <span className="brand-symbol">
            <Activity size={23} />
          </span>
          <span>
            ПИК<span className="brand-divider">/</span>
            <span className="brand-sub">аналитика</span>
          </span>
        </div>
        <div className="header-actions">
          <span className="connection">
            <i className={configured ? 'live' : ''} />
            {configured
              ? 'Google-таблицы подключены'
              : snapshot?.mode === 'demo'
                ? 'Демонстрационные данные'
                : 'Таблицы не подключены'}
          </span>
          <Button
            variant="outline"
            onClick={() => setShowSettings(true)}
            aria-label="Настройки подключения"
          >
            <Settings2 size={17} />
          </Button>
          <Button className="refresh" disabled={busy} onClick={refresh}>
            <RefreshCw size={16} className={busy ? 'spin' : ''} />
            {busy ? 'Обновление…' : 'Обновить данные'}
          </Button>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <div className="eyebrow">ПИК / АВИТО</div>
            <h1>Еженедельный аудит</h1>
          </div>
          <div className="snapshot-meta">
            {snapshot && (
              <>
                Последний период:{' '}
                <strong>{dateRangeLabel(bounds.max, bounds.max)}</strong>
                <br />
                {snapshot.mode === 'excel'
                  ? 'Снимок Excel'
                  : snapshot.mode === 'demo'
                    ? 'Демо-режим'
                    : 'Обновлено вручную'}{' '}
                ·{' '}
                {new Date(snapshot.updatedAt).toLocaleString('ru-RU', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </>
            )}
          </div>
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList variant="line" className="main-tabs">
            <TabsTrigger value="stats">
              <Activity />
              Недельный аудит
            </TabsTrigger>
            <TabsTrigger value="compare">
              <Layers3 />
              Сравнение
            </TabsTrigger>
            <TabsTrigger value="ads">
              <Search />
              Объявления
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="filters">
          <div className="filter-field">
            <span>Подразделение или город</span>
            <Picker
              label="Подразделение или город"
              value={branch}
              onChange={setBranch}
              items={SCOPES}
            />
          </div>
          {snapshot && from && to && (
            <PeriodPicker
              key={from + to + bounds.min + bounds.max}
              from={from}
              to={to}
              min={bounds.min}
              max={bounds.max}
              onApply={(start, end) => {
                if (
                  validRange(start, end) &&
                  start >= bounds.min &&
                  end <= bounds.max
                ) {
                  setFrom(start);
                  setTo(end);
                }
              }}
            />
          )}
          <button
            className="quality-button"
            onClick={() => setShowIssues(true)}
          >
            <TriangleAlert size={15} />
            Проверка данных
            {relevantIssues.length > 0 && <span>{relevantIssues.length}</span>}
          </button>
        </div>
        {notice && (
          <output className="notice">
            {notice}
            <button onClick={() => setNotice('')} aria-label="Скрыть сообщение">
              <X size={16} />
            </button>
          </output>
        )}
        {snapshot?.mode === 'demo' && !notice && (
          <div className="demo-strip">
            <span>
              <strong>Демо-режим</strong>
              Все разделы доступны на тестовых данных. Подключите таблицы, чтобы
              заменить их реальной статистикой.
            </span>
            <Button size="sm" onClick={() => setShowSettings(true)}>
              Подключить таблицы
            </Button>
          </div>
        )}
        {loadError && (
          <div className="notice error" role="alert">
            {loadError}
            <Button onClick={() => setShowSettings(true)}>
              Подключить таблицы
            </Button>
          </div>
        )}
        {!snapshot && !loadError && (
          <div className="loading">
            <RefreshCw className="spin" />
            Загружаем историю…
          </div>
        )}
        {snapshot && (
          <>
            {tab === 'stats' && (
              <WeeklyAudit
                rows={branchStats}
                scope={branch}
                from={from}
                to={to}
              />
            )}
            {tab === 'compare' && (
              <Comparison snapshot={snapshot} from={from} to={to} />
            )}
            {tab === 'ads' && (
              <AdExplorer
                key={branch}
                snapshot={snapshot}
                from={from}
                to={to}
                initialScope={branch}
              />
            )}
            <footer>
              <span>ПИК · Аналитика Авито</span>
              <span>
                {snapshot.ads.length.toLocaleString('ru-RU')} записей объявлений
                · {snapshot.stats.length} периодов подразделений
              </span>
              <span>Обновление только по кнопке</span>
            </footer>
          </>
        )}
      </main>
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="settings-dialog">
          <DialogHeader>
            <DialogTitle>Подключение Google-таблиц</DialogTitle>
            <DialogDescription>
              Один раз установите подготовленный Apps Script. Дальше обновление
              выполняется кнопкой в дашборде.
            </DialogDescription>
          </DialogHeader>
          <ol className="setup-steps">
            <li>
              Создайте отдельный проект в Google Apps Script и вставьте
              подготовленный код.
            </li>
            <li>Запустите initialize и разрешите чтение двух таблиц.</li>
            <li>В свойствах скрипта скопируйте SYNC_TOKEN.</li>
            <li>
              Опубликуйте как веб-приложение: выполнять от вашего имени, доступ
              — «Все». Данные выдаются только при верном ключе.
            </li>
          </ol>
          <a
            className="text-link"
            href="https://github.com/TroyDiFlex/avito-dashboard/blob/main/apps-script/SETUP.md"
            target="_blank"
            rel="noreferrer"
          >
            Инструкция и код скрипта <ArrowRight size={14} />
          </a>
          <label className="settings-label" htmlFor="apps-script-url">
            <span>Ссылка веб-приложения</span>
            <Input
              id="apps-script-url"
              value={scriptUrl}
              onChange={(e) => setScriptUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/…/exec"
              autoComplete="off"
            />
          </label>
          <label className="settings-label" htmlFor="apps-script-token">
            <span>Ключ SYNC_TOKEN</span>
            <Input
              id="apps-script-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                configured
                  ? 'Введите ключ для изменения подключения'
                  : 'Из свойств скрипта'
              }
              autoComplete="new-password"
            />
          </label>
          <p className="muted small">
            {isGithubPages()
              ? 'Подключение и загруженные данные сохраняются в этом браузере на вашем устройстве.'
              : 'Ключ сохраняется на сервере и не возвращается в браузер.'}
          </p>
          {settingNotice && <output className="notice">{settingNotice}</output>}
          <Button disabled={busy} onClick={saveSettings}>
            <Check size={16} />
            Сохранить подключение
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={showIssues} onOpenChange={setShowIssues}>
        <DialogContent className="issues-dialog">
          <DialogHeader>
            <DialogTitle>Проверка данных · {branch}</DialogTitle>
            <DialogDescription>
              Замечания для выбранных периодов. Исходные таблицы не изменены;
              статистика и детализация считаются отдельно.
            </DialogDescription>
          </DialogHeader>
          <div className="issues-list">
            {relevantIssues.length ? (
              relevantIssues.map((issue, index) => (
                <div className="issue" key={index}>
                  <TriangleAlert size={17} />
                  <div>
                    <strong>
                      {issue.end ?? 'История периодов'}
                      {issue.row ? ` · строка ${issue.row}` : ''}
                    </strong>
                    <p>
                      {issue.message
                        .replace(/impressions/g, 'Показы')
                        .replace(/views/g, 'Просмотры')
                        .replace(/contacts/g, 'Контакты')
                        .replace(/spend/g, 'Расходы')}
                    </p>
                    <small>{issue.source}</small>
                  </div>
                </div>
              ))
            ) : (
              <p>Замечаний для выбранных условий нет.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
