'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Eye,
  Layers3,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
} from 'lucide-react';
import { Picker } from '@/components/analytics-ui';
import {
  readBrowserPreference,
  replaceUrlParameters,
  saveBrowserPreference,
} from '@/lib/browser-preferences';
import { demandLevel } from '@/lib/demand';
import {
  buildGrowthCases,
  DEFAULT_GROWTH_RULES,
  GROWTH_SIGNAL_LABELS,
  normalizeGrowthRules,
  type GrowthCase,
  type GrowthCaseState,
  type GrowthRules,
  type GrowthSignalKind,
} from '@/lib/growth';
import { format, shortDate, type AdRow, type Snapshot } from '@/lib/model';

type ViewFilter = GrowthCaseState | 'all';

const PAGE_SIZE = 60;
const FILTERS_KEY = 'pik-growth-filters';
const RULES_KEY = 'pik-growth-rules';

const VIEW_FILTERS: { value: ViewFilter; label: string }[] = [
  { value: 'signal', label: 'Требуют внимания' },
  { value: 'waiting', label: 'Ждём данные' },
  { value: 'clear', label: 'Без сигналов' },
  { value: 'all', label: 'Все товары' },
];

function storedRules(): GrowthRules {
  const saved = readBrowserPreference(RULES_KEY);
  return normalizeGrowthRules({
    ...DEFAULT_GROWTH_RULES,
    ...(saved && typeof saved === 'object' ? saved : {}),
  } as GrowthRules);
}

function initialFilters(initialBranch: string, availableBranches: string[]) {
  const saved = readBrowserPreference(FILTERS_KEY);
  const params =
    typeof window === 'undefined'
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);
  const value = (name: string, fallback = '') =>
    params.get(name) ??
    (typeof saved[name] === 'string' ? String(saved[name]) : fallback);
  const scopeCandidate = value(
    'scope',
    availableBranches.includes(initialBranch) ? initialBranch : 'network',
  );
  const viewCandidate = value('growthView', 'signal');
  return {
    scope:
      scopeCandidate === 'network' || availableBranches.includes(scopeCandidate)
        ? scopeCandidate
        : 'network',
    view: VIEW_FILTERS.some((item) => item.value === viewCandidate)
      ? (viewCandidate as ViewFilter)
      : ('signal' as ViewFilter),
    category: value('growthCategory', 'all'),
    demandMin: value('growthDemandMin'),
    demandMax: value('growthDemandMax'),
    signal: value('growthSignal', 'all') as 'all' | GrowthSignalKind,
    search: value('growthSearch'),
    visibleCount: PAGE_SIZE,
  };
}

function avitoUrl(id: string) {
  return /^\d+$/.test(id) ? `https://www.avito.ru/${id}` : null;
}

