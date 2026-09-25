'use client';

import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { format, METRICS, type Metric } from '@/lib/model';
import { periodLabel } from '@/lib/explore';

export type MultiMetricMode = 'median' | 'own';

export type MultiMetricSeries = {
  metric: Metric;
  color: string;
  median: number | null;
  medianCount: number;
};

type ChartRow = Record<string, unknown> & { date: string };
type Domain = { low: number; high: number };

const plotKey = (metric: Metric) => `plot:${metric}`;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function paddedDomain(values: number[]): Domain | null {
  if (!values.length) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * 0.08, 1);
    return { low: minimum - padding, high: maximum + padding };
  }
  const padding = (maximum - minimum) * 0.08;
  return { low: minimum - padding, high: maximum + padding };
}

function scaleToPlot(value: number, domain: Domain) {
  return ((value - domain.low) / (domain.high - domain.low)) * 100;
}

export default function MultiMetricChart({
  data,
  series,
  mode,
}: {
  data: ChartRow[];
  series: MultiMetricSeries[];
  mode: MultiMetricMode;
}) {
  const [pinnedMetric, setPinnedMetric] = useState<Metric | null>(null);
  const [hoveredMetric, setHoveredMetric] = useState<Metric | null>(null);
  const domains = useMemo(
    () =>
      Object.fromEntries(
        series.map((item) => [
          item.metric,
          paddedDomain(
            data
              .map((row) => row[item.metric])
              .filter((value): value is number => finite(value)),
          ),
        ]),
      ) as Partial<Record<Metric, Domain | null>>,
    [data, series],
  );
  const usableSeries = useMemo(
    () =>
      mode === 'median'
        ? series.filter((item) => item.median != null && item.median > 0)
        : series.filter((item) => domains[item.metric] != null),
    [domains, mode, series],
  );
  const selectedMetric = usableSeries.some(
    (item) => item.metric === pinnedMetric,
  )
    ? pinnedMetric!
    : usableSeries[0]?.metric;
  const highlightedMetric = usableSeries.some(
    (item) => item.metric === hoveredMetric,
  )
    ? hoveredMetric
    : null;
  const scaleMetric = highlightedMetric ?? selectedMetric;
  const prepared = useMemo(
    () =>
      data.map((row) => {
        const next: ChartRow = { ...row };
        for (const item of usableSeries) {
          const raw = row[item.metric];
          if (!finite(raw)) {
            next[plotKey(item.metric)] = null;
          } else if (mode === 'median') {
            next[plotKey(item.metric)] = (raw / item.median!) * 100;
          } else {
            const domain = domains[item.metric];
            next[plotKey(item.metric)] = domain
              ? scaleToPlot(raw, domain)
              : null;
          }
        }
        return next;
      }),
    [data, domains, mode, usableSeries],
  );
  const medianValues =
    mode === 'median'
      ? prepared.flatMap((row) =>
          usableSeries
            .map((item) => row[plotKey(item.metric)])
            .filter((value): value is number => finite(value)),
        )
      : [];
  const medianExtent = paddedDomain([...medianValues, 100]);
  const activeDomain = scaleMetric ? domains[scaleMetric] : null;
  const skipped = series.filter(
    (item) => mode === 'median' && (item.median == null || item.median <= 0),
  );

  if (!usableSeries.length) {
    return (
      <div className="empty-chart">
        Норму нельзя рассчитать: у выбранных показателей нет положительной
        медианы.
      </div>
    );
  }

  return (
    <>
      <div
        className="metric-chart-legend"
        aria-label="Показатели графика"
        onMouseLeave={() => setHoveredMetric(null)}
      >
        {usableSeries.map((item) => (
          <button
            key={item.metric}
            type="button"
            className={selectedMetric === item.metric ? 'active' : ''}
            aria-pressed={selectedMetric === item.metric}
            onClick={() => setPinnedMetric(item.metric)}
            onMouseEnter={() => setHoveredMetric(item.metric)}
            onMouseLeave={() => setHoveredMetric(null)}
          >
            <i style={{ background: item.color }} />
            <span>{METRICS[item.metric].label}</span>
            {mode === 'median' && <small>{item.medianCount} нед.</small>}
          </button>
        ))}
      </div>
      <figure
        className="chart multi-metric-chart"
        aria-label={
          mode === 'median'
            ? 'Динамика показателей относительно медианы'
            : 'Динамика показателей на собственных шкалах'
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={prepared}
            margin={{ top: 14, right: 20, bottom: 4, left: 14 }}
          >
            <CartesianGrid
              stroke="#2a3239"
              strokeDasharray="3 6"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => periodLabel(String(value), 'week')}
              tick={{ fill: '#99a5af', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
              dy={12}
            />
            <YAxis
              width={82}
              domain={
                mode === 'median'
                  ? [medianExtent?.low ?? 0, medianExtent?.high ?? 100]
                  : [0, 100]
              }
              tickFormatter={(value) => {
                if (mode === 'median') return `${Math.round(Number(value))}%`;
                if (!scaleMetric || !activeDomain) return '';
                const raw =
                  activeDomain.low +
                  (Number(value) / 100) *
                    (activeDomain.high - activeDomain.low);
                return format(raw, scaleMetric, true);
              }}
              tick={{ fill: '#99a5af', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            {mode === 'median' && (
              <ReferenceLine
                y={100}
                stroke="#7f8a94"
                strokeDasharray="5 5"
                label={{
                  value: 'норма',
                  fill: '#99a5af',
                  fontSize: 11,
                  position: 'insideTopRight',
                }}
              />
            )}
            <Tooltip
              cursor={{ stroke: '#707984', strokeDasharray: '3 4' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as ChartRow | undefined;
                if (!row) return null;
                return (
                  <div className="multi-metric-tooltip">
                    <strong>{periodLabel(String(label), 'week')}</strong>
                    {usableSeries.map((item) => {
                      const raw = row[item.metric];
                      if (!finite(raw)) return null;
                      const normalized = row[plotKey(item.metric)];
                      return (
                        <span key={item.metric}>
                          <i style={{ background: item.color }} />
                          <em>{METRICS[item.metric].label}</em>
                          <b>{format(raw, item.metric)}</b>
                          {mode === 'median' && finite(normalized) && (
                            <small>
                              {normalized.toLocaleString('ru-RU', {
                                maximumFractionDigits: 1,
                              })}
                              % нормы
                            </small>
                          )}
                        </span>
                      );
                    })}
                  </div>
                );
              }}
            />
            {usableSeries.map((item) => {
              const highlighted =
                !highlightedMetric || highlightedMetric === item.metric;
              return (
                <Line
                  key={item.metric}
                  dataKey={plotKey(item.metric)}
                  name={METRICS[item.metric].label}
                  stroke={item.color}
                  strokeWidth={highlighted ? 2.8 : 1.6}
                  strokeOpacity={highlighted ? 1 : 0.22}
                  type="linear"
                  dot={
                    prepared.length < 18 && highlighted
                      ? { r: 2.8, fill: '#151c22', strokeWidth: 2 }
                      : false
                  }
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </figure>
      {skipped.length > 0 && (
        <p className="metric-chart-note">
          Без линии нормы:{' '}
          {skipped.map((item) => METRICS[item.metric].label).join(', ')} —
          медиана неположительна или отсутствует.
        </p>
      )}
    </>
  );
}
