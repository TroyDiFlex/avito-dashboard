'use client';

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Chart, Picker } from '@/components/analytics-ui';
import { Button } from '@/components/ui/button';
import {
  BRANCH_COLORS,
  METRICS,
  format,
  type Metric,
  type Snapshot,
} from '@/lib/model';
import { scopeHistory, timeSeries } from '@/lib/explore';

const DEFAULT_METRICS: Metric[] = ['impressions', 'contacts'];
const metricChoices = (Object.keys(METRICS) as Metric[]).map((value) => ({
  value,
  label: METRICS[value].label,
}));

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
  const [metrics, setMetrics] = useState<Metric[]>(DEFAULT_METRICS);
  const [selectedBranches, setSelectedBranches] = useState(availableBranches);
  const [indexed, setIndexed] = useState(false);
  const visibleSelection = selectedBranches.filter((branch) =>
    availableBranches.includes(branch),
  );
  const branches = visibleSelection.length ? visibleSelection : [availableBranches[0]];

  function toggleBranch(branch: string) {
    setSelectedBranches((current) =>
      current.includes(branch)
        ? current.length === 1
          ? current
          : current.filter((value) => value !== branch)
        : [...current, branch],
    );
  }

  function addMetric() {
    const next = metricChoices.find((item) => !metrics.includes(item.value));
    if (next && metrics.length < 4) setMetrics((current) => [...current, next.value]);
  }

  return (
    <div className="comparison-page">
      <section className="comparison-controls">
        <div>
          <span className="eyebrow">ЕДИНАЯ ШКАЛА И ЦВЕТА</span>
          <h2>Динамика подразделений</h2>
          <p>Каждый график сравнивает один показатель по выбранным подразделениям.</p>
        </div>
        <div className="comparison-actions">
          <button
            className={`mode-button ${!indexed ? 'active' : ''}`}
            onClick={() => setIndexed(false)}
          >
            Значения
          </button>
          <button
            className={`mode-button ${indexed ? 'active' : ''}`}
            onClick={() => setIndexed(true)}
          >
            Изменение от 100%
          </button>
        </div>
      </section>

      <section className="branch-filter" aria-label="Подразделения на графиках">
        {availableBranches.map((branch) => (
          <button
            key={branch}
            className={branches.includes(branch) ? 'active' : ''}
            onClick={() => toggleBranch(branch)}
          >
            <i style={{ background: BRANCH_COLORS[branch] }} />
            {branch}
          </button>
        ))}
      </section>

      <div className="comparison-charts">
        {metrics.map((metric) => (
          <MetricChart
            key={metric}
            metric={metric}
            branches={branches}
            snapshot={snapshot}
            from={from}
            to={to}
            indexed={indexed}
            removable={metrics.length > 1}
            onRemove={() =>
              setMetrics((current) => current.filter((value) => value !== metric))
            }
            onChange={(value) => {
              const nextMetric = value as Metric;
              setMetrics((current) => {
                const currentIndex = current.indexOf(metric);
                const nextIndex = current.indexOf(nextMetric);
                if (currentIndex < 0 || currentIndex === nextIndex) return current;

                const next = [...current];
                next[currentIndex] = nextMetric;
                if (nextIndex >= 0) next[nextIndex] = metric;
                return next;
              });
            }}
          />
        ))}
      </div>

      {metrics.length < 4 && (
        <div className="add-chart">
          <Button variant="outline" onClick={addMetric}><Plus />Добавить график</Button>
          <span>До четырёх показателей одновременно</span>
        </div>
      )}
    </div>
  );
}

function MetricChart({
  metric,
  branches,
  snapshot,
  from,
  to,
  indexed,
  removable,
  onRemove,
  onChange,
}: {
  metric: Metric;
  branches: string[];
  snapshot: Snapshot;
  from: string;
  to: string;
  indexed: boolean;
  removable: boolean;
  onRemove: () => void;
  onChange: (value: string) => void;
}) {
  const prepared = useMemo(
    () =>
      branches.map((branch) => ({
        branch,
        points: timeSeries(scopeHistory(snapshot.stats, branch), metric, 'week', from, to),
      })),
    [branches, snapshot, metric, from, to],
  );
  const dates = [...new Set(prepared.flatMap((item) => item.points.map((point) => point.date)))].sort();
  const baseDate = dates.find((date) =>
    prepared.every((item) => {
      const value = item.points.find((point) => point.date === date)?.value;
      return value != null && value !== 0;
    }),
  );
  const data = dates.map((date) => {
    const row: Record<string, unknown> = { date };
    prepared.forEach((item) => {
      const value = item.points.find((point) => point.date === date)?.value ?? null;
      const base = item.points.find((point) => point.date === baseDate)?.value;
      row[item.branch] = indexed && value != null && base ? (value / base) * 100 : value;
    });
    return row;
  });

  return (
    <section className="comparison-chart panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">СРАВНЕНИЕ ПО НЕДЕЛЯМ</span>
          <h2>{METRICS[metric].label}</h2>
        </div>
        <div className="chart-actions">
          <Picker
            label="Показатель графика"
            value={metric}
            onChange={onChange}
            items={metricChoices.filter(
              (item) => item.value === metric || Boolean(METRICS[item.value]),
            )}
          />
          {removable && (
            <Button className="chart-remove-button" variant="ghost" onClick={onRemove} aria-label="Убрать график">
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
        indexed={indexed}
      />
      <div className="chart-summary">
        {prepared.map((item) => {
          const value = item.points.at(-1)?.value;
          return (
            <span key={item.branch}>
              <i style={{ background: BRANCH_COLORS[item.branch] }} />
              {item.branch}<strong>{format(value, metric)}</strong>
            </span>
          );
        })}
      </div>
    </section>
  );
}
