'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Search,
  Settings2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Chart, Picker, Spark } from './analytics-ui';
import {
  AD_METRICS,
  COLORS,
  METRICS,
  aggregate,
  format,
  type AdRow,
  type Metric,
  type Snapshot,
} from '@/lib/model';
import {
  GRAINS,
  SCOPES,
  adKey,
  bucketDates,
  distribution,
  extractArticle,
  scopeBranches,
  searchUrl,
  timeSeries,
  type Grain,
} from '@/lib/explore';

type Preference = Record<string, string>;
function devicePreference(key: string): Preference {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}
const options = AD_METRICS.map((value) => ({
  value,
  label: METRICS[value].label,
}));
function meanFormat(value: number | null, metric: Metric) {
  return value != null && METRICS[metric].unit === 'count'
    ? value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
    : format(value, metric);
}

export default function AdExplorer({
  snapshot,
  from,
  to,
  initialScope,
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  initialScope: string;
}) {
  const [scope, setScope] = useState(initialScope);
  const [search, setSearch] = useState('');
  const [sku, setSku] = useState('');
  const [metric, setMetric] = useState<Metric>('views');
  const [grain, setGrain] = useState<Grain>('week');
  const [category, setCategory] = useState('all');
  const [descending, setDescending] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [compared, setCompared] = useState<string[]>([]);
  const [layout, setLayout] = useState<'overlay' | 'split'>('overlay');
  const [page, setPage] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [overrides, setOverrides] = useState<Preference>(() =>
    devicePreference('pik-articles'),
  );
  const [links, setLinks] = useState<Preference>(() =>
    devicePreference('pik-search-links'),
  );
  const [articleInput, setArticleInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- reset pagination when its query changes.
    setPage(0);
  }, [scope, search, sku, category, metric, descending, from, to]);
  const allGroups = useMemo(() => {
    const groups = new Map<string, AdRow[]>();
    for (const row of snapshot.ads) {
      const key = adKey(row);
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    return new Map(
      [...groups].map(([key, rows]) => [
        key,
        {
          key,
          rows,
          latest: rows.at(-1)!,
          article: extractArticle(rows.at(-1)!.name, overrides[key]),
        },
      ]),
    );
  }, [snapshot, overrides]);
  const history = selected ? (allGroups.get(selected)?.rows ?? []) : [];
  const latest = history.at(-1);
  const article = selected ? allGroups.get(selected)?.article : null;
  const groups = useMemo(
    () =>
      [...allGroups.values()]
        .filter((g) => scopeBranches(scope).includes(g.latest.branch))
        .map((g) => {
          const rows = g.rows.filter(
            (r) =>
              r.end >= from &&
              r.end <= to &&
              (!sku || extractArticle(r.name, overrides[g.key]).value === sku),
          );
          const latest = rows.at(-1) ?? g.latest;
          return { ...g, latest, period: rows, value: aggregate(rows, metric) };
        })
        .filter(
          (g) =>
            g.period.length > 0 &&
            (!search ||
              `${g.latest.name} ${g.latest.id} ${g.article.value ?? ''}`
                .toLowerCase()
                .includes(search.toLowerCase())) &&
            (category === 'all' || g.latest.category === category),
        )
        .sort((a, b) =>
          a.value == null && b.value == null
            ? a.key.localeCompare(b.key)
            : a.value == null
              ? 1
              : b.value == null
                ? -1
                : descending
                  ? b.value - a.value
                  : a.value - b.value,
        ),
    [
      allGroups,
      scope,
      from,
      to,
      sku,
      search,
      category,
      metric,
      descending,
      overrides,
    ],
  );
  const categories = [
    ...new Set(
      snapshot.ads
        .filter((a) => scopeBranches(scope).includes(a.branch))
        .map((a) => a.category)
        .filter(Boolean),
    ),
  ].sort();
  const summary = distribution(groups.map((g) => g.value));
  const groupTotal = aggregate(
    groups.flatMap((g) => g.period),
    metric,
  );
  const selectedDates = bucketDates(
    from,
    to,
    grain,
    groups.flatMap((g) => g.period.map((a) => a.end)),
  );
  const comparison = compared.map((key) => {
    const g = allGroups.get(key);
    const points = timeSeries(g?.rows ?? [], metric, grain, from, to);
    return {
      key,
      label: g ? `${g.latest.branch} · № ${g.latest.id}` : key,
      points,
    };
  });
  const compareData = selectedDates.map((date) => {
    const row: Record<string, unknown> = { date };
    comparison.forEach(
      (g, i) =>
        (row[`ad${i}`] = g.points.find((p) => p.date === date)?.value ?? null),
    );
    return row;
  });
  const related = article?.value
    ? [...allGroups.values()].filter((g) => g.article.value === article.value)
    : [];
  const changes = history
    .flatMap((row, i) => {
      if (!i) return [];
      const previous = history[i - 1];
      const fields = [];
      if (row.name !== previous.name)
        fields.push({
          label: 'Название',
          before: previous.name,
          after: row.name,
        });
      if (row.price !== previous.price)
        fields.push({
          label: 'Цена',
          before: format(previous.price, 'spend'),
          after: format(row.price, 'spend'),
        });
      return fields.length ? [{ end: row.end, fields }] : [];
    })
    .reverse();
  function openEdit() {
    setArticleInput(article?.value ?? '');
    setLinkInput(latest ? (links[latest.branch] ?? '') : '');
    setError('');
    setEditOpen(true);
  }
  function saveEdit() {
    if (!selected || !latest) return;
    if (linkInput && !searchUrl(linkInput, latest.name)) {
      setError(
        'Нужен HTTPS-адрес Авито с {query} на месте поискового запроса.',
      );
      return;
    }
    if (articleInput && !/^[A-Za-z0-9.-]{4,30}$/.test(articleInput)) {
      setError('Артикул: от 4 до 30 латинских букв, цифр, точек или дефисов.');
      return;
    }
    const newOverrides = {
        ...overrides,
        [selected]: articleInput.trim().toUpperCase(),
      },
      newLinks = { ...links, [latest.branch]: linkInput.trim() };
    try {
      localStorage.setItem('pik-articles', JSON.stringify(newOverrides));
      localStorage.setItem('pik-search-links', JSON.stringify(newLinks));
    } catch {
      setError('Не удалось сохранить настройки на этом устройстве.');
      return;
    }
    setOverrides(newOverrides);
    setLinks(newLinks);
    setEditOpen(false);
  }
  function sameArticle(value: string) {
    setSku(value);
    setScope('network');
    setSearch('');
    setCategory('all');
    setSelected(null);
    setCompared([]);
  }
  const href = latest
    ? searchUrl(links[latest.branch] ?? '', latest.name)
    : null;
  return (
    <>
      <div className="workspace-bar">
        <div>
          <h2>Объявления</h2>
          <p>История, одинаковые артикулы и сравнение результатов.</p>
        </div>
        <div className="workspace-actions">
          <Picker
            label="Область поиска объявлений"
            value={scope}
            onChange={setScope}
            items={SCOPES}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" aria-label="Настройки объявлений">
                  <Settings2 size={16} />
                  Вид
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDescending((v) => !v)}>
                {descending ? 'По возрастанию' : 'По убыванию'} показателя
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  setLayout((v) => (v === 'overlay' ? 'split' : 'overlay'))
                }
              >
                {layout === 'overlay'
                  ? 'Графики сравнения рядом'
                  : 'Наложить графики сравнения'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setFiltersOpen(true)}>
                Категория и другие условия
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="ad-toolbar">
        <div className="search-field">
          <Search size={17} />
          <Input
            placeholder="Название, номер или артикул"
            aria-label="Поиск объявлений"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Picker
          label="Показатель объявлений"
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          items={options}
        />
        <Picker
          label="Масштаб времени объявлений"
          value={grain}
          onChange={(v) => setGrain(v as Grain)}
          items={GRAINS}
        />
        <Button
          variant="ghost"
          onClick={() => setFiltersOpen(true)}
          aria-label="Фильтры объявлений"
        >
          <Filter size={16} />
        </Button>
      </div>
      {(sku || category !== 'all') && (
        <div className="active-filters">
          {sku && (
            <button onClick={() => setSku('')}>
              Артикул: {sku}
              <X size={14} />
            </button>
          )}
          {category !== 'all' && (
            <button onClick={() => setCategory('all')}>
              {category}
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="distribution">
        <div>
          <span>Объявлений</span>
          <strong>{groups.length.toLocaleString('ru-RU')}</strong>
        </div>
        <div>
          <span>
            {METRICS[metric].kind === 'ratio'
              ? 'Из суммарных показателей'
              : 'Итого за выбранный период'}
          </span>
          <strong>{format(groupTotal, metric)}</strong>
        </div>
        <div>
          <span>Среднее на объявление</span>
          <strong>{meanFormat(summary.mean, metric)}</strong>
        </div>
        <div>
          <span>Медиана на объявление</span>
          <strong>{meanFormat(summary.median, metric)}</strong>
        </div>
      </div>
      {compared.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <h2>Сравнение объявлений</h2>
            <Button variant="ghost" onClick={() => setCompared([])}>
              Сбросить
            </Button>
          </div>
          {layout === 'overlay' ? (
            <>
              <Chart
                data={compareData}
                series={comparison.map((g, i) => ({
                  key: `ad${i}`,
                  label: g.label,
                  color: COLORS[i],
                }))}
                metric={metric}
                grain={grain}
              />
              <div className="chart-foot legend">
                {comparison.map((g, i) => (
                  <span key={g.key}>
                    <i style={{ background: COLORS[i] }} />
                    {g.label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="comparison-panels split">
              {comparison.map((g, i) => (
                <div key={g.key}>
                  <h3 className="mini-heading">{g.label}</h3>
                  <Chart
                    data={g.points}
                    series={[
                      { key: 'value', label: g.label, color: COLORS[i] },
                    ]}
                    metric={metric}
                    grain={grain}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <section className="panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="check-col">Сравнить</TableHead>
              <TableHead>Объявление</TableHead>
              <TableHead>Подразделение</TableHead>
              <TableHead className="num">{METRICS[metric].label}</TableHead>
              <TableHead className="num">Динамика</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.slice(page * 25, (page + 1) * 25).map((g) => (
              <TableRow key={g.key}>
                <TableCell>
                  <Checkbox
                    checked={compared.includes(g.key)}
                    disabled={compared.length >= 4 && !compared.includes(g.key)}
                    onCheckedChange={(checked) =>
                      setCompared((prev) =>
                        checked
                          ? [...prev, g.key]
                          : prev.filter((k) => k !== g.key),
                      )
                    }
                    aria-label={`Сравнить ${g.latest.branch} ${g.latest.id}`}
                  />
                </TableCell>
                <TableCell>
                  <button
                    className="ad-title"
                    onClick={() => setSelected(g.key)}
                  >
                    {g.latest.name}
                    <small>
                      № {g.latest.id} · {g.period.length} периодов
                    </small>
                  </button>
                  {g.article.value && (
                    <button
                      className="sku-tag"
                      onClick={() => sameArticle(g.article.value!)}
                      title="Найти этот артикул в других подразделениях"
                    >
                      {g.article.value}
                      <ArrowRight size={12} />
                    </button>
                  )}
                </TableCell>
                <TableCell>{g.latest.branch}</TableCell>
                <TableCell className="num strong">
                  {format(g.value, metric)}
                </TableCell>
                <TableCell className="num">
                  <Spark
                    values={timeSeries(g.period, metric, grain, from, to).map(
                      (p) => p.value,
                    )}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!groups.length && (
          <div className="empty-chart">
            Объявлений по выбранным условиям нет
          </div>
        )}
        <div className="pagination">
          <span>
            Среднее и медиана: {summary.count} объявлений с известным
            показателем
            {summary.missing ? `, ещё ${summary.missing} без значения` : ''}.
            Число отчётных недель у объявлений может отличаться.
          </span>
          <Button
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Предыдущая страница"
          >
            <ChevronLeft size={16} />
          </Button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(groups.length / 25))}
          </span>
          <Button
            variant="outline"
            disabled={(page + 1) * 25 >= groups.length}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Следующая страница"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </section>
      <p className="method-note">
        Артикул определяется как первый похожий складской код в названии и
        требует подтверждения при неоднозначности. Это статистика рекламы, а не
        продажи. Отсутствующие записи не считаются нулевыми.
        {grain !== 'week' &&
          ' Недели относятся к месяцу или году по дате окончания; это не точные календарные итоги.'}
      </p>
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent className="ad-sheet" side="right">
          <SheetHeader>
            <div className="eyebrow">
              {latest?.branch} / № {latest?.id}
            </div>
            <SheetTitle>{latest?.name ?? 'Объявление'}</SheetTitle>
            <SheetDescription>
              История с {history[0]?.end} по {latest?.end}. Названия и цены — из
              сохранённых выгрузок.
            </SheetDescription>
          </SheetHeader>
          <div className="sheet-body">
            <div className="detail-actions">
              <span className="sku-tag">
                {article?.value ?? 'Артикул не найден'} ·{' '}
                {article?.origin === 'manual'
                  ? 'уточнён вручную'
                  : 'из названия'}
              </span>
              <Button variant="ghost" onClick={openEdit}>
                <Settings2 size={16} />
                Настроить
              </Button>
              {href ? (
                <a
                  className="external-button"
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  Найти объявление
                  <ExternalLink size={15} />
                </a>
              ) : (
                <Button variant="outline" onClick={openEdit}>
                  Настроить поиск в Авито
                </Button>
              )}
            </div>
            {article?.value && (
              <button
                className="related-link"
                onClick={() => sameArticle(article.value!)}
              >
                Этот артикул в сети: {related.length} объявлений
                <ArrowRight size={15} />
              </button>
            )}
            <div className="panel-heading">
              <Picker
                label="Показатель карточки"
                value={metric}
                onChange={(v) => setMetric(v as Metric)}
                items={options}
              />
              <Picker
                label="Масштаб карточки"
                value={grain}
                onChange={(v) => setGrain(v as Grain)}
                items={GRAINS}
              />
            </div>
            <Chart
              data={
                history.length
                  ? timeSeries(
                      history,
                      metric,
                      grain,
                      history[0].end,
                      history.at(-1)!.end,
                    )
                  : []
              }
              series={[
                {
                  key: 'value',
                  label: METRICS[metric].label,
                  color: COLORS[0],
                },
              ]}
              metric={metric}
              grain={grain}
            />
            <div className="ad-summary">
              {(['views', 'contacts', 'spend'] as Metric[]).map((m) => (
                <div key={m}>
                  <span>{METRICS[m].label} за историю</span>
                  <strong>{format(aggregate(history, m), m)}</strong>
                </div>
              ))}
            </div>
            <details className="detail-section">
              <summary>
                Изменения названия и цены <span>{changes.length}</span>
              </summary>
              <p className="method-note">
                Изменение обнаружено между двумя выгрузками; точная дата
                редактирования неизвестна. Истории фотографий в данных нет.
              </p>
              {changes.length ? (
                changes.map((c) => (
                  <div className="change-event" key={c.end}>
                    <strong>{c.end}</strong>
                    {c.fields.map((f) => (
                      <div key={f.label}>
                        <span>{f.label}</span>
                        <p className="muted">{f.before}</p>
                        <p>{f.after}</p>
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p className="method-note">
                  В сохранённой истории изменений не обнаружено.
                </p>
              )}
            </details>
            <details className="detail-section">
              <summary>Все показатели по неделям</summary>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Конец периода</TableHead>
                    {AD_METRICS.map((m) => (
                      <TableHead key={m} className="num">
                        {METRICS[m].label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...history].reverse().map((r) => (
                    <TableRow key={r.end}>
                      <TableCell>{r.end}</TableCell>
                      {AD_METRICS.map((m) => (
                        <TableCell key={m} className="num">
                          {format(r.metrics[m], m)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </details>
          </div>
        </SheetContent>
      </Sheet>
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Условия отбора</DialogTitle>
            <DialogDescription>
              Фильтры применяются к списку, средним и медианам.
            </DialogDescription>
          </DialogHeader>
          <span className="field-label">Категория</span>
          <Picker
            label="Категория объявлений"
            value={category}
            onChange={setCategory}
            items={[
              { value: 'all', label: 'Все категории' },
              ...categories.map((value) => ({ value, label: value })),
            ]}
          />
          <label htmlFor="article-filter">Точный складской артикул</label>
          <Input
            id="article-filter"
            value={sku}
            onChange={(e) => setSku(e.target.value.trim().toUpperCase())}
            placeholder="Например, 11128507607"
          />
          <Button onClick={() => setFiltersOpen(false)}>Готово</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Артикул и поиск объявления</DialogTitle>
            <DialogDescription>
              Настройки сохраняются на этом устройстве. Исходные таблицы не
              изменяются.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="article-override">Первый складской артикул</label>
          <Input
            id="article-override"
            value={articleInput}
            onChange={(e) => setArticleInput(e.target.value)}
          />
          <p className="method-note">
            Ручное уточнение применяется ко всей истории этого объявления.
            Пустое значение исключает его из сопоставления по артикулу.
          </p>
          <label htmlFor="avito-search-template">
            Шаблон поиска в аккаунте {latest?.branch}
          </label>
          <Input
            id="avito-search-template"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            placeholder="https://www.avito.ru/…?q={query}"
          />
          <p className="method-note">
            Откройте поиск внутри нужного аккаунта Авито, скопируйте адрес и
            замените текст запроса на {'{query}'}. Настройка используется для
            всех объявлений подразделения. Ссылка открывается в браузере по
            умолчанию.
          </p>
          {error && (
            <p role="alert" className="negative">
              {error}
            </p>
          )}
          <Button onClick={saveEdit}>
            <Check size={16} />
            Сохранить
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
