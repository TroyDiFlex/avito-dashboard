'use client';
import { useEffect, useMemo, useState } from 'react';
import { Columns2, Layers3, Plus, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Picker, Chart } from './analytics-ui';
import {
  COLORS,
  METRICS,
  aggregate,
  format,
  type Metric,
  type Snapshot,
} from '@/lib/model';
import {
  GRAINS,
  SCOPES,
  scopeHistory,
  scopeLabel,
  timeSeries,
  type Grain,
} from '@/lib/explore';

type Panel = { scope: string; metric: Metric };
type SavedComparison = {
  panels?: Panel[];
  layout?: 'split' | 'overlay';
  grain?: Grain;
};
const defaultPanels: Panel[] = [
  { scope: 'moscow', metric: 'contacts' },
  { scope: 'spb', metric: 'contacts' },
];
function savedComparison(): SavedComparison {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(localStorage.getItem('pik-comparison') ?? '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved)
      ? saved
      : {};
  } catch {
    return {};
  }
}
const metrics = (Object.keys(METRICS) as Metric[]).map((value) => ({
  value,
  label: METRICS[value].label,
}));
export default function Comparison({
  snapshot,
  from,
  to,
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
}) {
  const initial = savedComparison();
  const validPanels =
    Array.isArray(initial.panels) &&
    initial.panels.length >= 2 &&
    initial.panels.length <= 6 &&
    initial.panels.every(
      (panel) =>
        panel &&
        SCOPES.some((scope) => scope.value === panel.scope) &&
        METRICS[panel.metric],
    )
      ? initial.panels
      : defaultPanels;
  const [panels, setPanels] = useState<Panel[]>(validPanels);
  const [layout, setLayout] = useState<'split' | 'overlay'>(
    initial.layout === 'overlay' ? 'overlay' : 'split',
  );
  const [grain, setGrain] = useState<Grain>(
    initial.grain && ['week', 'month', 'year'].includes(initial.grain)
      ? initial.grain
      : 'week',
  );
  const [indexed, setIndexed] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(
        'pik-comparison',
        JSON.stringify({ panels, layout, grain }),
      );
    } catch {
      /* Optional device preference. */
    }
  }, [panels, layout, grain]);
  const prepared = useMemo(
    () =>
      panels.map((p) => {
        const rows = scopeHistory(snapshot.stats, p.scope).filter(
          (s) => s.end >= from && s.end <= to,
        );
        return {
          ...p,
          rows,
          points: timeSeries(
            rows,
            layout === 'overlay' ? panels[0].metric : p.metric,
            grain,
            from,
            to,
          ),
        };
      }),
    [snapshot, panels, grain, layout, from, to],
  );
  const dates = [
    ...new Set(prepared.flatMap((p) => p.points.map((d) => d.date))),
  ].sort();
  const base = dates.find((date) =>
    prepared.every((p) => {
      const v = p.points.find((d) => d.date === date)?.value;
      return v != null && v !== 0;
    }),
  );
  const data = dates.map((date) => {
    const row: Record<string, unknown> = { date };
    prepared.forEach((p, i) => {
      const value = p.points.find((d) => d.date === date)?.value ?? null;
      const start = p.points.find((d) => d.date === base)?.value;
      row[`panel${i}`] = indexed
        ? value != null && start
          ? (value / start) * 100
          : null
        : value;
    });
    return row;
  });
  function update(index: number, change: Partial<Panel>) {
    setPanels((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...change } : p)),
    );
  }
  function add() {
    const unused = SCOPES.find((s) => !panels.some((p) => p.scope === s.value));
    if (unused)
      setPanels((p) => [...p, { scope: unused.value, metric: p[0].metric }]);
  }
  return (
    <div>
      <div className="workspace-bar">
        <div>
          <h2>Сравнение</h2>
          <p>Выберите, что сопоставить. Период общий для всех панелей.</p>
        </div>
        <div className="workspace-actions">
          <Picker
            label="Масштаб времени"
            value={grain}
            onChange={(v) => setGrain(v as Grain)}
            items={GRAINS}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" aria-label="Настройки сравнения">
                  <Settings2 size={16} />
                  Вид
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setLayout('split');
                  setIndexed(false);
                }}
              >
                <Columns2 size={16} />
                Графики рядом
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLayout('overlay')}>
                <Layers3 size={16} />
                На одном графике
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  setPanels(
                    ['И31', 'Х7', 'Автово', 'Б116', 'Ворошилова'].map(
                      (scope) => ({ scope, metric: panels[0].metric }),
                    ),
                  );
                  setLayout('overlay');
                }}
              >
                Все действующие подразделения
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setShowNumbers((v) => !v)}>
                {showNumbers ? 'Скрыть' : 'Показать'} таблицу значений
              </DropdownMenuItem>
              {layout === 'overlay' && (
                <DropdownMenuItem onClick={() => setIndexed((v) => !v)}>
                  {indexed ? 'Абсолютные значения' : 'Общая база = 100%'}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {panels.length < 6 && (
            <Button variant="ghost" onClick={add}>
              <Plus size={16} />
              Добавить
            </Button>
          )}
        </div>
      </div>
      <div className={`comparison-panels ${layout}`}>
        {prepared.map((p, i) => (
          <section
            className="panel compare-panel"
            key={i}
            style={{ '--series-color': COLORS[i] } as React.CSSProperties}
          >
            <div className="panel-heading">
              <Picker
                label={`Объект панели ${i + 1}`}
                value={p.scope}
                onChange={(scope) => update(i, { scope })}
                items={SCOPES}
              />
              {panels.length > 2 && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    setPanels((prev) => prev.filter((_, index) => index !== i))
                  }
                  aria-label={`Убрать панель ${i + 1}`}
                >
                  <X size={15} />
                </Button>
              )}
            </div>
            {layout === 'split' ? (
              <>
                <div className="comparison-metric">
                  <Picker
                    label={`Показатель панели ${i + 1}`}
                    value={p.metric}
                    onChange={(v) => update(i, { metric: v as Metric })}
                    items={metrics}
                  />
                  <strong>
                    {format(aggregate(p.rows, p.metric), p.metric)}
                  </strong>
                </div>
                <Chart
                  data={p.points}
                  series={[
                    {
                      key: 'value',
                      label: scopeLabel(p.scope),
                      color: COLORS[i],
                    },
                  ]}
                  metric={p.metric}
                  grain={grain}
                />
                <div className="chart-foot">
                  <span>
                    {p.rows.filter((r) => r.metrics[p.metric] != null).length}{' '}
                    периодов с данными
                  </span>
                  <span>
                    {METRICS[p.metric].kind === 'last'
                      ? 'На последнюю дату'
                      : 'По выбранному периоду'}
                  </span>
                </div>
              </>
            ) : (
              <div className="overlay-summary">
                <span
                  className="series-dot"
                  style={{ background: COLORS[i] }}
                />
                <strong>
                  {format(
                    aggregate(p.rows, panels[0].metric),
                    panels[0].metric,
                  )}
                </strong>
              </div>
            )}
          </section>
        ))}
      </div>
      {layout === 'overlay' && (
        <section className="panel">
          <div className="panel-heading">
            <h2>{METRICS[panels[0].metric].label}</h2>
            <Picker
              label="Общий показатель"
              value={panels[0].metric}
              onChange={(v) => update(0, { metric: v as Metric })}
              items={metrics}
            />
          </div>
          <Chart
            data={data}
            series={panels.map((p, i) => ({
              key: `panel${i}`,
              label: scopeLabel(p.scope),
              color: COLORS[i],
            }))}
            metric={panels[0].metric}
            indexed={indexed}
            grain={grain}
          />
          <div className="chart-foot">
            <div className="legend">
              {panels.map((p, i) => (
                <span key={i}>
                  <i style={{ background: COLORS[i] }} />
                  {scopeLabel(p.scope)}
                </span>
              ))}
            </div>
            <span>
              {indexed
                ? base
                  ? `База 100%: ${base}`
                  : 'Нет общей ненулевой базы'
                : 'Одинаковая шкала для всех объектов'}
            </span>
          </div>
        </section>
      )}
      {showNumbers && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Значения по периодам</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Период</TableHead>
                {prepared.map((p, i) => (
                  <TableHead className="num" key={i}>
                    {scopeLabel(p.scope)}
                    <br />
                    {
                      METRICS[
                        layout === 'overlay' ? panels[0].metric : p.metric
                      ].label
                    }
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dates.map((date) => (
                <TableRow key={date}>
                  <TableCell>{date}</TableCell>
                  {prepared.map((p, i) => (
                    <TableCell key={i} className="num">
                      {format(
                        p.points.find((d) => d.date === date)?.value,
                        layout === 'overlay' ? panels[0].metric : p.metric,
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
      <p className="method-note">
        Москва: И31 и Х7. Санкт-Петербург: Автово, Б116 и Ворошилова. К20
        сохраняется отдельно как историческое подразделение. Для города нужен
        полный набор данных за дату; рейтинг и время ответа — простое среднее
        подразделений, ROI города не рассчитывается.
        {grain !== 'week' &&
          ' Неделя целиком относится к месяцу или году по дате окончания. Это не точные календарные обороты; пропущенные недели не восстанавливаются.'}
      </p>
    </div>
  );
}
