'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  ExternalLink,
  Eye,
  Layers3,
  Lightbulb,
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
import { demandForArticle, normalizeDemandArticle } from '@/lib/demand';
import { extractArticle } from '@/lib/explore';
import type { AdRow, Snapshot } from '@/lib/model';

type ViewFilter =
  | 'all'
  | 'recent'
  | 'persistent'
  | 'demand'
  | 'opportunity'
  | 'check';

const RECENT_KINDS = new Set<InsightKind>([
  'reach-drop',
  'view-rate-drop',
  'contact-rate-drop',
  'portfolio-view-gap',
  'portfolio-contact-gap',
  'peer-gap',
]);
const PERSISTENT_KINDS = new Set<InsightKind>([
  'persistent-low-reach',
  'persistent-no-result',
]);
const PAGE_SIZE = 60;

const VIEW_FILTERS: { value: ViewFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'recent', label: 'Просели или отстают' },
  { value: 'persistent', label: 'Стабильно слабые' },
  { value: 'demand', label: 'Есть данные спроса' },
  { value: 'opportunity', label: 'Успешные примеры' },
  { value: 'check', label: 'Проверки' },
];

const KIND_CHOICES: { value: 'all' | InsightKind; label: string }[] = [
  { value: 'all', label: 'Все типы сигналов' },
  ...Object.entries(INSIGHT_KIND_LABELS).map(([value, label]) => ({
    value: value as InsightKind,
    label,
  })),
];

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
  if (insight.kind === 'reach-drop' || insight.kind === 'persistent-low-reach')
    return <TrendingDown />;
  if (
    insight.kind === 'view-rate-drop' ||
    insight.kind === 'portfolio-view-gap'
  )
    return <Eye />;
  if (
    insight.kind === 'contact-rate-drop' ||
    insight.kind === 'portfolio-contact-gap' ||
    insight.kind === 'persistent-no-result' ||
    insight.kind === 'peer-gap'
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
  return 'Проверка';
}

function avitoUrl(id?: string) {
  return id && /^\d+$/.test(id) ? `https://www.avito.ru/${id}` : null;
}

function demandForInsight(
  values: Record<string, number | null>,
  insight: Insight,
) {
  const candidates = [
    insight.article,
    ...extractArticle(insight.name).candidates,
  ].filter((value): value is string => Boolean(value));
  for (const article of candidates) {
    const demand = demandForArticle(values, article);
    if (demand.found)
      return { ...demand, article: normalizeDemandArticle(article) };
  }
  return { found: false, value: null, article: insight.article };
}

