'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Eye,
  Layers3,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  TrendingDown,
} from 'lucide-react';
import { Picker } from '@/components/analytics-ui';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  INSIGHT_KIND_LABELS,
  buildInsightReport,
  type Insight,
  type InsightKind,
  type InsightTone,
} from '@/lib/insights';
import {
  demandForArticle,
  demandLevel,
  normalizeDemandArticle,
} from '@/lib/demand';
import { extractArticle } from '@/lib/explore';
import type { AdRow, Snapshot } from '@/lib/model';

type ViewFilter = 'all' | 'high' | 'medium' | 'opportunity';
const PAGE_SIZE = 60;

const VIEW_FILTERS: { value: ViewFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'high', label: 'Высокий приоритет' },
  { value: 'medium', label: 'Стоит проверить' },
  { value: 'opportunity', label: 'Сильные примеры' },
];

function initialUrlFilters(initialBranch: string, availableBranches: string[]) {
  const fallbackScope = availableBranches.includes(initialBranch)
    ? initialBranch
    : 'network';
  const fallback = {
    scope: fallbackScope,
    view: 'all' as ViewFilter,
    kind: 'all' as 'all' | InsightKind,
    visibleCount: PAGE_SIZE,
  };
  if (typeof window === 'undefined') return fallback;
  const params = new URLSearchParams(window.location.search);
  const savedScope = params.get('scope');
  const savedView = params.get('priority');
  const savedKind = params.get('reason');
  const savedCount = params.get('shown');
  const parsedCount =
    savedCount && /^\d+$/.test(savedCount) ? Number(savedCount) : PAGE_SIZE;
  return {
    scope:
      savedScope === 'network' ||
      (savedScope != null && availableBranches.includes(savedScope))
        ? savedScope
        : fallbackScope,
    view: VIEW_FILTERS.some((item) => item.value === savedView)
      ? (savedView as ViewFilter)
      : 'all',
    kind:
      savedKind === 'all' ||
      (savedKind != null && Object.hasOwn(INSIGHT_KIND_LABELS, savedKind))
        ? (savedKind as 'all' | InsightKind)
        : 'all',
    visibleCount: Math.max(PAGE_SIZE, Math.min(parsedCount, 6000)),
  };
}

function replaceUrlFilters(values: Record<string, string>) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  Object.entries(values).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  );
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
}

const NEGATIVE_KINDS = new Set<InsightKind>([
  'reach-drop',
  'view-rate-drop',
  'contact-rate-drop',
  'persistent-low-reach',
  'persistent-no-result',
  'portfolio-view-gap',
  'portfolio-contact-gap',
  'peer-gap',
]);

const PRIORITY_KIND_BY_SOURCE: Partial<Record<InsightKind, InsightKind>> = {
  'reach-drop': 'priority-reach-drop',
  'view-rate-drop': 'priority-view-rate-drop',
  'contact-rate-drop': 'priority-contact-rate-drop',
  'persistent-low-reach': 'priority-persistent-low-reach',
  'persistent-no-result': 'priority-persistent-no-result',
  'portfolio-view-gap': 'priority-portfolio-view-gap',
  'portfolio-contact-gap': 'priority-portfolio-contact-gap',
  'peer-gap': 'priority-peer-gap',
};

const PRIORITY_RESULT_BY_SOURCE: Partial<Record<InsightKind, string>> = {
  'reach-drop': 'охват недавно снизился',
  'view-rate-drop': 'доля просмотров недавно снизилась',
  'contact-rate-drop': 'доля контактов недавно снизилась',
  'persistent-low-reach': 'охват стабильно низкий',
  'persistent-no-result': 'долго нет контактов',
  'portfolio-view-gap': 'просмотры хуже среднего по подразделению',
  'portfolio-contact-gap': 'контакты хуже среднего по подразделению',
  'peer-gap': 'результат хуже других подразделений',
};

