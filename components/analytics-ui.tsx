'use client';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { COLORS, METRICS, format, type Metric } from '@/lib/model';
import { periodLabel, type Grain } from '@/lib/explore';
type Choice = { value: string; label: string };
export function Picker({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: Choice[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(String(v));
      }}
      items={items}
    >
      <SelectTrigger className="picker" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function Spark({
  values,
  color = COLORS[0],
}: {
  values: (number | null)[];
  color?: string;
}) {
  const known = values.filter(
    (v): v is number => v !== null && Number.isFinite(v),
  );
  if (!known.length) return <span className="muted">Нет данных</span>;
  const lo = Math.min(...known),
    hi = Math.max(...known),
    paths: string[] = [];
  let path = '';
  values.forEach((v, i) => {
    if (v === null) {
      if (path) paths.push(path);
      path = '';
      return;
    }
    const x = 3 + (i / Math.max(values.length - 1, 1)) * 116,
      y = hi === lo ? 19 : 34 - ((v - lo) / (hi - lo)) * 28;
    path += `${path ? ' L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  if (path) paths.push(path);
  return (
    <svg
      viewBox="0 0 122 40"
      width="122"
      height="40"
      aria-label="Недельная динамика"
    >
      <title>Недельная динамика</title>
      {paths.map((p, i) => (
        <path
          key={i}
          d={p}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
        />
      ))}
      {known.length === 1 && <circle cx="61" cy="19" r="3" fill={color} />}
    </svg>
  );
}

export function Delta({
  current,
  previous,
  metric,
}: {
  current: number | null;
  previous: number | null;
  metric: Metric;
}) {
  if (current == null || previous == null || previous === 0)
    return <span className="delta neutral">Нет базы сравнения</span>;
  const difference = ((current - previous) / Math.abs(previous)) * 100;
  const good =
    METRICS[metric].good === 'neutral' || difference === 0
      ? 'neutral'
      : difference > 0 === (METRICS[metric].good === 'up')
        ? 'positive'
        : 'negative';
  return (
    <span className={`delta ${good}`}>
      {difference >= 0 ? (
        <ArrowUpRight size={15} />
      ) : (
        <ArrowDownRight size={15} />
      )}
      {Math.abs(difference).toLocaleString('ru-RU', {
        maximumFractionDigits: 1,
      })}
      %
    </span>
  );
}

type Series = { key: string; label: string; color: string };
export function Chart({
  data,
  series,
  metric,
  indexed = false,
  grain = 'week',
}: {
  data: Record<string, unknown>[];
  series: Series[];
  metric: Metric;
  indexed?: boolean;
  grain?: Grain;
}) {
  if (!data.length)
    return <div className="empty-chart">За выбранный период нет данных</div>;
  return (
    <figure className="chart" aria-label={`График: ${METRICS[metric].label}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 12, right: 18, bottom: 4, left: 12 }}
        >
          <CartesianGrid
            stroke="#2a3239"
            strokeDasharray="3 6"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => periodLabel(value, grain)}
            tick={{ fill: '#99a5af', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            minTickGap={40}
            dy={12}
          />
          <YAxis
            width={76}
            tickFormatter={(v) =>
              indexed ? `${Math.round(v)}%` : format(v, metric, true)
            }
            tick={{ fill: '#99a5af', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#202831',
              border: '1px solid #3c4955',
              borderRadius: 12,
              color: '#f3f5f7',
              fontSize: 14,
            }}
            labelFormatter={(v) => periodLabel(String(v), grain)}
            formatter={(v, name) => [
              indexed ? `${Number(v).toFixed(1)}%` : format(Number(v), metric),
              name,
            ]}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2.5}
              type="linear"
              dot={
                data.length < 18
                  ? { r: 3, fill: '#151c22', strokeWidth: 2 }
                  : false
              }
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </figure>
  );
}
