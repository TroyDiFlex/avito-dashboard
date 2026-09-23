'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ChartNoAxesCombined,
  CheckCircle2,
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
import type { AdRow, Snapshot } from '@/lib/model';

type ViewFilter = 'all' | 'attention' | 'opportunity' | 'check';

const VIEW_FILTERS: { value: ViewFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'attention', label: 'Требуют внимания' },
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
  if (insight.kind === 'reach-drop') return <TrendingDown />;
  if (insight.kind === 'view-rate-drop') return <Eye />;
  if (insight.kind === 'contact-rate-drop' || insight.kind === 'peer-gap')
    return <MessageCircle />;
  if (insight.kind === 'peer-winner') return <Sparkles />;
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

function InsightCard({
  insight,
  onOpenPart,
}: {
  insight: Insight;
  onOpenPart: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
}) {
  const url = avitoUrl(insight.listingId);
  return (
    <article className={`insight-card tone-${insight.tone}`}>
      <header className="insight-card-header">
        <span className="insight-card-icon">{insightIcon(insight)}</span>
        <div className="insight-card-heading">
          <div className="insight-card-tags">
            <span className={`insight-priority tone-${insight.tone}`}>
              {toneLabel(insight.tone)}
            </span>
            <span>{insight.branch}</span>
            {insight.article && <span>Артикул {insight.article}</span>}
          </div>
          <h3>{insight.title}</h3>
          <p>{insight.summary}</p>
        </div>
      </header>

      <div className="insight-listing-name">
        <strong>{insight.name}</strong>
        {insight.listingId && <span>№ {insight.listingId}</span>}
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
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  availableBranches: string[];
  initialBranch: string;
  onOpenPart: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
}) {
  const [scope, setScope] = useState(
    availableBranches.includes(initialBranch) ? initialBranch : 'network',
  );
  const [view, setView] = useState<ViewFilter>('all');
  const [kind, setKind] = useState<'all' | InsightKind>('all');
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
  const filtered = report.insights.filter((insight) => {
    const viewMatches =
      view === 'all' ||
      (view === 'attention' &&
        (insight.tone === 'high' || insight.tone === 'medium')) ||
      insight.tone === view;
    return viewMatches && (kind === 'all' || insight.kind === kind);
  });
  const attentionCount = report.insights.filter(
    (insight) => insight.tone === 'high' || insight.tone === 'medium',
  ).length;
  const opportunityCount = report.insights.filter(
    (insight) => insight.tone === 'opportunity',
  ).length;
  const checkCount = report.insights.filter(
    (insight) => insight.tone === 'check',
  ).length;
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
                а ноль контактов при малом числе просмотров не считается
                проблемой.
              </InfoTip>
            </p>
          </div>
          <div className="insights-scope-picker">
            <span>Подразделение</span>
            <Picker
              label="Подразделение"
              value={effectiveScope}
              onChange={setScope}
              items={scopes}
            />
          </div>
        </section>

        <section className="insight-summary-grid" aria-label="Сводка сигналов">
          <button
            className={view === 'attention' ? 'active' : ''}
            onClick={() => setView(view === 'attention' ? 'all' : 'attention')}
          >
            <AlertTriangle />
            <span>Требуют внимания</span>
            <strong>{attentionCount}</strong>
            <small>Только подтверждённые отклонения</small>
          </button>
          <button
            className={view === 'opportunity' ? 'active' : ''}
            onClick={() =>
              setView(view === 'opportunity' ? 'all' : 'opportunity')
            }
          >
            <Lightbulb />
            <span>Успешные примеры</span>
            <strong>{opportunityCount}</strong>
            <small>Не случайные лидеры с достаточным объёмом</small>
          </button>
          <button
            className={view === 'check' ? 'active' : ''}
            onClick={() => setView(view === 'check' ? 'all' : 'check')}
          >
            <Layers3 />
            <span>Проверки</span>
            <strong>{checkCount}</strong>
            <small>Факты без вывода об эффективности</small>
          </button>
          <div className="insight-summary-quiet">
            <CheckCircle2 />
            <span>
              Без подтверждённого вывода
              <InfoTip label="Почему выводов меньше, чем объявлений">
                Здесь одновременно находятся обычные объявления без заметных
                отклонений и объявления, по которым пока мало данных. Они не
                считаются ни хорошими, ни плохими.
              </InfoTip>
            </span>
            <strong>{report.diagnostics.withoutConclusion}</strong>
            <small>Это не означает, что все они работают хорошо</small>
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
              <small>Есть история от 6 отчётов</small>
              <strong>{report.diagnostics.listingsWithHistory}</strong>
            </span>
            <span>
              <small>Проверок собственной динамики</small>
              <strong>{report.diagnostics.ownRateTests}</strong>
            </span>
            <span>
              <small>Сетевых проверок</small>
              <strong>{report.diagnostics.peerTests}</strong>
            </span>
          </div>
          <div className="insight-exclusions">
            <span>
              <b>{report.diagnostics.shortHistory}</b>
              меньше 6 отчётов
            </span>
            <span>
              <b>{report.diagnostics.lowVolume}</b>
              мало показов, просмотров или контактов
            </span>
            <span>
              <b>{report.diagnostics.noComparablePeers}</b>
              недостаточно сопоставимых подразделений
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
                последние два отчёта сравниваются с предыдущими четырьмя–восемью
                или с тем же артикулом минимум в двух других подразделениях.
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
                    onClick={() => setView(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <Picker
                label="Тип сигнала"
                value={kind}
                onChange={(value) => setKind(value as 'all' | InsightKind)}
                items={KIND_CHOICES}
              />
            </div>
          </div>
          {filtered.length ? (
            <div className="insight-list">
              {filtered.map((insight) => (
                <InsightCard
                  key={insight.id}
                  insight={insight}
                  onOpenPart={onOpenPart}
                />
              ))}
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
                    setView('all');
                    setKind('all');
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