const PRIORITY_REACH_KINDS = new Set<InsightKind>([
  'priority-reach-drop',
  'priority-persistent-low-reach',
]);
const PRIORITY_VIEW_KINDS = new Set<InsightKind>([
  'priority-view-rate-drop',
  'priority-portfolio-view-gap',
]);
const PRIORITY_CONTACT_KINDS = new Set<InsightKind>([
  'priority-contact-rate-drop',
  'priority-persistent-no-result',
  'priority-portfolio-contact-gap',
  'priority-peer-gap',
]);

function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="insight-info-button"
            aria-label={label}
          >
            <CircleHelp />
          </button>
        }
      />
      <TooltipContent className="insight-tooltip" side="bottom" align="start">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

function insightIcon(insight: Insight) {
  if (
    insight.kind === 'reach-drop' ||
    insight.kind === 'persistent-low-reach' ||
    PRIORITY_REACH_KINDS.has(insight.kind)
  )
    return <TrendingDown />;
  if (
    insight.kind === 'view-rate-drop' ||
    insight.kind === 'portfolio-view-gap' ||
    PRIORITY_VIEW_KINDS.has(insight.kind)
  )
    return <Eye />;
  if (
    insight.kind === 'contact-rate-drop' ||
    insight.kind === 'portfolio-contact-gap' ||
    insight.kind === 'persistent-no-result' ||
    insight.kind === 'peer-gap' ||
    PRIORITY_CONTACT_KINDS.has(insight.kind)
  )
    return <MessageCircle />;
  if (insight.kind === 'peer-winner' || insight.kind === 'portfolio-winner')
    return <Sparkles />;
  return <Layers3 />;
}

function toneLabel(tone: InsightTone) {
  if (tone === 'high') return 'Высокий приоритет';
  if (tone === 'medium') return 'Стоит проверить';
  if (tone === 'opportunity') return 'Успешный пример';
  return 'Возможный дубль';
}

function reportCountLabel(count: number) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? 'отчётов'
      : mod10 === 1
        ? 'отчёт'
        : mod10 >= 2 && mod10 <= 4
          ? 'отчёта'
          : 'отчётов';
  return `${count.toLocaleString('ru-RU')} ${word}`;
}

function avitoUrl(id?: string) {
  return id && /^\d+$/.test(id) ? `https://www.avito.ru/${id}` : null;
}

function demandForInsight(
  values: Record<string, number | null>,
  categories: Record<string, string | null>,
  insight: Insight,
) {
  const candidates = [
    insight.article,
    ...extractArticle(insight.name).candidates,
  ].filter((value): value is string => Boolean(value));
  for (const article of candidates) {
    const demand = demandForArticle(values, article);
    if (demand.found)
      return {
        ...demand,
        article: normalizeDemandArticle(article),
        category: categories[normalizeDemandArticle(article)] ?? null,
      };
  }
  return {
    found: false,
    value: null,
    article: insight.article ?? null,
    category: null,
  };
}

function viewMatchesInsight(view: ViewFilter, insight: Insight): boolean {
  return (
    view === 'all' ||
    (view === 'high' && insight.tone === 'high') ||
    (view === 'medium' &&
      (insight.tone === 'medium' || insight.tone === 'check')) ||
    (view === 'opportunity' && insight.tone === 'opportunity')
  );
}

