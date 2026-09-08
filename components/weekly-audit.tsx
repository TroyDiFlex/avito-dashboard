'use client';
import { memo, useMemo } from 'react';
import { Delta } from '@/components/analytics-ui';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  calendar,
  dateRangeLabel,
  format,
  METRICS,
  shiftDate,
  shortDate,
  type Metric,
  type StatRow,
} from '@/lib/model';
import { scopeLabel } from '@/lib/explore';

const groups: {
  id: string;
  label: string;
  description: string;
  color: string;
  metrics: Metric[];
}[] = [
  {
    id: 'advertising',
    label: 'Реклама',
    description: 'Охват → интерес → обращения и их стоимость',
    color: '#78a9ff',
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
    id: 'finance',
    label: 'Финансовый результат',
    description: 'Маржа подразделения и ROI из исходной таблицы',
    color: '#b59bff',
    metrics: ['marginParts', 'marginService', 'margin', 'roi'],
  },
  {
    id: 'reputation',
    label: 'Репутация и ответы',
    description: 'Рейтинг, отзывы и скорость реакции',
    color: '#5dd6bd',
    metrics: ['rating', 'reviews', 'lowReviews', 'responseTime'],
  },
  {
    id: 'inventory',
    label: 'Объявления и склад',
    description: 'Что опубликовано, что снято и сколько на складе',
    color: '#e8ba75',
    metrics: ['active', 'unpublished', 'archived', 'stock'],
  },
];
const units = {
  count: 'шт.',
  money: '₽',
  percent: '%',
  decimal: 'баллы',
  minutes: 'мин',
};

// Bounded SVG charts: no animation, resize observers or chart instances per metric.
const AuditChart = memo(function AuditChart({
  dates,
  values,
  metric,
  color,
}: {
  dates: string[];
  values: (number | null)[];
  metric: Metric;
  color: string;
}) {
  const known = values.filter(
    (v): v is number => v != null && Number.isFinite(v),
  );
  if (!known.length)
    return <div className="audit-empty">Нет значений за выбранную историю</div>;
  const low = Math.min(0, ...known),
    peak = Math.max(0, ...known);
  const high = metric === 'rating' ? Math.max(5, peak) : peak || 1;
  const left = 65,
    right = 342,
    top = 18,
    bottom = 132;
  const first = Date.parse(dates[0]),
    span = Date.parse(dates.at(-1)!) - first;
  const x = (i: number) =>
    span
      ? left + ((Date.parse(dates[i]) - first) / span) * (right - left)
      : (left + right) / 2;
  const y = (value: number) =>
    bottom - ((value - low) / (high - low)) * (bottom - top);
  let path = '',
    connected = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) {
      connected = false;
      return;
    }
    path += `${connected ? 'L' : 'M'}${x(i).toFixed(2)},${y(v).toFixed(2)} `;
    connected = true;
  });
  const ticks = [
    ...new Set([0, Math.floor((dates.length - 1) / 2), dates.length - 1]),
  ];
  const axis = (v: number) =>
    new Intl.NumberFormat('ru-RU', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(METRICS[metric].unit === 'percent' ? v * 100 : v);
  return (
    <svg
      className="audit-chart"
      viewBox="0 0 365 168"
      aria-label={`${METRICS[metric].label}: ${dateRangeLabel(dates[0], dates.at(-1)!)}. Шкала от ${format(low, metric)} до ${format(high, metric)}.`}
    >
      <title>{`${METRICS[metric].label}. Точные значения доступны в таблице под группой графиков.`}</title>
      {[low, (low + high) / 2, high].map((v, i) => (
        <g key={i}>
          <line
            x1={left}
            x2={right}
            y1={y(v)}
            y2={y(v)}
            className="audit-gridline"
          />
          <text
            x={left - 10}
            y={y(v) + 4}
            textAnchor="end"
            className="audit-axis"
          >
            {axis(v)}
          </text>
        </g>
      ))}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {values.map((v, i) =>
        v == null ? null : (
          <g key={dates[i]}>
            {(dates.length <= 26 || i === values.length - 1) && (
              <circle
                cx={x(i)}
                cy={y(v)}
                r={i === values.length - 1 ? 4 : 2.5}
                fill={color}
              />
            )}
            <rect
              x={x(i) - 5}
              y={top - 8}
              width={10}
              height={bottom - top + 16}
              fill="transparent"
            >
              <title>{`${dateRangeLabel(dates[i], dates[i])}: ${format(v, metric)}`}</title>
            </rect>
          </g>
        ),
      )}
      {ticks.map((i) => (
        <text
          key={i}
          x={x(i)}
          y={157}
          textAnchor={
            i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'
          }
          className="audit-axis"
        >
          {shortDate(dates[i])}
        </text>
      ))}
    </svg>
  );
});

