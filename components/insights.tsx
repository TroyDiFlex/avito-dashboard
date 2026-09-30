'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  Layers3,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { Slider } from '@base-ui/react/slider';
import { Picker } from '@/components/analytics-ui';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  readBrowserPreference,
  replaceUrlParameters,
  saveBrowserPreference,
} from '@/lib/browser-preferences';
import { demandLevel } from '@/lib/demand';
import {
  buildGrowthCases,
  clampGrowthRange,
  defaultGrowthFilters,
  filterGrowthCases,
  GROWTH_METRICS,
  growthRangeMaximum,
  invalidGrowthRange,
  NO_GROWTH_CATEGORY,
  parseGrowthBound,
  restoreGrowthFilters,
  type GrowthCase,
  type GrowthFilters,
  type GrowthMetric,
  type GrowthMetricFilter,
  type GrowthRange,
} from '@/lib/growth';
import {
  dateRangeLabel,
  format,
  shortDate,
  type AdRow,
  type Snapshot,
} from '@/lib/model';

const PAGE_SIZE = 60;
const FILTERS_KEY = 'pik-growth-filters';
const number = (value: number) =>
  value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const avitoUrl = (id: string) =>
  /^\d+$/.test(id) ? `https://www.avito.ru/${id}` : null;

function RangeField({
  label,
  range,
  ceiling,
  percentage = false,
  onChange,
  metric,
  onMetricChange,
  onRemove,
}: {
  label: string;
  range: GrowthRange;
  ceiling: number;
  percentage?: boolean;
  onChange: (value: GrowthRange) => void;
  metric?: GrowthMetric;
  onMetricChange?: (metric: GrowthMetric) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const step = percentage ? 0.01 : 1;
  const min = Math.min(parseGrowthBound(range.min) ?? 0, ceiling);
  const max = Math.max(
    min,
    Math.min(parseGrowthBound(range.max) ?? ceiling, ceiling),
  );
  const invalid = invalidGrowthRange(range);
  const syncSlider = (values: number | readonly number[]) => {
    if (!Array.isArray(values)) return;
    onChange({
      min: values[0] === 0 && !range.min ? '' : String(values[0]),
      max: values[1] === ceiling && !range.max ? '' : String(values[1]),
    });
  };
  return (
    <section className="growth-range-field" aria-label={label}>
      <div className="growth-range-heading">
        {metric && onMetricChange ? (
          <Picker
            label={label}
            value={metric}
            items={GROWTH_METRICS}
            onChange={(value) => onMetricChange(value as GrowthMetric)}
          />
        ) : (
          <span>{label}</span>
        )}
        {onRemove && (
          <button
            type="button"
            className="growth-remove-range"
            aria-label="Убрать дополнительный показатель"
            onClick={onRemove}
          >
            <X />
          </button>
        )}
      </div>
      <Slider.Root
        className="growth-slider"
        min={0}
        max={Math.max(ceiling, step)}
        step={step}
        largeStep={percentage ? 1 : Math.max(1, Math.round(ceiling / 10))}
        value={[min, max]}
        disabled={ceiling === 0}
        thumbAlignment="edge"
        thumbCollisionBehavior="swap"
        onValueChange={syncSlider}
        locale="ru-RU"
        format={{ maximumFractionDigits: 2 }}
      >
        <Slider.Control className="growth-slider-control">
          <Slider.Track className="growth-slider-track">
            <Slider.Indicator className="growth-slider-fill" />
          </Slider.Track>
          {[0, 1].map((index) => (
            <Slider.Thumb
              key={index}
              index={index}
              className="growth-slider-thumb"
              style={{
                zIndex:
                  min === max && (min === 0 ? index === 1 : index === 0)
                    ? 2
                    : 1,
              }}
              getAriaLabel={(thumb) => `${label}: ${thumb === 0 ? 'от' : 'до'}`}
              getAriaValueText={(text) => `${text}${percentage ? '%' : ''}`}
            />
          ))}
        </Slider.Control>
      </Slider.Root>
      <div className="growth-range-inputs">
        {(['min', 'max'] as const).map((bound) => (
          <label key={bound} htmlFor={`${id}-${bound}`}>
            <span>{bound === 'min' ? 'От' : 'До'}</span>
            <input
              id={`${id}-${bound}`}
              type="text"
              inputMode={percentage ? 'decimal' : 'numeric'}
              value={range[bound]}
              placeholder={bound === 'min' ? '0' : number(ceiling)}
              aria-label={`${label}: ${bound === 'min' ? 'от' : 'до'}`}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${id}-error` : undefined}
              onChange={(event) =>
                onChange({ ...range, [bound]: event.target.value })
              }
              onBlur={() => onChange(clampGrowthRange(range, ceiling))}
            />
          </label>
        ))}
      </div>
      {invalid && (
        <p id={`${id}-error`} className="growth-range-error">
          Укажите числа от 0; «от» не больше «до».
        </p>
      )}
    </section>
  );
}

function CategoryPicker({
  choices,
  selected,
  onChange,
}: {
  choices: string[];
  selected: string[] | null;
  onChange: (value: string[] | null) => void;
}) {
  const label =
    selected === null
      ? 'Все категории'
      : !selected.length
        ? 'Категории не выбраны'
        : selected.length > 2
          ? `Категории: ${selected.length}`
          : selected
              .map((value) =>
                value === NO_GROWTH_CATEGORY ? 'Без категории' : value,
              )
              .join(', ');
  return (
    <Popover>
      <PopoverTrigger
        className="growth-category-trigger"
        aria-label="Категории"
      >
        <span>{label}</span>
        <ChevronDown />
      </PopoverTrigger>
      <PopoverContent className="growth-category-menu" align="start">
        <PopoverTitle className="sr-only">Категории</PopoverTitle>
        <div className="growth-category-actions">
          <button type="button" onClick={() => onChange(null)}>
            Выбрать все
          </button>
          <button type="button" onClick={() => onChange([])}>
            Снять все
          </button>
        </div>
        {choices.map((value) => (
          <label className="growth-category-option" key={value}>
            <input
              type="checkbox"
              checked={selected === null || selected.includes(value)}
              onChange={(event) => {
                const current = selected ?? choices;
                onChange(
                  event.target.checked
                    ? [...new Set([...current, value])]
                    : current.filter((item) => item !== value),
                );
              }}
            />
            <span>
              {value === NO_GROWTH_CATEGORY
                ? 'Без категории'
                : `Категория ${value}`}
            </span>
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function GrowthCard({
  item,
  duplicatesOnly,
  demandPopulation,
  onOpenPart,
  onOpenPartMetrics,
  getPartHref,
  getPartMetricsHref,
}: {
  item: GrowthCase;
  duplicatesOnly: boolean;
  demandPopulation: Array<number | null>;
  onOpenPart: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
  onOpenPartMetrics: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
  getPartHref: (ad: Pick<AdRow, 'branch' | 'id'>) => string;
  getPartMetricsHref: (ad: Pick<AdRow, 'branch' | 'id'>) => string;
}) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );
  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timeout = window.setTimeout(() => setCopyStatus('idle'), 2500);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);
  const copyTitle = async () => {
    try {
      await navigator.clipboard.writeText(item.name);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };
  const copyLabel =
    copyStatus === 'copied' ? 'Название скопировано' : 'Скопировать название';
  const ad = { branch: item.branch, id: item.primaryId };
  const url = avitoUrl(item.primaryId);
  const listings = duplicatesOnly
    ? item.listings.filter((listing) => item.duplicateIds.includes(listing.id))
    : item.listings;
  return (
    <article
      className={`growth-card ${item.isDuplicate ? 'is-duplicate' : ''}`}
    >
      <header className="growth-card-header">
        <span className="growth-card-icon">
          {item.isDuplicate ? <Layers3 /> : <Eye />}
        </span>
        <div className="growth-card-heading">
          <div className="growth-card-tags">
            <span className="growth-branch">{item.branch}</span>
            {item.article && <span>Артикул {item.article}</span>}
            {!duplicatesOnly && item.category && (
              <span className={`growth-category category-${item.category}`}>
                Категория {item.category}
              </span>
            )}
            {!duplicatesOnly && item.demandFound && (
              <span
                className={`growth-demand demand-${demandLevel(item.demand, demandPopulation)}`}
              >
                Спрос{' '}
                {item.demand == null ? 'нет значения' : number(item.demand)}
              </span>
            )}
          </div>
          <div className="growth-title-row">
            <div className="growth-title-details">
              <div className="growth-title">
                <h3>
                  <a
                    href={getPartHref(ad)}
                    onClick={(event) => {
                      event.preventDefault();
                      onOpenPart(ad);
                    }}
                  >
                    {item.name}
                  </a>
                </h3>
                <button
                  type="button"
                  className={`growth-copy-title ${copyStatus}`}
                  aria-label={copyLabel}
                  title={copyLabel}
                  onClick={copyTitle}
                >
                  {copyStatus === 'copied' ? <Check /> : <Copy />}
                </button>
                <output
                  className={
                    copyStatus === 'error' ? 'growth-copy-error' : 'sr-only'
                  }
                >
                  {copyStatus === 'copied'
                    ? 'Название скопировано'
                    : copyStatus === 'error'
                      ? 'Не удалось скопировать название'
                      : ''}
                </output>
              </div>
              <p>
                {duplicatesOnly
                  ? `${item.duplicateIds.length} ID в двух последних выгрузках`
                  : `Текущий номер: № ${item.primaryId}${item.previousIds.length ? ` · предыдущих ${item.previousIds.length}` : ''}`}
              </p>
            </div>
            {!duplicatesOnly && (
              <div className="growth-card-actions">
                {url && (
                  <a href={url} target="_blank" rel="noreferrer">
                    Открыть объявление <ExternalLink />
                  </a>
                )}
                <a
                  href={getPartMetricsHref(ad)}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpenPartMetrics(ad);
                  }}
                >
                  Показатели <ArrowRight />
                </a>
              </div>
            )}
          </div>
        </div>
      </header>
      {!duplicatesOnly && (
        <div
          className="growth-funnel"
          aria-label="Показатели текущего номера за выбранный период"
        >
          <span>
            <small>Показы</small>
            <strong>{format(item.impressions, 'impressions')}</strong>
          </span>
          <span>
            <small>Просмотры</small>
            <strong>{format(item.views, 'views')}</strong>
          </span>
          <span>
            <small>Контакты</small>
            <strong>{format(item.contacts, 'contacts')}</strong>
          </span>
          <span>
            <small>Показы → просмотры</small>
            <strong>
              {item.viewRate == null ? '—' : `${number(item.viewRate * 100)}%`}
            </strong>
          </span>
          <span>
            <small>Просмотры → контакты</small>
            <strong>
              {item.contactRate == null
                ? '—'
                : `${number(item.contactRate * 100)}%`}
            </strong>
          </span>
          <span className="growth-window">
            <small>Выгрузок в периоде</small>
            <strong>{item.reportCount}</strong>
          </span>
        </div>
      )}
      {item.isDuplicate && (
        <div className="growth-duplicate-proof">
          <Layers3 />
          <span>
            Дубль: ID {item.duplicateIds.join(', ')} присутствуют вместе в
            выгрузках {item.duplicateDates.map(shortDate).join(' и ')}.
          </span>
        </div>
      )}
      {(duplicatesOnly || listings.length > 1) && (
        <div className="growth-listings">
          <div className="growth-listing-caption">
            {duplicatesOnly
              ? 'Показатели последней выгрузки'
              : 'Номера в последней выгрузке · показатели за выбранный период'}
          </div>
          {listings.map((listing) => {
            const target = { branch: item.branch, id: listing.id },
              listingUrl = avitoUrl(listing.id);
            return (
              <div className="growth-listing-row" key={listing.id}>
                <a
                  href={getPartHref(target)}
                  onClick={(event) => {
                    event.preventDefault();
                    onOpenPart(target);
                  }}
                >
                  № {listing.id}
                </a>
                <span>
                  Показы{' '}
                  <b>
                    {format(
                      duplicatesOnly
                        ? listing.latestImpressions
                        : listing.impressions,
                      'impressions',
                    )}
                  </b>
                </span>
                <span>
                  Просмотры{' '}
                  <b>
                    {format(
                      duplicatesOnly ? listing.latestViews : listing.views,
                      'views',
                    )}
                  </b>
                </span>
                <span>
                  Контакты{' '}
                  <b>
                    {format(
                      duplicatesOnly
                        ? listing.latestContacts
                        : listing.contacts,
                      'contacts',
                    )}
                  </b>
                </span>
                {listingUrl && (
                  <a
                    className="growth-listing-avito"
                    href={listingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть <ExternalLink />
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!duplicatesOnly && (
        <footer className="growth-card-footer">
          <span>
            Первое появление текущего ID: <b>{shortDate(item.firstSeen)}</b>
          </span>
          <span>
            Последняя выгрузка: <b>{shortDate(item.lastSeen)}</b>
          </span>
        </footer>
      )}
    </article>
  );
}

export default function Insights({
  snapshot,
  from,
  to,
  availableBranches,
  initialBranch,
  onOpenPart,
  onOpenPartMetrics,
  getPartHref,
  getPartMetricsHref,
  demandByArticle,
  categoryByArticle,
  onDuplicateModeChange,
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  availableBranches: string[];
  initialBranch: string;
  onOpenPart: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
  onOpenPartMetrics: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
  getPartHref: (ad: Pick<AdRow, 'branch' | 'id'>) => string;
  getPartMetricsHref: (ad: Pick<AdRow, 'branch' | 'id'>) => string;
  demandByArticle: Record<string, number | null>;
  categoryByArticle: Record<string, string | null>;
  onDuplicateModeChange?: (duplicatesOnly: boolean) => void;
}) {
  const [storedFilters, setFilters] = useState(() =>
    restoreGrowthFilters(
      readBrowserPreference(FILTERS_KEY),
      typeof window === 'undefined'
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search),
      initialBranch,
      availableBranches,
    ),
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const scope =
    storedFilters.scope === 'network' ||
    availableBranches.includes(storedFilters.scope)
      ? storedFilters.scope
      : 'network';
  const cases = useMemo(
    () =>
      buildGrowthCases(snapshot, {
        from,
        to,
        branches: availableBranches,
        demandByArticle,
        categoryByArticle,
      }),
    [snapshot, from, to, availableBranches, demandByArticle, categoryByArticle],
  );
  const scoped = useMemo(
    () => cases.filter((item) => scope === 'network' || item.branch === scope),
    [cases, scope],
  );
  const demandMax = growthRangeMaximum(scoped, 'demand');
  const metricMax = growthRangeMaximum(scoped, storedFilters.metric.metric);
  const extraMax = storedFilters.extra
    ? growthRangeMaximum(scoped, storedFilters.extra.metric)
    : 0;
  const filters = useMemo(
    () => ({
      ...storedFilters,
      demand: clampGrowthRange(storedFilters.demand, demandMax),
      metric: clampGrowthRange(storedFilters.metric, metricMax),
      extra: storedFilters.extra
        ? clampGrowthRange(storedFilters.extra, extraMax)
        : null,
    }),
    [storedFilters, demandMax, metricMax, extraMax],
  );
  useEffect(() => {
    onDuplicateModeChange?.(filters.duplicatesOnly);
    return () => onDuplicateModeChange?.(false);
  }, [filters.duplicatesOnly, onDuplicateModeChange]);
  useEffect(() => {
    saveBrowserPreference(FILTERS_KEY, { ...filters, scope });
    replaceUrlParameters({
      scope,
      growthMode: filters.duplicatesOnly ? 'duplicates' : null,
      growthCategories:
        filters.categories === null ? null : JSON.stringify(filters.categories),
      growthDemandMin: filters.demand.min || null,
      growthDemandMax: filters.demand.max || null,
      growthMetric: filters.metric.metric,
      growthMetricMin: filters.metric.min || null,
      growthMetricMax: filters.metric.max || null,
      growthExtraMetric: filters.extra?.metric ?? null,
      growthExtraMin: filters.extra?.min || null,
      growthExtraMax: filters.extra?.max || null,
      growthSearch: filters.search || null,
      growthView: null,
      growthSignal: null,
      growthCategory: null,
      growthDecision: null,
    });
  }, [filters, scope]);
  const update = (patch: Partial<GrowthFilters>) => {
    setFilters({ ...filters, ...patch });
    setVisibleCount(PAGE_SIZE);
  };
  const reset = () => update(defaultGrowthFilters(scope));
  const duplicates = cases.filter((item) => item.isDuplicate);
  const filtered = filterGrowthCases(cases, { ...filters, scope }).sort(
    (left, right) =>
      Number(right.category === 'A') - Number(left.category === 'A') ||
      (right.demand ?? -1) - (left.demand ?? -1) ||
      left.name.localeCompare(right.name, 'ru'),
  );
  const displayed = filtered.slice(0, visibleCount);
  const choices = [
    ...new Set([
      ...cases
        .map((item) => item.category)
        .filter((value): value is string => value != null),
      ...(filters.categories ?? []).filter(
        (value) => value !== NO_GROWTH_CATEGORY,
      ),
    ]),
  ].sort((left, right) => left.localeCompare(right, 'ru'));
  choices.push(NO_GROWTH_CATEGORY);
  const metricRange = (
    key: 'metric' | 'extra',
    value: GrowthMetricFilter,
    ceiling: number,
  ) => (
    <RangeField
      key={key}
      label={key === 'metric' ? 'Показатель' : 'Дополнительный показатель'}
      range={value}
      ceiling={ceiling}
      percentage={value.metric.endsWith('Rate')}
      metric={value.metric}
      onMetricChange={(metric) =>
        update({ [key]: { metric, min: '', max: '' } })
      }
      onChange={(range) => update({ [key]: { ...value, ...range } })}
      onRemove={key === 'extra' ? () => update({ extra: null }) : undefined}
    />
  );
  return (
    <div
      className={`insights-page growth-page ${filters.duplicatesOnly ? 'duplicates-mode' : ''}`}
    >
      <section className="catalog-header insights-header growth-header">
        <div>
          <span className="eyebrow">
            {filters.duplicatesOnly
              ? 'ДВА ПОСЛЕДНИХ НЕДЕЛЬНЫХ ОТЧЁТА'
              : 'ОТБОР ОБЪЯВЛЕНИЙ'}
          </span>
          <h2>{filters.duplicatesOnly ? 'Дубли' : 'Точки роста'}</h2>
          <p>
            {filters.duplicatesOnly
              ? 'Одни и те же ID с одним артикулом в двух последних выгрузках одного подразделения. Показаны все найденные дубли.'
              : 'Один артикул в подразделении — одна карточка. В списке только объявления из последней выгрузки; показатели текущего номера — за выбранный период.'}
          </p>
        </div>
        {!filters.duplicatesOnly && (
          <div className="insights-scope-picker">
            <span>Подразделение</span>
            <Picker
              label="Подразделение"
              value={scope}
              onChange={(value) => update({ scope: value })}
              items={[
                { value: 'network', label: 'Все подразделения' },
                ...availableBranches.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
        )}
      </section>
      <section className="growth-filters panel">
        <div className="growth-filter-toolbar">
          {!filters.duplicatesOnly && (
            <>
              <label className="growth-search">
                <Search />
                <input
                  value={filters.search}
                  onChange={(event) => update({ search: event.target.value })}
                  placeholder="Артикул, название или номер"
                  aria-label="Поиск объявления"
                />
              </label>
              <CategoryPicker
                choices={choices}
                selected={filters.categories}
                onChange={(categories) => update({ categories })}
              />
            </>
          )}
          <button
            type="button"
            className="growth-duplicates-button"
            aria-pressed={filters.duplicatesOnly}
            onClick={() => update({ duplicatesOnly: !filters.duplicatesOnly })}
          >
            <Layers3 />
            Дубли <b>{duplicates.length}</b>
          </button>
          {filters.duplicatesOnly ? (
            <button
              type="button"
              className="growth-reset"
              onClick={() => update({ duplicatesOnly: false })}
            >
              Вернуться к отбору
            </button>
          ) : (
            <button type="button" className="growth-reset" onClick={reset}>
              Сбросить
            </button>
          )}
        </div>
        {!filters.duplicatesOnly && (
          <>
            <div
              className={`growth-range-grid ${filters.extra ? 'with-extra' : ''}`}
            >
              <RangeField
                label="Спрос"
                range={filters.demand}
                ceiling={demandMax}
                onChange={(demand) => update({ demand })}
              />
              {metricRange('metric', filters.metric, metricMax)}
              {filters.extra && metricRange('extra', filters.extra, extraMax)}
            </div>
            <div className="growth-filter-footer">
              <span>
                Показатели: {dateRangeLabel(from, to)} · только текущий ID
              </span>
              {!filters.extra && (
                <button
                  type="button"
                  onClick={() =>
                    update({
                      extra: {
                        metric:
                          filters.metric.metric === 'viewRate'
                            ? 'impressions'
                            : 'viewRate',
                        min: '',
                        max: '',
                      },
                    })
                  }
                >
                  <Plus />
                  Добавить показатель
                </button>
              )}
            </div>
          </>
        )}
      </section>
      <section className="insight-list-panel panel growth-list-panel">
        <div className="insight-list-toolbar growth-list-toolbar">
          <div>
            <span className="eyebrow">
              {filters.duplicatesOnly
                ? 'ПОДТВЕРЖДЁННЫЕ ДУБЛИ'
                : 'КАРТОЧКИ ОБЪЯВЛЕНИЙ'}
            </span>
            <h2>
              {filters.duplicatesOnly
                ? `${filtered.length} ${filtered.length === 1 ? 'артикул' : 'артикулов'} с дублями`
                : `Найдено ${filtered.length} из ${scoped.length}`}
            </h2>
          </div>
        </div>
        {displayed.length ? (
          <div className="insight-list growth-list">
            {displayed.map((item) => (
              <GrowthCard
                key={item.generationKey}
                item={item}
                duplicatesOnly={filters.duplicatesOnly}
                demandPopulation={Object.values(demandByArticle)}
                onOpenPart={onOpenPart}
                onOpenPartMetrics={onOpenPartMetrics}
                getPartHref={getPartHref}
                getPartMetricsHref={getPartMetricsHref}
              />
            ))}
            {displayed.length < filtered.length && (
              <button
                type="button"
                className="insight-load-more"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                Показать ещё{' '}
                {Math.min(PAGE_SIZE, filtered.length - displayed.length)}{' '}
                <ArrowRight />
              </button>
            )}
          </div>
        ) : (
          <div className="insight-empty">
            <Layers3 />
            <h3>
              {filters.duplicatesOnly
                ? 'Подтверждённых дублей нет'
                : 'Объявления не найдены'}
            </h3>
            <p>
              {filters.duplicatesOnly
                ? 'Одна совместная выгрузка двух ID не считается дублем.'
                : 'Измените категории или диапазоны. Объявления без строк в последней выгрузке сюда не попадают.'}
            </p>
            <button
              type="button"
              onClick={
                filters.duplicatesOnly
                  ? () => update({ duplicatesOnly: false })
                  : reset
              }
            >
              {filters.duplicatesOnly
                ? 'Вернуться к отбору'
                : 'Сбросить фильтры'}{' '}
              <ArrowRight />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