export function buildDemandGapInsights(
  insights: Insight[],
  demandByArticle: Record<string, number | null>,
  categoryByArticle: Record<string, string | null>,
): Insight[] {
  const demandValues = Object.values(demandByArticle)
    .filter((value): value is number => value != null)
    .sort((left, right) => left - right);
  const highDemandThreshold = demandValues.length
    ? demandValues[Math.floor((demandValues.length - 1) * 0.75)]
    : null;
  const strongestByListing = new Map<
    string,
    {
      insight: Insight;
      demand: number | null;
      article: string | null;
      category: string | null;
    }
  >();

  insights.forEach((insight) => {
    if (!NEGATIVE_KINDS.has(insight.kind)) return;
    const priorityKind = PRIORITY_KIND_BY_SOURCE[insight.kind];
    if (!priorityKind) return;
    const product = demandForInsight(
      demandByArticle,
      categoryByArticle,
      insight,
    );
    const categoryPriority = product.category
      ? ({ A: 3, B: 2, C: 1 }[product.category] ?? 0)
      : 0;
    const highDemand =
      product.value != null &&
      highDemandThreshold != null &&
      product.value >= highDemandThreshold;
    if (!highDemand && categoryPriority === 0) return;
    const key =
      insight.listingKey ??
      `${insight.branch}:${insight.listingId ?? insight.name}`;
    const previous = strongestByListing.get(key);
    if (!previous || insight.score > previous.insight.score) {
      strongestByListing.set(key, {
        insight,
        demand: product.value,
        article: product.article,
        category: product.category,
      });
    }
  });

  return [...strongestByListing.entries()].map(
    ([listingKey, { insight, demand, article, category }]) => {
      const priorityKind = PRIORITY_KIND_BY_SOURCE[insight.kind]!;
      const weakResult = PRIORITY_RESULT_BY_SOURCE[insight.kind]!;
      const demandText =
        demand == null
          ? null
          : `${category ? 'спрос' : 'Спрос'} ${demand.toLocaleString('ru-RU')}`;
      const categoryText = category ? `Категория ${category}` : null;
      const priorityText = [categoryText, demandText]
        .filter(Boolean)
        .join(' · ');
      const categoryBonus = category
        ? ({ A: 50, B: 35, C: 20 }[category] ?? 0)
        : 0;
      return {
        ...insight,
        id: `${priorityKind}:${listingKey}`,
        kind: priorityKind,
        tone: 'high' as const,
        article,
        title: `${categoryText ? `Товар категории ${category}` : 'Приоритетный товар'}: ${weakResult}`,
        summary: insight.summary,
        comparison: `${priorityText}; ${insight.comparison}`,
        sufficiency: `${insight.sufficiency} Приоритет товара взят из загруженной таблицы.`,
        method: `Спрос и категория используются для приоритизации, а не как доказательство причины. Слабый результат подтверждён отдельно: ${insight.method}`,
        checks: Array.from(
          new Set([
            'Проверить соответствие артикула и объявления',
            ...insight.checks,
          ]),
        ),
        score:
          insight.score +
          categoryBonus +
          (demand != null &&
          highDemandThreshold != null &&
          demand >= highDemandThreshold
            ? 35
            : 0),
      };
    },
  );
}