export default function WeeklyAudit({
  rows,
  scope,
  from,
  to,
}: {
  rows: StatRow[];
  scope: string;
  from: string;
  to: string;
}) {
  const selected = useMemo(
    () => rows.filter((r) => r.end >= from && r.end <= to),
    [rows, from, to],
  );
  const dates = useMemo(
    () =>
      calendar(
        from,
        to,
        selected.map((r) => r.end),
      ),
    [selected, from, to],
  );
  const byDate = useMemo(() => new Map(rows.map((r) => [r.end, r])), [rows]);
  const lastDate = dates.at(-1) ?? to;
  const last = byDate.get(lastDate);
  const prevDate = shiftDate(lastDate, -7),
    previous = byDate.get(prevDate);
  const missing = dates.filter((d) => !byDate.has(d)).length;
  if (!selected.length)
    return (
      <section className="panel audit-no-data">
        <h2>За этот период нет отчётов</h2>
        <p>
          Выберите другую историю или подразделение. Пропуски не считаются
          нулями.
        </p>
      </section>
    );
  return (
    <div className="weekly-audit">
      <div className="audit-context">
        <div>
          <span className="audit-kicker">
            НЕДЕЛЬНЫЙ АУДИТ · {scopeLabel(scope)}
          </span>
          <h2>Неделя {dateRangeLabel(shiftDate(lastDate, -6), lastDate)}</h2>
          <p>
            Крупные числа — последняя неделя. Изменение — к неделе,
            завершившейся {dateRangeLabel(prevDate, prevDate)}.
          </p>
        </div>
        <div className="audit-coverage">
          <strong>{selected.length} отчётов</strong>
          <span>в выбранной истории</span>
          {missing > 0 && (
            <span className="negative">Пропущено недель: {missing}</span>
          )}
        </div>
      </div>
      {(!last || !previous) && (
        <output className="notice">
          {!last
            ? 'Последняя неделя в диапазоне отсутствует. Вместо неё не подставляем старые значения.'
            : 'За предыдущую неделю нет отчёта: изменение не рассчитано.'}
        </output>
      )}
      <nav className="audit-nav" aria-label="Разделы недельного аудита">
        {groups.map((group) => (
          <a key={group.id} href={`#audit-${group.id}`}>
            <i style={{ background: group.color }} />
            {group.label}
            <span>{group.metrics.length}</span>
          </a>
        ))}
      </nav>
      {groups.map((group) => (
        <section
          key={group.id}
          id={`audit-${group.id}`}
          className="audit-group"
        >
          <header className="audit-group-heading">
            <div>
              <h2>{group.label}</h2>
              <p>{group.description}</p>
            </div>
            <span>История по неделям · {dateRangeLabel(from, to)}</span>
          </header>
          <div className="audit-cards">
            {group.metrics.map((metric) => {
              const value = last?.metrics[metric] ?? null,
                prev = previous?.metrics[metric] ?? null;
              const values = dates.map(
                (date) => byDate.get(date)?.metrics[metric] ?? null,
              );
              const difference =
                value != null && prev != null ? value - prev : null;
              return (
                <article className="audit-card" key={metric}>
                  <div className="audit-card-label">
                    <h3>{METRICS[metric].label}</h3>
                    <span>{units[METRICS[metric].unit]}</span>
                  </div>
                  <div className="audit-value">
                    <strong>{format(value, metric)}</strong>
                    <Delta current={value} previous={prev} metric={metric} />
                  </div>
                  <div className="audit-baseline">
                    Было {format(prev, metric)}
                    {difference != null &&
                      METRICS[metric].unit !== 'percent' && (
                        <span>
                          {' '}
                          · {difference > 0 ? '+' : ''}
                          {format(difference, metric)}
                        </span>
                      )}
                  </div>
                  <AuditChart
                    dates={dates}
                    values={values}
                    metric={metric}
                    color={group.color}
                  />
                  <div className="audit-card-foot">
                    <span>
                      {METRICS[metric].kind === 'last'
                        ? `На ${shortDate(lastDate)}`
                        : `За неделю до ${shortDate(lastDate)}`}
                    </span>
                    <span>
                      {values.filter((v) => v != null).length}/{dates.length}{' '}
                      значений
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
          {group.id === 'finance' && (
            <p className="audit-method">
              Маржа относится ко всему подразделению. ROI показан как в таблице;
              его формула и связь маржи с рекламой не подтверждены.
            </p>
          )}
          <details className="audit-values">
            <summary>
              Точные значения по неделям · {group.label.toLowerCase()}
            </summary>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Окончание недели</TableHead>
                  {group.metrics.map((m) => (
                    <TableHead className="num" key={m}>
                      {METRICS[m].label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...dates].reverse().map((date) => (
                  <TableRow key={date}>
                    <TableCell>{dateRangeLabel(date, date)}</TableCell>
                    {group.metrics.map((m) => (
                      <TableCell className="num" key={m}>
                        {format(byDate.get(date)?.metrics[m], m)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </details>
        </section>
      ))}
      <p className="audit-method">
        Каждая точка — отдельная отчётная неделя; даты соответствуют её
        окончанию. Разрывы — отсутствие данных. Шкала каждого показателя
        подписана отдельно. Для города и сети неполные данные подразделений не
        заменяются нулями.
      </p>
    </div>
  );
}
