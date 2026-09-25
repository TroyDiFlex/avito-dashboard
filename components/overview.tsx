'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react';
import { Chart, Picker } from '@/components/analytics-ui';
import { Button } from '@/components/ui/button';
import {
  BRANCH_COLORS,
  METRICS,
  format,
  shiftDate,
  shortDate,
  type Metric,
  type Snapshot,
  type StatRow,
} from '@/lib/model';
import { scopeHistory, timeSeries } from '@/lib/explore';

const GROUPS: { title: string; metrics: Metric[] }[] = [
  {
    title: 'Воронка и реклама',
    metrics: [
      'impressions', 'views', 'viewRate', 'contacts', 'contactRate',
      'favorites', 'spend', 'viewCost', 'contactCost',
    ],
  },
  {
    title: 'Финансовый результат',
    metrics: ['marginParts', 'marginService', 'margin', 'roi'],
  },
  {
    title: 'Репутация',
    metrics: ['rating', 'reviews', 'lowReviews', 'responseTime'],
  },
  {
    title: 'Объявления и склад',
    metrics: ['active', 'unpublished', 'archived', 'stock'],
  },
];
const ALL_METRICS = GROUPS.flatMap((group) => group.metrics);
const METRIC_COLUMN_WIDTH = 218;
const BRANCH_COLUMN_PAIR_MIN_WIDTH = 208;
type TableMode = 'results' | 'history';

function branchColumnWidth(branchCount: number, share: number) {
  return `calc(${(share * 100) / branchCount}% - ${(METRIC_COLUMN_WIDTH * share) / branchCount}px)`;
}

function resultColumnShares(dateCount: number) {
  if (dateCount === 2) return { dates: [0.36, 0.3], delta: 0.34 };
  const delta = dateCount >= 4 ? 0.24 : 0.28;
  return {
    dates: Array.from({ length: dateCount }, () => (1 - delta) / dateCount),
    delta,
  };
}

function ResultsTableHeader({ branches, dates }: {
  branches: string[];
  dates: string[];
}) {
  const shares = resultColumnShares(dates.length);
  return (
    <>
      <colgroup>
        <col style={{ width: METRIC_COLUMN_WIDTH }} />
        {branches.map((name) => (
          <Fragment key={name}>
            {shares.dates.map((share, index) => (
              <col
                key={`${name}:date:${index}`}
                style={{ width: branchColumnWidth(branches.length, share) }}
              />
            ))}
            <col style={{ width: branchColumnWidth(branches.length, shares.delta) }} />
          </Fragment>
        ))}
      </colgroup>
      <thead>
        <tr className="matrix-branch-row">
          <th rowSpan={2}>Показатель</th>
          {branches.map((name) => (
            <th key={name} colSpan={dates.length + 1}>
              <span className="matrix-branch-title">
                <i style={{ background: BRANCH_COLORS[name] }} />
                {name}
              </span>
            </th>
          ))}
        </tr>
        <tr className="matrix-week-row">
          {branches.flatMap((name) => [
            ...dates.map((date, index) => (
              <th
                key={`${name}:${date}`}
                className={`${index === dates.length - 1 ? 'current-week' : 'previous-week'}${index === 0 ? ' branch-start' : ''}`}
              >
                {shortDate(date)}
              </th>
            )),
            <th
              key={`${name}:delta`}
              className="delta-week branch-end"
              aria-label="Изменение последней недели к предыдущей"
            >
              Δ
            </th>,
          ])}
        </tr>
      </thead>
    </>
  );
}

