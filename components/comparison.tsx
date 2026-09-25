'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Minus, Plus, X } from 'lucide-react';
import { Chart, Picker } from '@/components/analytics-ui';
import MultiMetricChart, {
  type MultiMetricMode,
  type MultiMetricSeries,
} from '@/components/multi-metric-chart';
import { Button } from '@/components/ui/button';
import {
  BRANCH_COLORS,
  METRICS,
  format,
  type Metric,
  type Snapshot,
} from '@/lib/model';
import { recentMetricMedian, scopeHistory, timeSeries } from '@/lib/explore';

const GROUPS: { title: string; metrics: Metric[] }[] = [
  {
    title: 'Воронка и реклама',
    metrics: [
      'impressions',
      'views',
      'viewRate',
      'contacts',
      'contactRate',
      'favorites',
      'spend',
      'viewCost',
      'contactCost',
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
const DEFAULT_COMPARISON_METRICS: Metric[] = ['impressions', 'contacts'];
const DEFAULT_DETAIL_METRICS: Metric[] = ['impressions', 'contacts', 'spend'];
const METRIC_COLORS = [
  '#ef3340',
  '#38bdf8',
  '#22c55e',
  '#f59e0b',
  '#a78bfa',
  '#f472b6',
  '#2dd4bf',
  '#fb7185',
  '#84cc16',
  '#60a5fa',
  '#e879f9',
  '#f97316',
  '#14b8a6',
  '#facc15',
  '#818cf8',
  '#4ade80',
  '#c084fc',
  '#fb923c',
  '#67e8f9',
  '#bef264',
  '#fda4af',
];
const metricChoices = ALL_METRICS.map((value) => ({
  value,
  label: METRICS[value].label,
}));

type Scope = string;

function validMetrics(
  value: unknown,
  fallback: Metric[],
  limit?: number,
  allowEmpty = false,
) {
  if (!Array.isArray(value)) return fallback;
  const metrics = [
    ...new Set(
      value.filter(
        (item): item is Metric =>
          typeof item === 'string' && Object.hasOwn(METRICS, item),
      ),
    ),
  ];
  const result = limit ? metrics.slice(0, limit) : metrics;
  return result.length || allowEmpty ? result : fallback;
}

function storedComparison(availableBranches: string[]) {
  const fallback = {
    scope: 'all' as Scope,
    comparisonMetrics: DEFAULT_COMPARISON_METRICS,
    detailMetrics: DEFAULT_DETAIL_METRICS,
    allNormalized: false,
    detailMode: 'median' as MultiMetricMode,
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const saved = JSON.parse(localStorage.getItem('pik-comparison') ?? 'null');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved))
      return fallback;
    const scope =
      saved.scope === 'all' || availableBranches.includes(saved.scope)
        ? saved.scope
        : 'all';
    return {
      scope,
      comparisonMetrics: validMetrics(
        saved.comparisonMetrics ?? saved.metrics,
        DEFAULT_COMPARISON_METRICS,
        4,
      ),
      detailMetrics: validMetrics(
        saved.detailMetrics,
        DEFAULT_DETAIL_METRICS,
        undefined,
        true,
      ),
      allNormalized: saved.allNormalized === true || saved.indexed === true,
      detailMode: (saved.detailMode === 'own'
        ? 'own'
        : 'median') as MultiMetricMode,
    };
  } catch {
    return fallback;
  }
}

export default function Comparison({
  snapshot,
  from,
  to,
  availableBranches,
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  availableBranches: string[];
}) {
  const [initial] = useState(() => storedComparison(availableBranches));
  const [scope, setScope] = useState<Scope>(initial.scope);
  const [comparisonMetrics, setComparisonMetrics] = useState<Metric[]>(
    initial.comparisonMetrics,
  );
  const [detailMetrics, setDetailMetrics] = useState<Metric[]>(
    initial.detailMetrics,
  );
  const [allNormalized, setAllNormalized] = useState(initial.allNormalized);
  const [detailMode, setDetailMode] = useState<MultiMetricMode>(
    initial.detailMode,
  );
  const activeScope =
    scope === 'all' || availableBranches.includes(scope) ? scope : 'all';

  useEffect(() => {
    try {
      localStorage.setItem(
        'pik-comparison',
        JSON.stringify({
          scope: activeScope,
          comparisonMetrics,
          detailMetrics,
          allNormalized,
          detailMode,
        }),
      );
    } catch {
      /* Device preferences are optional. */
    }
  }, [
    activeScope,
    allNormalized,
    comparisonMetrics,
    detailMetrics,
    detailMode,
  ]);

  function addComparisonMetric() {
    const next = metricChoices.find(
      (item) => !comparisonMetrics.includes(item.value),
    );
    if (next && comparisonMetrics.length < 4) {
      setComparisonMetrics((current) => [...current, next.value]);
    }
  }

  return (
    <div className="comparison-page">
      <section className="comparison-controls">
        <div>
          <span className="eyebrow">ДИНАМИКА ПО НЕДЕЛЯМ</span>
          <h2>
            {activeScope === 'all'
              ? 'Сравнение подразделений'
              : `${activeScope} · показатели`}
          </h2>
          <p>
            {activeScope === 'all'
              ? 'Каждый график сравнивает один показатель по всем подразделениям.'
              : detailMode === 'median'
                ? 'Норма — медиана последних 12 доступных недель. Пропуски не считаются нулями.'
                : 'Каждая линия использует собственную шкалу; сравнивайте направление и моменты изменений.'}
          </p>
        </div>
        <div className="comparison-actions">
          {activeScope === 'all' ? (
            <>
              <button
                className={`mode-button ${!allNormalized ? 'active' : ''}`}
                onClick={() => setAllNormalized(false)}
              >
                Значения
              </button>
              <button
                className={`mode-button ${allNormalized ? 'active' : ''}`}
                onClick={() => setAllNormalized(true)}
              >
                Относительно нормы
              </button>
            </>
          ) : (
            <>
              <button
                className={`mode-button ${detailMode === 'median' ? 'active' : ''}`}
                onClick={() => setDetailMode('median')}
              >
                Относительно нормы
              </button>
              <button
                className={`mode-button ${detailMode === 'own' ? 'active' : ''}`}
                onClick={() => setDetailMode('own')}
              >
                Свои шкалы
              </button>
            </>
          )}
        </div>
      </section>

      <section
        className="branch-filter comparison-scope"
        aria-label="Режим подразделения"
      >
        <button
          className={activeScope === 'all' ? 'active' : ''}
          onClick={() => setScope('all')}
        >
          Все подразделения
        </button>
        {availableBranches.map((branch) => (
          <button
            key={branch}
            className={activeScope === branch ? 'active' : ''}
            onClick={() => setScope(branch)}
          >
            <i style={{ background: BRANCH_COLORS[branch] }} />
            {branch}
          </button>
        ))}
      </section>

      {activeScope === 'all' ? (
        <>
          <div className="comparison-charts">
            {comparisonMetrics.map((metric) => (
              <MetricChart
                key={metric}
                metric={metric}
                branches={availableBranches}
                snapshot={snapshot}
                from={from}
                to={to}
                normalized={allNormalized}
                removable={comparisonMetrics.length > 1}
                onRemove={() =>
                  setComparisonMetrics((current) =>
                    current.filter((value) => value !== metric),
                  )
                }
                onChange={(value) => {
                  const nextMetric = value as Metric;
                  setComparisonMetrics((current) => {
                    const currentIndex = current.indexOf(metric);
                    const nextIndex = current.indexOf(nextMetric);
                    if (currentIndex < 0 || currentIndex === nextIndex)
                      return current;
                    const next = [...current];
                    next[currentIndex] = nextMetric;
                    if (nextIndex >= 0) next[nextIndex] = metric;
                    return next;
                  });
                }}
              />
            ))}
          </div>
          {comparisonMetrics.length < 4 && (
            <div className="add-chart">
              <Button variant="outline" onClick={addComparisonMetric}>
                <Plus />
                Добавить график
              </Button>
              <span>До четырёх показателей одновременно</span>
            </div>
          )}
        </>
      ) : (
        <BranchMetrics
          snapshot={snapshot}
          branch={activeScope}
          from={from}
          to={to}
          metrics={detailMetrics}
          mode={detailMode}
          onMetricsChange={setDetailMetrics}
        />
      )}
    </div>
  );
}

function BranchMetrics({
  snapshot,
  branch,
  from,
  to,
  metrics,
  mode,
  onMetricsChange,
}: {
  snapshot: Snapshot;
  branch: string;
  from: string;
  to: string;
  metrics: Metric[];
  mode: MultiMetricMode;
  onMetricsChange: (metrics: Metric[]) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState(
    () => new Set(GROUPS.slice(0, 2).map((group) => group.title)),
  );
  const history = useMemo(
    () => scopeHistory(snapshot.stats, branch),
    [branch, snapshot],
  );
  const data = useMemo(() => {
    const rows = new Map<string, Record<string, unknown>>();
    for (const metric of metrics) {
      for (const point of timeSeries(history, metric, 'week', from, to)) {
        const row = rows.get(point.date) ?? { date: point.date };
        row[metric] = point.value;
        rows.set(point.date, row);
      }
    }
    return [...rows.values()].sort((a, b) =>
      String(a.date).localeCompare(String(b.date)),
    ) as (Record<string, unknown> & { date: string })[];
  }, [from, history, metrics, to]);
  const series = useMemo(
    () =>
      metrics.map((metric) => {
        const baseline = recentMetricMedian(history, metric, to);
        return {
          metric,
          color:
            METRIC_COLORS[ALL_METRICS.indexOf(metric) % METRIC_COLORS.length],
          median: baseline.value,
          medianCount: baseline.count,
        } satisfies MultiMetricSeries;
      }),
    [history, metrics, to],
  );

  function toggleMetric(metric: Metric) {
    onMetricsChange(
      metrics.includes(metric)
        ? metrics.filter((value) => value !== metric)
        : ALL_METRICS.filter((value) => [...metrics, metric].includes(value)),
    );
  }

  function toggleGroup(groupMetrics: Metric[]) {
    const allSelected = groupMetrics.every((metric) =>
      metrics.includes(metric),
    );
    const next = allSelected
      ? metrics.filter((metric) => !groupMetrics.includes(metric))
      : [...new Set([...metrics, ...groupMetrics])];
    onMetricsChange(ALL_METRICS.filter((metric) => next.includes(metric)));
  }

  function toggleGroupExpanded(title: string) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <div className="metric-workbench">
      <aside className="metric-groups panel">
        <header>
          <div>
            <span className="eyebrow">ПОКАЗАТЕЛИ</span>
            <strong>{metrics.length} выбрано</strong>
          </div>
          {metrics.length > 0 && (
            <button type="button" onClick={() => onMetricsChange([])}>
              Очистить
            </button>
          )}
        </header>
        {GROUPS.map((group, groupIndex) => {
          const selectedCount = group.metrics.filter((metric) =>
            metrics.includes(metric),
          ).length;
          const allSelected = selectedCount === group.metrics.length;
          const partiallySelected = selectedCount > 0 && !allSelected;
          const expanded = expandedGroups.has(group.title);
          const optionsId = `comparison-metric-group-${groupIndex}`;
          return (
            <section
              className={`metric-group ${expanded ? 'expanded' : 'collapsed'}`}
              key={group.title}
            >
              <div className="metric-group-header">
                <button
                  type="button"
                  className={`metric-group-toggle ${selectedCount ? 'selected' : ''}`}
                  aria-label={`${allSelected ? 'Снять выбор группы' : 'Выбрать группу'} «${group.title}»`}
                  aria-pressed={allSelected}
                  onClick={() => toggleGroup(group.metrics)}
                >
                  <span className="metric-check" aria-hidden="true">
                    {allSelected ? (
                      <Check />
                    ) : partiallySelected ? (
                      <Minus />
                    ) : null}
                  </span>
                  <strong>{group.title}</strong>
                  <small>
                    {selectedCount}/{group.metrics.length}
                  </small>
                </button>
                <button
                  type="button"
                  className="metric-group-disclosure"
                  aria-label={`${expanded ? 'Свернуть' : 'Развернуть'} группу «${group.title}»`}
                  aria-expanded={expanded}
                  aria-controls={optionsId}
                  onClick={() => toggleGroupExpanded(group.title)}
                >
                  <ChevronDown />
                </button>
              </div>
              {expanded && (
                <div className="metric-options" id={optionsId}>
                  {group.metrics.map((metric) => (
                    <label key={metric}>
                      <input
                        type="checkbox"
                        checked={metrics.includes(metric)}
                        onChange={() => toggleMetric(metric)}
                      />
                      <span>{METRICS[metric].label}</span>
                    </label>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </aside>

      <section className="metric-overlay-panel panel">
        <div className="section-heading metric-overlay-heading">
          <div>
            <span className="branch-title">
              <i style={{ background: BRANCH_COLORS[branch] }} />
              {branch}
            </span>
            <h2>
              {mode === 'median'
                ? 'Динамика относительно нормы'
                : 'Динамика на собственных шкалах'}
            </h2>
          </div>
          <p>
            {mode === 'median'
              ? '100% — медиана до 12 доступных недель'
              : 'Шкала слева относится к выделенной линии'}
          </p>
        </div>
        {metrics.length ? (
          <MultiMetricChart data={data} series={series} mode={mode} />
        ) : (
          <div className="empty-chart">Выберите хотя бы один показатель.</div>
        )}
      </section>
    </div>
  );
}

function MetricChart({
  metric,
  branches,
  snapshot,
  from,
  to,
  normalized,
  removable,
  onRemove,
  onChange,
}: {
  metric: Metric;
  branches: string[];
  snapshot: Snapshot;
  from: string;
  to: string;
  normalized: boolean;
  removable: boolean;
  onRemove: () => void;
  onChange: (value: string) => void;
}) {
  const prepared = useMemo(
    () =>
      branches.map((branch) => {
        const history = scopeHistory(snapshot.stats, branch);
        return {
          branch,
          points: timeSeries(history, metric, 'week', from, to),
          baseline: recentMetricMedian(history, metric, to),
        };
      }),
    [branches, snapshot, metric, from, to],
  );
  const dates = [
    ...new Set(
      prepared.flatMap((item) => item.points.map((point) => point.date)),
    ),
  ].sort();
  const data = dates.map((date) => {
    const row: Record<string, unknown> = { date };
    prepared.forEach((item) => {
      const value =
        item.points.find((point) => point.date === date)?.value ?? null;
      row[item.branch] =
        normalized && value != null
          ? item.baseline.value != null && item.baseline.value > 0
            ? (value / item.baseline.value) * 100
            : null
          : value;
    });
    return row;
  });

  return (
    <section className="comparison-chart panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {normalized
              ? 'НОРМА — МЕДИАНА ДО 12 НЕДЕЛЬ'
              : 'СРАВНЕНИЕ ПО НЕДЕЛЯМ'}
          </span>
          <h2>{METRICS[metric].label}</h2>
        </div>
        <div className="chart-actions">
          <Picker
            label="Показатель графика"
            value={metric}
            onChange={onChange}
            items={metricChoices}
          />
          {removable && (
            <Button
              className="chart-remove-button"
              variant="ghost"
              onClick={onRemove}
              aria-label="Убрать график"
            >
              <X />
            </Button>
          )}
        </div>
      </div>
      <Chart
        data={data}
        series={prepared.map((item) => ({
          key: item.branch,
          label: item.branch,
          color: BRANCH_COLORS[item.branch],
        }))}
        metric={metric}
        indexed={normalized}
      />
      <div className="chart-summary">
        {prepared.map((item) => {
          const value = item.points.findLast(
            (point) => point.value != null,
          )?.value;
          const index =
            value != null &&
            item.baseline.value != null &&
            item.baseline.value > 0
              ? (value / item.baseline.value) * 100
              : null;
          return (
            <span key={item.branch}>
              <i style={{ background: BRANCH_COLORS[item.branch] }} />
              {item.branch}
              <strong>{format(value, metric)}</strong>
              {normalized && (
                <small>
                  {index == null
                    ? 'нет нормы'
                    : `${index.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% нормы · ${item.baseline.count} нед.`}
                </small>
              )}
            </span>
          );
        })}
      </div>
    </section>
  );
}