function parseBound(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function caseIcon(item: GrowthCase) {
  if (item.signals.some((signal) => signal.kind === 'duplicate'))
    return <Layers3 />;
  if (
    item.signals.some(
      (signal) =>
        signal.kind === 'no-impressions' || signal.kind === 'low-reach',
    )
  )
    return <TrendingDown />;
  if (item.state === 'clear') return <ShieldCheck />;
  return <Eye />;
}

function GrowthCard({
  item,
  rules,
  demandPopulation,
  onOpenPart,
  onOpenPartMetrics,
  getPartHref,
  getPartMetricsHref,
}: {
  item: GrowthCase;
  rules: GrowthRules;
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
  const demandTone = demandLevel(item.demand, demandPopulation);
  return (
    <article className={`growth-card state-${item.state}`}>
      <header className="growth-card-header">
        <span className="growth-card-icon">{caseIcon(item)}</span>
        <div className="growth-card-heading">
          <div className="growth-card-tags">
            <span className="growth-branch">{item.branch}</span>
            {item.article && <span>Артикул {item.article}</span>}
            {item.category && (
              <span className={`growth-category category-${item.category}`}>
                Категория {item.category}
              </span>
            )}
            {item.demandFound && (
              <span className={`growth-demand demand-${demandTone}`}>
                Спрос{' '}
                {item.demand == null
                  ? 'нет значения'
                  : item.demand.toLocaleString('ru-RU')}
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
                Текущее: {item.currentIds.map((id) => `№ ${id}`).join(', ')}
                {item.previousIds.length > 0 &&
                  ` · предыдущих ${item.previousIds.length}`}
              </p>
            </div>
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
          </div>
        </div>
      </header>

      <div className="growth-funnel" aria-label="Фактические результаты">
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
        <span className="growth-window">
          <small>Окно</small>
          <strong>
            {item.windowReportCount} из {item.reportCount} выгрузок
          </strong>
        </span>
      </div>

      <div className="growth-findings">
        {item.signals.length > 0 ? (
          item.signals.map((signal) => (
            <div
              key={signal.kind}
              className={`growth-finding signal-${signal.kind}`}
            >
              <strong>{signal.title}</strong>
              <p>{signal.explanation}</p>
            </div>
          ))
        ) : item.state === 'waiting' ? (
          <div className="growth-finding waiting">
            <strong>Пока рано оценивать</strong>
            <p>
              Текущий номер попал в {item.reportCount} выгрузок выбранного
              периода; правила начинают проверку с {rules.minimumReports}.
            </p>
          </div>
        ) : (
          <div className="growth-finding clear">
            <strong>По настроенным правилам сигналов нет</strong>
            <p>
              Это не автоматическая оценка «хорошо»: товар просто не совпал с
              активными условиями.
            </p>
          </div>
        )}
      </div>

      <footer className="growth-card-footer">
        <span>
          Первая выгрузка: <b>{shortDate(item.firstSeen)}</b>
        </span>
        <span>
          Последняя: <b>{shortDate(item.lastSeen)}</b>
        </span>
      </footer>
    </article>
  );
}

function RuleField({
  label,
  value,
  min = 0,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="growth-rule-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        {suffix && <small>{suffix}</small>}
      </div>
    </label>
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
}) {
  const [initial] = useState(() =>
    initialFilters(initialBranch, availableBranches),
  );
  const [scope, setScope] = useState(initial.scope);
  const [view, setView] = useState(initial.view);
  const [category, setCategory] = useState(initial.category);
  const [demandMin, setDemandMin] = useState(initial.demandMin);
  const [demandMax, setDemandMax] = useState(initial.demandMax);
  const [signal, setSignal] = useState<'all' | GrowthSignalKind>(
    initial.signal,
  );
  const [search, setSearch] = useState(initial.search);
  const [visibleCount, setVisibleCount] = useState(initial.visibleCount);
  const [rules, setRules] = useState(storedRules);

  const effectiveScope =
    scope === 'network' || availableBranches.includes(scope)
      ? scope
      : 'network';
  const cases = useMemo(
    () =>
      buildGrowthCases(snapshot, {
        from,
        to,
        branches: availableBranches,
        demandByArticle,
        categoryByArticle,
        rules,
      }),
    [
      availableBranches,
      categoryByArticle,
      demandByArticle,
      from,
      rules,
      snapshot,
      to,
    ],
  );

  useEffect(() => {
    saveBrowserPreference(RULES_KEY, { ...rules });
  }, [rules]);
  useEffect(() => {
    const filters = {
      scope: effectiveScope,
      view,
      category,
      demandMin,
      demandMax,
      signal,
      search,
    };
    saveBrowserPreference(FILTERS_KEY, filters);
    replaceUrlParameters({
      scope: effectiveScope,
      growthView: view,
      growthCategory: category,
      growthDemandMin: demandMin,
      growthDemandMax: demandMax,
      growthSignal: signal,
      growthDecision: null,
      growthSearch: search,
    });
  }, [category, demandMax, demandMin, effectiveScope, search, signal, view]);

  const scoped = cases.filter(
    (item) => effectiveScope === 'network' || item.branch === effectiveScope,
  );
  const categories = [
    ...new Set(cases.map((item) => item.category).filter(Boolean)),
  ].sort((left, right) =>
    String(left).localeCompare(String(right), 'ru'),
  ) as string[];
  const categoryChoices = [
    { value: 'all', label: 'Все категории' },
    ...categories.map((value) => ({
      value,
      label: `Категория ${value}`,
    })),
    { value: 'none', label: 'Без категории' },
  ];
  const minimumDemand = parseBound(demandMin);
  const maximumDemand = parseBound(demandMax);
  const normalizedSearch = search.trim().toLocaleLowerCase('ru');
  const commonFiltered = scoped.filter((item) => {
    if (
      category !== 'all' &&
      (category === 'none' ? item.category != null : item.category !== category)
    )
      return false;
    if (
      minimumDemand != null &&
      (item.demand == null || item.demand < minimumDemand)
    )
      return false;
    if (
      maximumDemand != null &&
      (item.demand == null || item.demand > maximumDemand)
    )
      return false;
    if (
      signal !== 'all' &&
      !item.signals.some((itemSignal) => itemSignal.kind === signal)
    )
      return false;
    if (
      normalizedSearch &&
      !`${item.article ?? ''} ${item.name} ${item.branch} ${item.currentIds.join(' ')}`
        .toLocaleLowerCase('ru')
        .includes(normalizedSearch)
    )
      return false;
    return true;
  });
  const viewCounts = Object.fromEntries(
    VIEW_FILTERS.map((item) => [
      item.value,
      item.value === 'all'
        ? commonFiltered.length
        : commonFiltered.filter((entry) => entry.state === item.value).length,
    ]),
  ) as Record<ViewFilter, number>;
  const stateRank: Record<GrowthCaseState, number> = {
    signal: 0,
    waiting: 1,
    clear: 2,
  };
  const filtered = commonFiltered
    .filter((item) => view === 'all' || item.state === view)
    .sort(
      (left, right) =>
        stateRank[left.state] - stateRank[right.state] ||
        Number(right.category === 'A') - Number(left.category === 'A') ||
        (right.demand ?? -1) - (left.demand ?? -1) ||
        right.reportCount - left.reportCount ||
        left.name.localeCompare(right.name, 'ru'),
    );
  const displayed = filtered.slice(0, visibleCount);
  const summary = {
    total: scoped.length,
    signal: scoped.filter((item) => item.state === 'signal').length,
    waiting: scoped.filter((item) => item.state === 'waiting').length,
    clear: scoped.filter((item) => item.state === 'clear').length,
    duplicates: scoped.filter((item) =>
      item.signals.some((itemSignal) => itemSignal.kind === 'duplicate'),
    ).length,
  };
  const scopes = [
    { value: 'network', label: 'Все подразделения' },
    ...availableBranches.map((value) => ({ value, label: value })),
  ];
  const signalChoices = [
    { value: 'all', label: 'Все типы сигналов' },
    ...Object.entries(GROWTH_SIGNAL_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  ];
  const updateRule = (key: keyof GrowthRules, value: number) =>
    setRules((current) => normalizeGrowthRules({ ...current, [key]: value }));
  const resetFilters = () => {
    setCategory('all');
    setDemandMin('');
    setDemandMax('');
    setSignal('all');
    setSearch('');
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="insights-page growth-page">
      <section className="catalog-header insights-header growth-header">
        <div>
          <span className="eyebrow">
            ПРОЗРАЧНЫЕ СИГНАЛЫ ПО ТЕКУЩИМ ОБЪЯВЛЕНИЯМ
          </span>
          <h2>Точки роста</h2>
          <p>
            Один артикул в подразделении — одна карточка. Спрос — рыночные
            запросы; категория — вклад товара в годовой финансовый результат.
            Это два независимых фильтра.
          </p>
        </div>
        <div className="insights-scope-picker">
          <span>Подразделение</span>
          <Picker
            label="Подразделение"
            value={effectiveScope}
            onChange={(value) => {
              setScope(value);
              setVisibleCount(PAGE_SIZE);
            }}
            items={scopes}
          />
        </div>
      </section>

      <section className="growth-summary panel">
        <span>
          <small>Товаров</small>
          <strong>{summary.total}</strong>
        </span>
        <span>
          <small>Требуют внимания</small>
          <strong>{summary.signal}</strong>
        </span>
        <span>
          <small>Ждём данные</small>
          <strong>{summary.waiting}</strong>
        </span>
        <span>
          <small>Без сигналов</small>
          <strong>{summary.clear}</strong>
        </span>
        <span>
          <small>Дубли</small>
          <strong>{summary.duplicates}</strong>
        </span>
      </section>

      <details className="growth-rules panel">
        <summary>
          <span>
            <SlidersHorizontal /> <b>Правила сигналов</b>
          </span>
          <small>Все пороги видны и меняются вручную</small>
          <ChevronDown />
        </summary>
        <div className="growth-rules-body">
          <div className="growth-rule-grid">
            <RuleField
              label="Минимум выгрузок текущего номера"
              value={rules.minimumReports}
              min={1}
              onChange={(value) => updateRule('minimumReports', value)}
            />
            <RuleField
              label="Сколько последних выгрузок считать"
              value={rules.observationReports}
              min={1}
              onChange={(value) => updateRule('observationReports', value)}
            />
            <RuleField
              label="Сигнал «нет показов»: не больше"
              value={rules.maximumImpressions}
              onChange={(value) => updateRule('maximumImpressions', value)}
            />
            <RuleField
              label="Сигнал «нет просмотров»: не больше"
              value={rules.maximumViews}
              onChange={(value) => updateRule('maximumViews', value)}
            />
            <RuleField
              label="Проверять ноль контактов от"
              value={rules.minimumViewsForContacts}
              min={1}
              suffix="просмотров"
              onChange={(value) => updateRule('minimumViewsForContacts', value)}
            />
            <RuleField
              label="Низкий охват: не больше от медианы подразделения"
              value={Math.round(rules.maximumReachShare * 100)}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => updateRule('maximumReachShare', value / 100)}
            />
          </div>
          <div className="growth-rule-note">
            <p>
              Считаются только строки текущего номера в выбранном периоде.
              Отсутствующая выгрузка не считается нулём. При новом ID история
              оценки начинается заново.
            </p>
            <button
              type="button"
              onClick={() => setRules(DEFAULT_GROWTH_RULES)}
            >
              Вернуть исходные пороги
            </button>
          </div>
        </div>
      </details>

      <section className="growth-filters panel">
        <label className="growth-search">
          <Search />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Артикул, название или номер"
          />
        </label>
        <Picker
          label="Категория"
          value={
            categoryChoices.some((item) => item.value === category)
              ? category
              : 'all'
          }
          onChange={(value) => {
            setCategory(value);
            setVisibleCount(PAGE_SIZE);
          }}
          items={categoryChoices}
        />
        <label className="growth-range">
          <span>Спрос</span>
          <input
            inputMode="decimal"
            value={demandMin}
            onChange={(event) => setDemandMin(event.target.value)}
            placeholder="от"
          />
          <i>—</i>
          <input
            inputMode="decimal"
            value={demandMax}
            onChange={(event) => setDemandMax(event.target.value)}
            placeholder="до"
          />
        </label>
        <Picker
          label="Тип сигнала"
          value={
            signalChoices.some((item) => item.value === signal) ? signal : 'all'
          }
          onChange={(value) => {
            setSignal(value as 'all' | GrowthSignalKind);
            setVisibleCount(PAGE_SIZE);
          }}
          items={signalChoices}
          contentAlign="end"
        />
        <button type="button" className="growth-reset" onClick={resetFilters}>
          Сбросить
        </button>
      </section>

      <section className="insight-list-panel panel growth-list-panel">
        <div className="insight-list-toolbar growth-list-toolbar">
          <div>
            <span className="eyebrow">УНИКАЛЬНЫЕ ТОВАРЫ</span>
            <h2>
              {filtered.length} {filtered.length === 1 ? 'товар' : 'товаров'}
            </h2>
          </div>
          <div className="insight-view-switch" aria-label="Состояние товаров">
            {VIEW_FILTERS.map((item) => (
              <button
                key={item.value}
                className={`view-${item.value} ${view === item.value ? 'active' : ''}`}
                onClick={() => {
                  setView(item.value);
                  setVisibleCount(PAGE_SIZE);
                }}
              >
                <span>{item.label}</span>
                <b>{viewCounts[item.value]}</b>
              </button>
            ))}
          </div>
        </div>
        {displayed.length ? (
          <div className="insight-list growth-list">
            {displayed.map((item) => (
              <GrowthCard
                key={item.generationKey}
                item={item}
                rules={rules}
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
            <ShieldCheck />
            <h3>Товары не найдены</h3>
            <p>
              Измените фильтры или пороги правил. Отсутствие сигнала не
              считается автоматической оценкой товара.
            </p>
            <button type="button" onClick={resetFilters}>
              Сбросить фильтры <ArrowRight />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