function delta(
  current: number | null | undefined,
  previous: number | null | undefined,
  metric: Metric,
) {
  if (current == null || previous == null) return null;
  if (METRICS[metric].unit === 'percent') return (current - previous) * 100;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function MetricDelta({
  current,
  previous,
  metric,
}: {
  current: number | null | undefined;
  previous: number | null | undefined;
  metric: Metric;
}) {
  const value = delta(current, previous, metric);
  if (value == null) {
    return <span className="matrix-delta neutral"><Minus /> нет базы</span>;
  }
  const quality =
    METRICS[metric].good === 'neutral' || value === 0
      ? 'neutral'
      : value > 0 === (METRICS[metric].good === 'up')
        ? 'positive'
        : 'negative';
  return (
    <span className={`matrix-delta ${quality}`}>
      {value > 0 ? <ArrowUpRight /> : value < 0 ? <ArrowDownRight /> : <Minus />}
      {Math.abs(value).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}
      {METRICS[metric].unit === 'percent' ? ' п.п.' : '%'}
    </span>
  );
}

function rowAt(rows: StatRow[], end: string) {
  return rows.find((row) => row.end === end);
}

export default function Overview({
  snapshot,
  from,
  to,
  branch,
  onBranchChange,
  branches,
  onRefresh,
  refreshing,
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  branch: string;
  onBranchChange: (branch: string) => void;
  branches: string[];
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
}) {
  const [metric, setMetric] = useState<Metric>('contacts');
  const [tableMode, setTableMode] = useState<TableMode>('results');
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const trendRef = useRef<HTMLElement>(null);
  const resultsTableRef = useRef<HTMLTableElement>(null);
  const matrixScrollRef = useRef<HTMLDivElement>(null);
  const stickyTableRef = useRef<HTMLTableElement>(null);
  const histories = useMemo(
    () =>
      Object.fromEntries(
        branches.map((name) => [name, scopeHistory(snapshot.stats, name)]),
      ) as Record<string, StatRow[]>,
    [branches, snapshot],
  );
  const visibleDates = [
    ...new Set(
      branches.flatMap((name) => histories[name].map((row) => row.end)).filter(
        (date) => date >= from && date <= to,
      ),
    ),
  ].sort();
  const latest = visibleDates.at(-1) ?? '';
  const previous = latest ? shiftDate(latest, -7) : '';
  const effectiveBranch = branches.includes(branch) ? branch : (branches[0] ?? branch);
  const effectiveTableMode: TableMode = branches.length === 1 ? 'history' : tableMode;
  const resultWeekCount = branches.length === 2 ? 4 : 2;
  const resultDates = latest
    ? Array.from({ length: resultWeekCount }, (_, index) =>
        shiftDate(latest, (index - resultWeekCount + 1) * 7),
      )
    : [];
  const focusRows = histories[effectiveBranch] ?? [];
  const historyDates = focusRows
    .map((row) => row.end)
    .filter((date) => date >= from && date <= to)
    .sort()
    .slice(-8);
  const chartBranches = effectiveTableMode === 'results' ? branches : [effectiveBranch];
  const chartData = useMemo(() => {
    const rowsByDate = new Map<string, Record<string, unknown>>();
    for (const name of effectiveTableMode === 'results' ? branches : [effectiveBranch]) {
      for (const point of timeSeries(histories[name] ?? [], metric, 'week', from, to)) {
        const row = rowsByDate.get(point.date) ?? { date: point.date };
        row[name] = point.value;
        rowsByDate.set(point.date, row);
      }
    }
    return [...rowsByDate.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    );
  }, [branches, effectiveBranch, effectiveTableMode, from, histories, metric, to]);
  const metricChoices = ALL_METRICS.map((value) => ({
    value,
    label: METRICS[value].label,
  }));
  const resultsTableMinWidth = Math.max(
    1260,
    METRIC_COLUMN_WIDTH + branches.length * BRANCH_COLUMN_PAIR_MIN_WIDTH,
  );

  useEffect(() => {
    if (effectiveTableMode !== 'results') return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const table = resultsTableRef.current;
        const tableHead = table?.tHead;
        const topbar = document.querySelector<HTMLElement>('.topbar');
        if (!table || !tableHead) return;
        const topbarBottom = topbar?.getBoundingClientRect().bottom ?? 80;
        const tableRect = table.getBoundingClientRect();
        const next = tableHead.getBoundingClientRect().top <= topbarBottom && tableRect.bottom > topbarBottom;
        setShowStickyHeader((current) => current === next ? current : next);
        if (stickyTableRef.current) {
          stickyTableRef.current.style.transform = `translateX(-${matrixScrollRef.current?.scrollLeft ?? 0}px)`;
        }
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [effectiveTableMode]);

  useEffect(() => {
    if (!showStickyHeader || !stickyTableRef.current) return;
    stickyTableRef.current.style.transform = `translateX(-${matrixScrollRef.current?.scrollLeft ?? 0}px)`;
  }, [showStickyHeader]);

  function syncStickyHeader() {
    if (!stickyTableRef.current) return;
    stickyTableRef.current.style.transform = `translateX(-${matrixScrollRef.current?.scrollLeft ?? 0}px)`;
  }

  function openBranch(name: string) {
    onBranchChange(name);
    setShowStickyHeader(false);
    setTableMode('history');
  }

  function selectMetricAndReveal(nextMetric: Metric) {
    setMetric(nextMetric);
    window.requestAnimationFrame(() => {
      trendRef.current?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      });
    });
  }

  if (!latest) return <div className="loading-state">За выбранный период нет данных.</div>;

  return (
    <div className="overview-page">
      {showStickyHeader && effectiveTableMode === 'results' && createPortal(
        <header className="overview-sticky-header">
          <div className="overview-sticky-inner">
            <div className="overview-sticky-meta">
              <strong>Результаты подразделений</strong>
              <Button
                className="sticky-refresh-button"
                disabled={refreshing}
                onClick={() => void onRefresh()}
                aria-label={refreshing ? 'Обновляем данные' : 'Обновить данные'}
                title={refreshing ? 'Обновляем данные' : 'Обновить данные'}
              >
                <RefreshCw className={refreshing ? 'spin' : ''} />
              </Button>
            </div>
            <div className="sticky-matrix-scroll" aria-hidden="true">
              <table
                ref={stickyTableRef}
                className="metrics-matrix sticky-metrics-matrix"
                style={{ minWidth: resultsTableMinWidth }}
              >
                <ResultsTableHeader branches={branches} dates={resultDates} />
              </table>
            </div>
          </div>
        </header>,
        document.body,
      )}
      <section className="week-intro">
        <div>
          <span className="eyebrow">ПОСЛЕДНЯЯ ЗАГРУЖЕННАЯ НЕДЕЛЯ</span>
          <h2>{shortDate(latest)}</h2>
          <p>Под значением показано изменение к неделе {shortDate(previous)}.</p>
        </div>
        <div className="week-summary">
          <span>Подразделений<strong>{branches.length}</strong></span>
          <span>Показателей<strong>{ALL_METRICS.length}</strong></span>
          <span>История<strong>{visibleDates.length} нед.</strong></span>
        </div>
      </section>

      <section className="matrix-panel overview-table-panel">
        <div className="section-heading overview-table-heading">
          <h2>
            {effectiveTableMode === 'results'
              ? 'Результаты подразделений'
              : `История · ${effectiveBranch}`}
          </h2>
          {branches.length > 1 && (
            <div
              className="branch-tabs overview-branch-tabs"
              role="tablist"
              aria-label="Подразделение"
            >
              <button
                role="tab"
                aria-selected={effectiveTableMode === 'results'}
                aria-label="Все подразделения"
                className={effectiveTableMode === 'results' ? 'active' : ''}
                onClick={() => setTableMode('results')}
              >
                Все
              </button>
              {branches.map((name) => (
                <button
                  key={name}
                  role="tab"
                  aria-selected={effectiveTableMode === 'history' && name === effectiveBranch}
                  className={effectiveTableMode === 'history' && name === effectiveBranch ? 'active' : ''}
                  onClick={() => openBranch(name)}
                >
                  <i style={{ background: BRANCH_COLORS[name] }} />
                  {name}
                </button>
              ))}
            </div>
          )}
        </div>
        {effectiveTableMode === 'results' ? (
          <div className="matrix-scroll" ref={matrixScrollRef} onScroll={syncStickyHeader}>
            <table
              ref={resultsTableRef}
              className="metrics-matrix"
              style={{ minWidth: resultsTableMinWidth }}
            >
              <ResultsTableHeader branches={branches} dates={resultDates} />
              <tbody>
                {GROUPS.map((group) => (
                  <GroupRows
                    key={group.title}
                    title={group.title}
                    metrics={group.metrics}
                    histories={histories}
                    dates={resultDates}
                    onMetricChange={selectMetricAndReveal}
                    selectedMetric={metric}
                    branches={branches}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="history-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Показатель</th>
                  {historyDates.map((date) => <th key={date}>{shortDate(date)}</th>)}
                  <th
                    className="history-latest-delta"
                    aria-label="Изменение последней недели к предыдущей"
                  >
                    Δ
                  </th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((group) => (
                  <HistoryRows
                    key={group.title}
                    title={group.title}
                    metrics={group.metrics}
                    dates={historyDates}
                    rows={focusRows}
                    selectedMetric={metric}
                    onMetricChange={selectMetricAndReveal}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="trend-panel" ref={trendRef}>
        <div className="section-heading">
          <div>
            <span className="branch-title">
              {effectiveTableMode === 'results' ? (
                <>
                  <span className="branch-dot-stack" aria-hidden="true">
                    {branches.map((name) => (
                      <i key={name} style={{ background: BRANCH_COLORS[name] }} />
                    ))}
                  </span>
                  Все подразделения
                </>
              ) : (
                <>
                  <i style={{ background: BRANCH_COLORS[effectiveBranch] }} />{effectiveBranch}
                </>
              )}
            </span>
            <h2>{METRICS[metric].label}</h2>
          </div>
          <Picker
            label="Показатель графика"
            value={metric}
            onChange={(value) => setMetric(value as Metric)}
            items={metricChoices}
          />
        </div>
        <Chart
          data={chartData}
          series={chartBranches.map((name) => ({
            key: name,
            label: name,
            color: BRANCH_COLORS[name],
          }))}
          metric={metric}
        />
      </section>
    </div>
  );
}

function GroupRows({
  title,
  metrics,
  histories,
  dates,
  selectedMetric,
  onMetricChange,
  branches,
}: {
  title: string;
  metrics: Metric[];
  histories: Record<string, StatRow[]>;
  dates: string[];
  selectedMetric: Metric;
  onMetricChange: (metric: Metric) => void;
  branches: string[];
}) {
  const latest = dates.at(-1) ?? '';
  const previous = dates.at(-2) ?? '';
  return (
    <>
      <tr className="matrix-group">
        <th colSpan={branches.length * (dates.length + 1) + 1}>{title}</th>
      </tr>
      {metrics.map((metric) => (
        <tr
          key={metric}
          className={selectedMetric === metric ? 'metric-selected' : ''}
          onClick={() => onMetricChange(metric)}
        >
          <th><button type="button">{METRICS[metric].label}</button></th>
          {branches.map((name) => {
            const current = rowAt(histories[name], latest)?.metrics[metric];
            const before = rowAt(histories[name], previous)?.metrics[metric];
            return (
              <Fragment key={name}>
                {dates.map((date, index) => (
                  <td
                    key={date}
                    className={`${index === dates.length - 1 ? 'current-week' : 'previous-week'}${index === 0 ? ' branch-start' : ''}`}
                  >
                    <strong>{format(rowAt(histories[name], date)?.metrics[metric], metric)}</strong>
                  </td>
                ))}
                <td className="delta-week branch-end">
                  <MetricDelta current={current} previous={before} metric={metric} />
                </td>
              </Fragment>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function HistoryRows({
  title,
  metrics,
  dates,
  rows,
  selectedMetric,
  onMetricChange,
}: {
  title: string;
  metrics: Metric[];
  dates: string[];
  rows: StatRow[];
  selectedMetric: Metric;
  onMetricChange: (metric: Metric) => void;
}) {
  const latest = dates.at(-1) ?? '';
  const previous = latest ? shiftDate(latest, -7) : '';
  return (
    <>
      <tr className="history-group"><th colSpan={dates.length + 2}>{title}</th></tr>
      {metrics.map((metric) => (
        <tr
          key={metric}
          className={selectedMetric === metric ? 'metric-selected' : ''}
          onClick={() => onMetricChange(metric)}
        >
          <th><button type="button">{METRICS[metric].label}</button></th>
          {dates.map((date, index) => {
            const current = rowAt(rows, date)?.metrics[metric];
            const before = rowAt(rows, shiftDate(date, -7))?.metrics[metric];
            return (
              <td
                key={date}
                className={`history-value-cell${index === dates.length - 1 ? ' history-latest-week' : ''}`}
                aria-label={`${shortDate(date)}: ${format(current, metric)}`}
              >
                <span className="history-week-content">
                  <span className="history-value">{format(current, metric)}</span>
                  <span className="history-inline-delta">
                    <MetricDelta current={current} previous={before} metric={metric} />
                  </span>
                </span>
              </td>
            );
          })}
          <td
            className="history-latest-delta"
            aria-label="Изменение последней недели к предыдущей"
          >
            <MetricDelta
              current={rowAt(rows, latest)?.metrics[metric]}
              previous={rowAt(rows, previous)?.metrics[metric]}
              metric={metric}
            />
          </td>
        </tr>
      ))}
    </>
  );
}
