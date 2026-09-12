'use client';

import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from 'lucide-react';
import { Chart, Picker } from '@/components/analytics-ui';
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

const BRANCHES = ['И31', 'Х7', 'Автово', 'Б116', 'Ворошилова'];
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
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  branch: string;
  onBranchChange: (branch: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>('contacts');
  const histories = useMemo(
    () =>
      Object.fromEntries(
        BRANCHES.map((name) => [name, scopeHistory(snapshot.stats, name)]),
      ) as Record<string, StatRow[]>,
    [snapshot],
  );
  const visibleDates = [
    ...new Set(
      BRANCHES.flatMap((name) => histories[name].map((row) => row.end)).filter(
        (date) => date >= from && date <= to,
      ),
    ),
  ].sort();
  const latest = visibleDates.at(-1) ?? '';
  const previous = latest ? shiftDate(latest, -7) : '';
  const focusRows = histories[branch] ?? histories['И31'];
  const historyDates = focusRows
    .map((row) => row.end)
    .filter((date) => date >= from && date <= to)
    .sort()
    .slice(-8);
  const points = timeSeries(focusRows, metric, 'week', from, to);
  const metricChoices = ALL_METRICS.map((value) => ({
    value,
    label: METRICS[value].label,
  }));

  if (!latest) return <div className="loading-state">За выбранный период нет данных.</div>;

  return (
    <div className="overview-page">
      <section className="week-intro">
        <div>
          <span className="overline">ПОСЛЕДНЯЯ ЗАГРУЖЕННАЯ НЕДЕЛЯ</span>
          <h2>{shortDate(latest)}</h2>
          <p>Под значением показано изменение к неделе {shortDate(previous)}.</p>
        </div>
        <div className="week-summary">
          <span>Подразделений<strong>5</strong></span>
          <span>Показателей<strong>{ALL_METRICS.length}</strong></span>
          <span>История<strong>{visibleDates.length} нед.</strong></span>
        </div>
      </section>

      <section className="matrix-panel">
        <div className="section-heading">
          <div>
            <h2>Результаты подразделений</h2>
            <p>Нажмите на подразделение, чтобы открыть его историю ниже.</p>
          </div>
          <span className="matrix-period">{shortDate(previous)} → {shortDate(latest)}</span>
        </div>
        <div className="matrix-scroll">
          <table className="metrics-matrix">
            <thead>
              <tr>
                <th>Показатель</th>
                {BRANCHES.map((name) => (
                  <th key={name} className={branch === name ? 'selected' : ''}>
                    <button onClick={() => onBranchChange(name)}>
                      <i style={{ background: BRANCH_COLORS[name] }} />
                      {name}<ChevronRight />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((group) => (
                <GroupRows
                  key={group.title}
                  title={group.title}
                  metrics={group.metrics}
                  histories={histories}
                  latest={latest}
                  previous={previous}
                  selectedBranch={branch}
                  onMetricChange={setMetric}
                  selectedMetric={metric}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="focus-panel">
        <div className="focus-heading">
          <div>
            <span className="branch-title">
              <i style={{ background: BRANCH_COLORS[branch] }} />{branch}
            </span>
            <h2>История подразделения</h2>
            <p>Последние восемь недель выбранного периода.</p>
          </div>
          <div className="branch-tabs">
            {BRANCHES.map((name) => (
              <button
                key={name}
                className={name === branch ? 'active' : ''}
                onClick={() => onBranchChange(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="history-scroll">
          <table className="history-table">
            <thead>
              <tr>
                <th>Показатель</th>
                {historyDates.map((date) => <th key={date}>{shortDate(date)}</th>)}
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
                  onMetricChange={setMetric}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="trend-panel">
        <div className="section-heading">
          <div>
            <span className="branch-title">
              <i style={{ background: BRANCH_COLORS[branch] }} />{branch}
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
          data={points}
          series={[{ key: 'value', label: branch, color: BRANCH_COLORS[branch] }]}
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
  latest,
  previous,
  selectedBranch,
  selectedMetric,
  onMetricChange,
}: {
  title: string;
  metrics: Metric[];
  histories: Record<string, StatRow[]>;
  latest: string;
  previous: string;
  selectedBranch: string;
  selectedMetric: Metric;
  onMetricChange: (metric: Metric) => void;
}) {
  return (
    <>
      <tr className="matrix-group"><th colSpan={6}>{title}</th></tr>
      {metrics.map((metric) => (
        <tr key={metric} className={selectedMetric === metric ? 'metric-selected' : ''}>
          <th><button onClick={() => onMetricChange(metric)}>{METRICS[metric].label}</button></th>
          {BRANCHES.map((name) => {
            const current = rowAt(histories[name], latest)?.metrics[metric];
            const before = rowAt(histories[name], previous)?.metrics[metric];
            return (
              <td key={name} className={selectedBranch === name ? 'selected' : ''}>
                <strong>{format(current, metric)}</strong>
                <MetricDelta current={current} previous={before} metric={metric} />
              </td>
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
  return (
    <>
      <tr className="history-group"><th colSpan={dates.length + 1}>{title}</th></tr>
      {metrics.map((metric) => (
        <tr key={metric} className={selectedMetric === metric ? 'metric-selected' : ''}>
          <th><button onClick={() => onMetricChange(metric)}>{METRICS[metric].label}</button></th>
          {dates.map((date) => (
            <td key={date}>{format(rowAt(rows, date)?.metrics[metric], metric)}</td>
          ))}
        </tr>
      ))}
    </>
  );
}