function InsightCard({
  insight,
  onOpenPart,
  demandByArticle,
  categoryByArticle,
}: {
  insight: Insight;
  onOpenPart: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
  demandByArticle: Record<string, number | null>;
  categoryByArticle: Record<string, string | null>;
}) {
  const url = avitoUrl(insight.listingId);
  const demand = demandForInsight(demandByArticle, categoryByArticle, insight);
  const demandTone = demandLevel(demand.value, Object.values(demandByArticle));
  const displayedArticle = demand.found ? demand.article : insight.article;
  return (
    <article className={`insight-card tone-${insight.tone}`}>
      <header className="insight-card-header">
        <span className="insight-card-icon">{insightIcon(insight)}</span>
        <div className="insight-card-heading">
          <div className="insight-card-tags">
            <span className="insight-branch">{insight.branch}</span>
            {displayedArticle && (
              <span className="insight-article">
                Артикул {displayedArticle}
              </span>
            )}
            {demand.found && (
              <span className={`insight-demand demand-${demandTone}`}>
                Спрос{' '}
                {demand.value == null
                  ? '—'
                  : demand.value.toLocaleString('ru-RU')}
              </span>
            )}
            {demand.category && (
              <span className={`insight-category category-${demand.category}`}>
                Категория {demand.category}
              </span>
            )}
            {insight.listingId && (
              <span className="insight-listing-id">№ {insight.listingId}</span>
            )}
          </div>
          <div className="insight-title-row">
            <h3>
              {url ? (
                <a href={url} target="_blank" rel="noreferrer">
                  {insight.name}
                  <ExternalLink />
                </a>
              ) : (
                insight.name
              )}
            </h3>
            <div className="insight-actions">
              {url && (
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Открыть объявление
                </a>
              )}
              {insight.listingId && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenPart({
                      branch: insight.branch,
                      id: insight.listingId!,
                    })
                  }
                >
                  <ChartNoAxesCombined />
                  Сравнить подразделения
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="insight-signal-summary">
        <span className={`insight-priority tone-${insight.tone}`}>
          {toneLabel(insight.tone)}
        </span>
        <div>
          <strong>{insight.title}</strong>
          <p>{insight.summary}</p>
        </div>
      </div>

      <div
        className={`insight-evidence ${insight.expected ? 'with-expected' : ''}`}
      >
        <span>
          <small>Фактический результат</small>
          <strong>{insight.current}</strong>
        </span>
        <span>
          <small>База сравнения</small>
          <strong>{insight.comparison}</strong>
        </span>
        {insight.expected && (
          <span>
            <small>
              Ожидаемый результат
              <InfoTip label="Что означает ожидаемый результат">
                Это не прогноз продаж. Мы применяем прежнюю или сетевую
                конверсию к текущему числу просмотров и смотрим, сколько
                контактов обычно соответствовало бы такому объёму.
              </InfoTip>
            </small>
            <strong>{insight.expected}</strong>
          </span>
        )}
        <span>
          <small>Отчётов в расчёте</small>
          <strong>{reportCountLabel(insight.reportCount)}</strong>
        </span>
      </div>
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
  demandByArticle,
  categoryByArticle,
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  availableBranches: string[];
  initialBranch: string;
  onOpenPart: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
  demandByArticle: Record<string, number | null>;
  categoryByArticle: Record<string, string | null>;
}) {
  const [initial] = useState(() =>
    initialUrlFilters(initialBranch, availableBranches),
  );
  const [scope, setScope] = useState(initial.scope);
  const [view, setView] = useState<ViewFilter>(initial.view);
  const [kind, setKind] = useState<'all' | InsightKind>(initial.kind);
  const [visibleCount, setVisibleCount] = useState(initial.visibleCount);
  const changeView = (next: ViewFilter) => {
    setView(next);
    setKind('all');
    setVisibleCount(PAGE_SIZE);
    replaceUrlFilters({
      priority: next,
      reason: 'all',
      shown: String(PAGE_SIZE),
    });
  };
  const changeKind = (next: 'all' | InsightKind) => {
    setKind(next);
    setVisibleCount(PAGE_SIZE);
    replaceUrlFilters({ reason: next, shown: String(PAGE_SIZE) });
  };
  const changeScope = (next: string) => {
    setScope(next);
    setVisibleCount(PAGE_SIZE);
    replaceUrlFilters({ scope: next, shown: String(PAGE_SIZE) });
  };
  const showMore = () => {
    const next = visibleCount + PAGE_SIZE;
    setVisibleCount(next);
    replaceUrlFilters({ shown: String(next) });
  };
  const resetFilters = () => {
    setView('all');
    setKind('all');
    setVisibleCount(PAGE_SIZE);
    replaceUrlFilters({
      priority: 'all',
      reason: 'all',
      shown: String(PAGE_SIZE),
    });
  };
  const effectiveScope =
    scope === 'network' || availableBranches.includes(scope)
      ? scope
      : 'network';
  const report = useMemo(
    () =>
      buildInsightReport(snapshot, {
        from,
        to,
        availableBranches,
        scope: effectiveScope,
      }),
    [availableBranches, effectiveScope, from, snapshot, to],
  );
  const demandGapInsights = useMemo(
    () =>
      buildDemandGapInsights(
        report.insights,
        demandByArticle,
        categoryByArticle,
      ),
    [categoryByArticle, demandByArticle, report.insights],
  );
  const allInsights = useMemo(
    () => [...report.insights, ...demandGapInsights],
    [demandGapInsights, report.insights],
  );
  const viewCounts = Object.fromEntries(
    VIEW_FILTERS.map((item) => [
      item.value,
      allInsights.filter((insight) => viewMatchesInsight(item.value, insight))
        .length,
    ]),
  ) as Record<ViewFilter, number>;
  const viewInsights = allInsights.filter((insight) =>
    viewMatchesInsight(view, insight),
  );
  const kindCounts = viewInsights.reduce<Partial<Record<InsightKind, number>>>(
    (counts, insight) => {
      counts[insight.kind] = (counts[insight.kind] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const selectableKindCounts = { ...kindCounts };
  if (view === 'medium' && selectableKindCounts.duplicate == null)
    selectableKindCounts.duplicate = 0;
  const kindChoices: { value: 'all' | InsightKind; label: string }[] = [
    { value: 'all', label: `Все причины · ${viewInsights.length}` },
    ...Object.entries(selectableKindCounts)
      .map(([value, count]) => ({
        value: value as InsightKind,
        label: `${INSIGHT_KIND_LABELS[value as InsightKind]} · ${count}`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'ru')),
  ];
  const effectiveKind = kindChoices.some((choice) => choice.value === kind)
    ? kind
    : 'all';
  const filtered = viewInsights
    .filter(
      (insight) => effectiveKind === 'all' || insight.kind === effectiveKind,
    )
    .sort((left, right) => right.score - left.score);
  const displayed = filtered.slice(0, visibleCount);
  const scopes = [
    { value: 'network', label: 'Все подразделения' },
    ...availableBranches.map((value) => ({ value, label: value })),
  ];

  return (
    <TooltipProvider delay={180}>
      <div className="insights-page">
        <section className="catalog-header insights-header">
          <div>
            <span className="eyebrow">ОБЪЯВЛЕНИЯ, КОТОРЫЕ СТОИТ ПРОВЕРИТЬ</span>
            <h2>Точки роста</h2>
            <p>
              Вывод появляется только тогда, когда данных хватает отличить
              устойчивое изменение от случайного колебания.
              <InfoTip label="Что такое достаточность данных">
                Достаточность проверяется отдельно для каждого вывода. Один
                контакт из одного просмотра не считается доказательством успеха,
                а ноль контактов при малом числе просмотров не доказывает плохую
                конверсию. Длительное отсутствие результата учитывается
                отдельно.
              </InfoTip>
            </p>
          </div>
          <div className="insights-scope-picker">
            <span>Подразделение</span>
            <Picker
              label="Подразделение"
              value={effectiveScope}
              onChange={changeScope}
              items={scopes}
            />
          </div>
        </section>

        <details className="insight-coverage panel">
          <summary className="insight-coverage-summary">
            <span className="eyebrow">ДОСТАТОЧНОСТЬ ДАННЫХ</span>
            <ChevronDown />
          </summary>
          <div className="insight-coverage-details">
            <p className="insight-coverage-note">
              Проверки независимы: объявлению может хватать истории для анализа
              показов, но не хватать просмотров для анализа контактов. Поэтому
              числа причин могут пересекаться.
            </p>
            <div className="insight-coverage-stats">
              <span>
                <small>Активных объявлений</small>
                <strong>{report.diagnostics.activeListings}</strong>
              </span>
              <span>
                <small>Есть конкретный вывод</small>
                <strong>{report.diagnostics.listingsWithConclusions}</strong>
              </span>
              <span>
                <small>Стабильно слабых</small>
                <strong>{report.diagnostics.persistentWeak}</strong>
              </span>
              <span>
                <small>Достаточно истории, отклонений не найдено</small>
                <strong>{report.diagnostics.observedWithoutIssue}</strong>
              </span>
              <span>
                <small>Пока рано оценивать</small>
                <strong>{report.diagnostics.insufficientHistory}</strong>
              </span>
            </div>
            <div className="insight-exclusions">
              <span>
                <b>{report.diagnostics.lowVolume}</b>
                мало трафика для оценки именно конверсии
              </span>
              <span>
                <b>{report.diagnostics.structuralChecks}</b>
                возможных дублей
              </span>
              <span>
                <b>{Object.keys(demandByArticle).length}</b>
                артикулов в аналитике товаров
              </span>
              <span>
                <b>{Object.values(categoryByArticle).filter(Boolean).length}</b>
                с категорией товара
              </span>
            </div>
            <details className="insight-methodology">
              <summary>
                Как принимается решение
                <ChevronDown />
              </summary>
              <div>
                <p>
                  Сначала проверяется полнота истории и объём данных. Затем
                  последние четыре отчёта сравниваются с предыдущими, с другими
                  объявлениями подразделения и, где возможно, с тем же артикулом
                  минимум в двух других подразделениях.
                </p>
                <p>
                  Длительное отсутствие результата оценивается отдельно. Ноль
                  контактов за шесть и более отчётов — уже важный факт, даже
                  если трафика ещё мало, чтобы обвинять именно конверсию.
                </p>
                <p>
                  Для конверсий учитывается неопределённость маленькой выборки.
                  После этого применяется общая защита от случайных находок,
                  возникающих из-за одновременной проверки сотен объявлений.
                </p>
                <p>
                  Даже статистически подтверждённое отличие показывается только
                  при заметном практическом эффекте: небольшие колебания не
                  становятся сигналами.
                </p>
              </div>
            </details>
          </div>
        </details>

        <section className="insight-list-panel panel">
          <div className="insight-list-toolbar">
            <div>
              <span className="eyebrow">ПОДТВЕРЖДЁННЫЕ НАБЛЮДЕНИЯ</span>
              <h2>{filtered.length} сигналов</h2>
            </div>
            <div>
              <div className="insight-view-switch" aria-label="Фильтр сигналов">
                {VIEW_FILTERS.map((item) => (
                  <button
                    key={item.value}
                    className={`view-${item.value} ${view === item.value ? 'active' : ''}`}
                    onClick={() => changeView(item.value)}
                  >
                    <span>{item.label}</span>
                    <b>{viewCounts[item.value]}</b>
                  </button>
                ))}
              </div>
              <Picker
                label="Причина сигнала"
                value={effectiveKind}
                onChange={(value) => changeKind(value as 'all' | InsightKind)}
                items={kindChoices}
              />
            </div>
          </div>
          {filtered.length ? (
            <div className="insight-list">
              {displayed.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onOpenPart={onOpenPart}
                  demandByArticle={demandByArticle}
                  categoryByArticle={categoryByArticle}
                />
              ))}
              {displayed.length < filtered.length && (
                <button
                  type="button"
                  className="insight-load-more"
                  onClick={showMore}
                >
                  Показать ещё{' '}
                  {Math.min(PAGE_SIZE, filtered.length - displayed.length)} из{' '}
                  {filtered.length - displayed.length}
                  <ArrowRight />
                </button>
              )}
            </div>
          ) : (
            <div className="insight-empty">
              <ShieldCheck />
              <h3>
                {effectiveKind === 'duplicate'
                  ? 'Возможные дубли не найдены'
                  : 'Подтверждённых сигналов нет'}
              </h3>
              <p>
                {effectiveKind === 'duplicate'
                  ? 'В выбранном подразделении нет нескольких активных объявлений с одинаковым распознанным артикулом.'
                  : 'Это не утверждение, что все объявления идеальны. Часть объявлений может не иметь достаточной истории или объёма для вывода.'}
              </p>
              {(view !== 'all' || kind !== 'all') && (
                <button type="button" onClick={resetFilters}>
                  Сбросить фильтры <ArrowRight />
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </TooltipProvider>
  );
}