function InsightCard({
  insight,
  onOpenPart,
  demandByArticle,
}: {
  insight: Insight;
  onOpenPart: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
  demandByArticle: Record<string, number | null>;
}) {
  const url = avitoUrl(insight.listingId);
  const demand = demandForInsight(demandByArticle, insight);
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
              <span className="insight-demand">
                Спрос{' '}
                {demand.value == null
                  ? '—'
                  : demand.value.toLocaleString('ru-RU')}
              </span>
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
          {insight.listingId && (
            <span className="insight-listing-id">№ {insight.listingId}</span>
          )}
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

      <div className="insight-evidence">
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
      </div>

      <details className="insight-proof">
        <summary>
          <ShieldCheck />
          Почему данных достаточно
          <ChevronDown />
        </summary>
        <div>
          <p>{insight.sufficiency}</p>
          <p>{insight.method}</p>
          {!!insight.facts.length && (
            <ul>
              {insight.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <footer className="insight-card-footer">
        <div className="insight-checks">
          <small>Что проверить</small>
          <div>
            {insight.checks.map((check) => (
              <span key={check}>{check}</span>
            ))}
          </div>
        </div>
      </footer>
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
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  availableBranches: string[];
  initialBranch: string;
  onOpenPart: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
  demandByArticle: Record<string, number | null>;
}) {
  const [scope, setScope] = useState(
    availableBranches.includes(initialBranch) ? initialBranch : 'network',
  );
  const [view, setView] = useState<ViewFilter>('all');
  const [kind, setKind] = useState<'all' | InsightKind>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const changeView = (next: ViewFilter) => {
    setView(next);
    setVisibleCount(PAGE_SIZE);
  };
  const changeKind = (next: 'all' | InsightKind) => {
    setKind(next);
    setVisibleCount(PAGE_SIZE);
  };
  const changeScope = (next: string) => {
    setScope(next);
    setVisibleCount(PAGE_SIZE);
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
  const filtered = report.insights
    .filter((insight) => {
      const viewMatches =
        view === 'all' ||
        (view === 'recent' && RECENT_KINDS.has(insight.kind)) ||
        (view === 'persistent' && PERSISTENT_KINDS.has(insight.kind)) ||
        (view === 'demand' &&
          demandForInsight(demandByArticle, insight).found) ||
        (view === 'opportunity' && insight.tone === 'opportunity') ||
        (view === 'check' && insight.tone === 'check');
      return viewMatches && (kind === 'all' || insight.kind === kind);
    })
    .sort((left, right) => {
      if (view !== 'demand') return 0;
      const leftDemand = demandForInsight(demandByArticle, left).value;
      const rightDemand = demandForInsight(demandByArticle, right).value;
      return (rightDemand ?? -1) - (leftDemand ?? -1);
    });
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

        <section className="insight-summary-grid" aria-label="Сводка сигналов">
          <button
            className={view === 'recent' ? 'active' : ''}
            onClick={() => changeView(view === 'recent' ? 'all' : 'recent')}
          >
            <AlertTriangle />
            <span>Просели или отстают</span>
            <strong>{report.diagnostics.recentDeclines}</strong>
            <small>Изменения динамики и проблемы воронки</small>
          </button>
          <button
            className={view === 'persistent' ? 'active' : ''}
            onClick={() =>
              changeView(view === 'persistent' ? 'all' : 'persistent')
            }
          >
            <TrendingDown />
            <span>Стабильно слабые</span>
            <strong>{report.diagnostics.persistentWeak}</strong>
            <small>Долго без контактов или почти без охвата</small>
          </button>
          <button
            className={view === 'opportunity' ? 'active' : ''}
            onClick={() =>
              changeView(view === 'opportunity' ? 'all' : 'opportunity')
            }
          >
            <Lightbulb />
            <span>Сильные примеры</span>
            <strong>{report.diagnostics.opportunities}</strong>
            <small>Лидеры с реальными контактами, не один из одного</small>
          </button>
          <div className="insight-summary-quiet">
            <ShieldCheck />
            <span>
              Пока рано оценивать
              <InfoTip label="Почему пока рано оценивать объявления">
                У этих объявлений меньше шести отчётов. Они не записываются ни в
                хорошие, ни в плохие: системе ещё не хватает длительности
                наблюдения.
              </InfoTip>
            </span>
            <strong>{report.diagnostics.insufficientHistory}</strong>
            <small>Менее шести отчётов наблюдения</small>
          </div>
        </section>

        <section className="insight-coverage panel">
          <div className="insight-coverage-heading">
            <div>
              <span className="eyebrow">ДОСТАТОЧНОСТЬ ДАННЫХ</span>
              <h2>Почему используются не все объявления</h2>
            </div>
            <InfoTip label="Как читать показатели достаточности">
              Проверки независимы: объявлению может хватать истории для анализа
              показов, но не хватать просмотров для анализа контактов. Поэтому
              числа причин могут пересекаться.
            </InfoTip>
          </div>
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
          </div>
          <div className="insight-exclusions">
            <span>
              <b>{report.diagnostics.insufficientHistory}</b>
              пока мало истории
            </span>
            <span>
              <b>{report.diagnostics.lowVolume}</b>
              мало трафика для оценки именно конверсии
            </span>
            <span>
              <b>{report.diagnostics.structuralChecks}</b>
              структурных проверок
            </span>
            <span>
              <b>{Object.keys(demandByArticle).length}</b>
              артикулов в аналитике спроса
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
                контактов за шесть и более отчётов — уже важный факт, даже если
                трафика ещё мало, чтобы обвинять именно конверсию.
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
        </section>

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
                    className={view === item.value ? 'active' : ''}
                    onClick={() => changeView(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <Picker
                label="Тип сигнала"
                value={kind}
                onChange={(value) => changeKind(value as 'all' | InsightKind)}
                items={KIND_CHOICES}
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
                />
              ))}
              {displayed.length < filtered.length && (
                <button
                  type="button"
                  className="insight-load-more"
                  onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
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
              <h3>Подтверждённых сигналов нет</h3>
              <p>
                Это не утверждение, что все объявления идеальны. Часть
                объявлений может не иметь достаточной истории или объёма для
                вывода.
              </p>
              {(view !== 'all' || kind !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    changeView('all');
                    changeKind('all');
                  }}
                >
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
