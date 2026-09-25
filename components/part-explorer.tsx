'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Minus,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { Chart, Picker } from '@/components/analytics-ui';
import MultiMetricChart, {
  type MultiMetricMode,
  type MultiMetricSeries,
} from '@/components/multi-metric-chart';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  readBrowserPreference,
  replaceUrlParameters,
  saveBrowserPreference,
} from '@/lib/browser-preferences';
import {
  AD_METRICS,
  BRANCH_COLORS,
  METRICS,
  aggregate,
  contactCostPriceShare,
  format,
  shortDate,
  type AdRow,
  type Metric,
  type Metrics,
  type Snapshot,
} from '@/lib/model';
import { adKey, extractArticle, recentMetricMedian } from '@/lib/explore';

const PARTS_FILTERS_KEY = 'pik-parts-filters';
const PART_AD_METRICS: Metric[] = [...AD_METRICS, 'contactPriceShare'];
const PART_METRICS: Metric[] = ['price', ...PART_AD_METRICS];
const PART_METRIC_GROUPS: { title: string; metrics: Metric[] }[] = [
  { title: 'Объявление', metrics: ['price'] },
  { title: 'Воронка и реклама', metrics: PART_AD_METRICS },
];
const DEFAULT_COMPARISON_METRICS: Metric[] = ['contacts'];
const DEFAULT_DETAIL_METRICS = PART_METRICS;
const METRIC_COLORS = [
  '#ef3340',
  '#38bdf8',
  '#22c55e',
  '#f59e0b',
  '#a78bfa',
  '#f472b6',
  '#2dd4bf',
  '#fb7185',
  '#84cc16',
  '#60a5fa',
];
const metricChoices = PART_METRICS.map((value) => ({
  value,
  label: METRICS[value].label,
}));

function isPartMetric(value: unknown): value is Metric {
  return typeof value === 'string' && PART_METRICS.includes(value as Metric);
}

function validMetrics(
  value: unknown,
  fallback: Metric[],
  limit?: number,
  allowEmpty = false,
) {
  if (!Array.isArray(value)) return fallback;
  const metrics = [
    ...new Set(value.filter((item): item is Metric => isPartMetric(item))),
  ];
  const result = limit ? metrics.slice(0, limit) : metrics;
  return result.length || allowEmpty ? result : fallback;
}

function metricsFromUrl(
  params: URLSearchParams,
  key: string,
  limit?: number,
  allowEmpty = false,
) {
  if (!params.has(key)) return null;
  const raw = params.get(key) ?? '';
  const values = raw === 'none' ? [] : raw.split(',');
  return validMetrics(values, [], limit, allowEmpty);
}

function initialPartFilters(initialScope: string, availableBranches: string[]) {
  const fallbackScope =
    initialScope === 'network' || availableBranches.includes(initialScope)
      ? initialScope
      : 'network';
  const fallback = {
    scope: fallbackScope,
    metric: 'contacts' as Metric,
    comparisonMetrics: DEFAULT_COMPARISON_METRICS,
    detailMetrics: DEFAULT_DETAIL_METRICS,
    allNormalized: false,
    detailMode: 'median' as MultiMetricMode,
  };
  if (typeof window === 'undefined') return fallback;
  const stored = readBrowserPreference(PARTS_FILTERS_KEY);
  const params = new URLSearchParams(window.location.search);
  const urlScope = params.get('partsScope');
  const urlMetric = params.get('partsMetric');
  const storedScope = typeof stored.scope === 'string' ? stored.scope : null;
  const validScope = (value: string | null) =>
    value === 'network' || availableBranches.includes(value ?? '');
  const metric = isPartMetric(urlMetric)
    ? urlMetric
    : isPartMetric(stored.metric)
      ? stored.metric
      : fallback.metric;
  const urlComparisonMetrics = metricsFromUrl(params, 'partsMetrics', 4);
  const urlDetailMetrics = metricsFromUrl(
    params,
    'partsDetailMetrics',
    undefined,
    true,
  );
  const urlDetailMode = params.get('partsMode');
  const urlNormalized = params.get('partsNormalized');
  return {
    scope: validScope(urlScope)
      ? urlScope!
      : validScope(storedScope)
        ? storedScope!
        : fallbackScope,
    metric,
    comparisonMetrics:
      urlComparisonMetrics ??
      (isPartMetric(urlMetric)
        ? [urlMetric]
        : validMetrics(stored.comparisonMetrics, [metric], 4)),
    detailMetrics:
      urlDetailMetrics ??
      validMetrics(
        stored.detailMetrics,
        DEFAULT_DETAIL_METRICS,
        undefined,
        true,
      ),
    allNormalized:
      urlNormalized === '1' ||
      (urlNormalized === null && stored.allNormalized === true),
    detailMode: (urlDetailMode === 'own' ||
    (urlDetailMode === null && stored.detailMode === 'own')
      ? 'own'
      : 'median') as MultiMetricMode,
  };
}

type Listing = {
  key: string;
  rows: AdRow[];
  latest: AdRow;
  current: boolean;
};
type Part = {
  key: string;
  article: string | null;
  name: string;
  category: string;
  listings: Listing[];
};
type Account = {
  branch: string;
  listings: Listing[];
  rows: { end: string; metrics: Metrics }[];
};

function buildParts(snapshot: Snapshot): Part[] {
  const latestByBranch = new Map<string, string>();
  snapshot.ads.forEach((row) => {
    if (row.end > (latestByBranch.get(row.branch) ?? '')) {
      latestByBranch.set(row.branch, row.end);
    }
  });
  const listingRows = new Map<string, AdRow[]>();
  snapshot.ads.forEach((row) => {
    const key = adKey(row);
    listingRows.set(key, [...(listingRows.get(key) ?? []), row]);
  });
  const parts = new Map<string, Part>();
  listingRows.forEach((unsorted, key) => {
    const rows = [...unsorted].sort((a, b) => a.end.localeCompare(b.end));
    const latest = rows.at(-1)!;
    const article = extractArticle(latest.name).value;
    const partKey = article ? `article:${article}` : `listing:${key}`;
    const current = parts.get(partKey);
    const listing = {
      key,
      rows,
      latest,
      current: latest.end === latestByBranch.get(latest.branch),
    };
    if (current) current.listings.push(listing);
    else {
      parts.set(partKey, {
        key: partKey,
        article,
        name: latest.name,
        category: latest.category,
        listings: [listing],
      });
    }
  });
  return [...parts.values()].map((part) => {
    const listings = [...part.listings].sort(
      (a, b) =>
        Number(b.current) - Number(a.current) ||
        b.latest.end.localeCompare(a.latest.end) ||
        b.latest.id.localeCompare(a.latest.id),
    );
    const representative = listings[0]?.latest;
    return {
      ...part,
      name: representative?.name ?? part.name,
      category: representative?.category ?? part.category,
      listings,
    };
  });
}

function aggregatePartRows(rows: AdRow[], metric: Metric): number | null {
  if (metric === 'contactPriceShare') {
    return contactCostPriceShare(
      aggregate(rows, 'spend'),
      aggregate(rows, 'contacts'),
      aggregatePartRows(rows, 'price'),
    );
  }
  if (metric !== 'price') return aggregate(rows, metric);
  return (
    [...rows]
      .sort(
        (a, b) =>
          a.end.localeCompare(b.end) ||
          a.row - b.row ||
          a.id.localeCompare(b.id),
      )
      .findLast((row) => row.price != null)?.price ?? null
  );
}

function accountsFor(part: Part, from: string, to: string): Account[] {
  const grouped = new Map<string, Listing[]>();
  part.listings.forEach((listing) => {
    const branch = listing.latest.branch;
    grouped.set(branch, [...(grouped.get(branch) ?? []), listing]);
  });
  return [...grouped].map(([branch, unsortedListings]) => {
    const listings = [...unsortedListings].sort(
      (a, b) =>
        Number(b.current) - Number(a.current) ||
        b.latest.end.localeCompare(a.latest.end) ||
        b.latest.id.localeCompare(a.latest.id),
    );
    const dates = [
      ...new Set(
        listings.flatMap((listing) =>
          listing.rows
            .filter((row) => row.end >= from && row.end <= to)
            .map((row) => row.end),
        ),
      ),
    ].sort();
    return {
      branch,
      listings,
      rows: dates.map((end) => {
        const rows = listings.flatMap((listing) =>
          listing.rows.filter((row) => row.end === end),
        );
        const metrics: Metrics = {};
        PART_METRICS.forEach((metric) => {
          if (metric === 'contactPriceShare') return;
          metrics[metric] =
            metric === 'price'
              ? (listings
                  .map((listing) =>
                    listing.rows.find(
                      (row) => row.end === end && row.price != null,
                    ),
                  )
                  .find((row) => row != null)?.price ?? null)
              : aggregatePartRows(rows, metric);
        });
        metrics.contactPriceShare = contactCostPriceShare(
          metrics.spend,
          metrics.contacts,
          metrics.price,
        );
        return { end, metrics };
      }),
    };
  });
}

function avitoUrl(id: string) {
  return /^\d+$/.test(id) ? `https://www.avito.ru/${id}` : '#';
}

export default function PartExplorer({
  snapshot,
  from,
  to,
  initialScope,
  availableBranches,
  initialAd,
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  initialScope: string;
  availableBranches: string[];
  initialAd?: Pick<AdRow, 'branch' | 'id'> | null;
}) {
  const allParts = useMemo(() => buildParts(snapshot), [snapshot]);
  const scopes = useMemo(
    () => [
      { value: 'network', label: 'Все подразделения' },
      ...availableBranches.map((value) => ({ value, label: value })),
    ],
    [availableBranches],
  );
  const [initial] = useState(() =>
    initialPartFilters(initialScope, availableBranches),
  );
  const [scope, setScope] = useState(initial.scope);
  const [metric, setMetric] = useState<Metric>(initial.metric);
  const [comparisonMetrics, setComparisonMetrics] = useState<Metric[]>(
    initial.comparisonMetrics,
  );
  const [detailMetrics, setDetailMetrics] = useState<Metric[]>(
    initial.detailMetrics,
  );
  const [allNormalized, setAllNormalized] = useState(initial.allNormalized);
  const [detailMode, setDetailMode] = useState<MultiMetricMode>(
    initial.detailMode,
  );
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(() =>
    initialAd
      ? (allParts.find((part) =>
          part.listings.some(
            (listing) =>
              listing.latest.branch === initialAd.branch &&
              listing.latest.id === initialAd.id,
          ),
        )?.key ?? null)
      : null,
  );
  const effectiveScope =
    scope === 'network' || availableBranches.includes(scope)
      ? scope
      : 'network';

  useEffect(() => {
    saveBrowserPreference(PARTS_FILTERS_KEY, {
      scope: effectiveScope,
      metric,
      comparisonMetrics,
      detailMetrics,
      allNormalized,
      detailMode,
    });
    replaceUrlParameters({
      partsScope: effectiveScope,
      partsMetric: metric,
      partsMetrics: comparisonMetrics.join(','),
      partsDetailMetrics: detailMetrics.length
        ? detailMetrics.join(',')
        : 'none',
      partsNormalized: allNormalized ? '1' : '0',
      partsMode: detailMode,
    });
  }, [
    allNormalized,
    comparisonMetrics,
    detailMetrics,
    detailMode,
    effectiveScope,
    metric,
  ]);

  const branches = useMemo(
    () => (effectiveScope === 'network' ? availableBranches : [effectiveScope]),
    [availableBranches, effectiveScope],
  );
  const parts = useMemo(
    () =>
      allParts
        .map((part) => {
          const listings = part.listings.filter(
            (listing) =>
              branches.includes(listing.latest.branch) &&
              listing.rows.some((row) => row.end >= from && row.end <= to),
          );
          const rows = listings.flatMap((listing) =>
            listing.rows.filter((row) => row.end >= from && row.end <= to),
          );
          return { ...part, listings, value: aggregatePartRows(rows, metric) };
        })
        .filter((part) => {
          const haystack = `${part.article ?? ''} ${part.name} ${part.listings
            .map((listing) => `${listing.latest.id} ${listing.latest.branch}`)
            .join(' ')}`.toLowerCase();
          return (
            part.listings.length > 0 &&
            haystack.includes(search.trim().toLowerCase())
          );
        })
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)),
    [allParts, branches, from, to, metric, search],
  );
  const selectedPart = selected
    ? allParts.find((part) => part.key === selected)
    : null;

  function changeComparisonMetrics(next: Metric[]) {
    setComparisonMetrics(next);
    if (next[0]) setMetric(next[0]);
  }

  if (selectedPart) {
    return (
      <PartDetail
        part={selectedPart}
        from={from}
        to={to}
        scope={effectiveScope}
        availableBranches={availableBranches}
        comparisonMetrics={comparisonMetrics}
        detailMetrics={detailMetrics}
        allNormalized={allNormalized}
        detailMode={detailMode}
        onScopeChange={setScope}
        onComparisonMetricsChange={changeComparisonMetrics}
        onDetailMetricsChange={setDetailMetrics}
        onAllNormalizedChange={setAllNormalized}
        onDetailModeChange={setDetailMode}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="ads-page">
      <section className="catalog-header">
        <div>
          <span className="eyebrow">КАТАЛОГ ОБЪЯВЛЕНИЙ</span>
          <h2>Запчасти и результаты</h2>
          <p>Один артикул — одна строка, независимо от количества аккаунтов.</p>
        </div>
        <strong>{parts.length.toLocaleString('ru-RU')} позиций</strong>
      </section>
      <section className="catalog-toolbar">
        <div className="search-input">
          <Search />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название, артикул или номер объявления"
            aria-label="Поиск объявлений"
          />
        </div>
        <Picker
          label="Подразделение"
          value={effectiveScope}
          onChange={setScope}
          items={scopes}
        />
        <Picker
          label="Показатель"
          value={metric}
          onChange={(value) => setMetric(value as Metric)}
          items={metricChoices}
        />
      </section>
      <section className="parts-table panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Запчасть</th>
                <th>Подразделения</th>
                <th>Объявления</th>
                <th>{METRICS[metric].label}</th>
                <th aria-label="Открыть карточку" />
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => {
                const accounts = [
                  ...new Set(
                    part.listings.map((listing) => listing.latest.branch),
                  ),
                ];
                return (
                  <tr key={part.key} onClick={() => setSelected(part.key)}>
                    <td>
                      <strong>{part.name}</strong>
                      <small>
                        {part.article
                          ? `Артикул ${part.article}`
                          : `№ ${part.listings[0].latest.id}`}
                      </small>
                    </td>
                    <td>
                      <div className="account-list">
                        {accounts.map((account) => (
                          <span key={account}>
                            <i style={{ background: BRANCH_COLORS[account] }} />
                            {account}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{part.listings.length}</td>
                    <td>
                      <b>{format(part.value, metric)}</b>
                    </td>
                    <td>
                      <ArrowRight />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!parts.length && <div className="empty-table">Ничего не найдено.</div>}
      </section>
    </div>
  );
}

function PartDetail({
  part,
  from,
  to,
  scope,
  availableBranches,
  comparisonMetrics,
  detailMetrics,
  allNormalized,
  detailMode,
  onScopeChange,
  onComparisonMetricsChange,
  onDetailMetricsChange,
  onAllNormalizedChange,
  onDetailModeChange,
  onBack,
}: {
  part: Part;
  from: string;
  to: string;
  scope: string;
  availableBranches: string[];
  comparisonMetrics: Metric[];
  detailMetrics: Metric[];
  allNormalized: boolean;
  detailMode: MultiMetricMode;
  onScopeChange: (scope: string) => void;
  onComparisonMetricsChange: (metrics: Metric[]) => void;
  onDetailMetricsChange: (metrics: Metric[]) => void;
  onAllNormalizedChange: (value: boolean) => void;
  onDetailModeChange: (mode: MultiMetricMode) => void;
  onBack: () => void;
}) {
  const accounts = useMemo(
    () =>
      accountsFor(part, from, to).filter((account) =>
        availableBranches.includes(account.branch),
      ),
    [availableBranches, from, part, to],
  );
  const accountBranches = accounts.map((account) => account.branch);
  const effectiveScope =
    scope === 'network' || accountBranches.includes(scope) ? scope : 'network';
  const activeAccount =
    effectiveScope === 'network'
      ? null
      : (accounts.find((account) => account.branch === effectiveScope) ?? null);
  const currentListings = part.listings.filter(
    (listing) =>
      listing.current && availableBranches.includes(listing.latest.branch),
  ).length;

  function addComparisonMetric() {
    const next = metricChoices.find(
      (item) => !comparisonMetrics.includes(item.value),
    );
    if (next && comparisonMetrics.length < 4) {
      onComparisonMetricsChange([...comparisonMetrics, next.value]);
    }
  }

  return (
    <div className="part-detail">
      <button className="back-button" onClick={onBack}>
        <ArrowLeft />
        Все запчасти
      </button>
      <section className="part-heading">
        <div>
          <span className="eyebrow">
            {part.article ? `АРТИКУЛ ${part.article}` : 'ОБЪЯВЛЕНИЕ'}
          </span>
          <h2>{part.name}</h2>
          <p>{part.category}</p>
        </div>
        <span>
          {accounts.length} подразделений · {part.listings.length} объявлений ·{' '}
          {currentListings} актуальных
        </span>
      </section>

      <section className="listing-links">
        {accounts.map((account) => (
          <article key={account.branch}>
            <header>
              <i style={{ background: BRANCH_COLORS[account.branch] }} />
              <strong>{account.branch}</strong>
            </header>
            {account.listings.map((listing) => (
              <a
                key={listing.key}
                className={listing.current ? undefined : 'stale'}
                href={avitoUrl(listing.latest.id)}
                target="_blank"
                rel="noreferrer"
                title={
                  listing.current
                    ? 'Открыть актуальное объявление'
                    : 'Объявления нет в последней выгрузке'
                }
              >
                <span>
                  Объявление № {listing.latest.id}
                  {!listing.current && <small>Нет в последней выгрузке</small>}
                </span>
                <ExternalLink />
              </a>
            ))}
          </article>
        ))}
      </section>

      <section className="comparison-controls part-comparison-controls">
        <div>
          <span className="eyebrow">ДИНАМИКА ЗАПЧАСТИ ПО НЕДЕЛЯМ</span>
          <h2>
            {effectiveScope === 'network'
              ? 'Сравнение подразделений'
              : `${effectiveScope} · показатели объявления`}
          </h2>
          <p>
            {effectiveScope === 'network'
              ? 'До четырёх показателей; каждый график сравнивает подразделения.'
              : detailMode === 'median'
                ? '100% — медиана последних 12 доступных недель. Пропуски не считаются нулями.'
                : 'Каждая линия использует собственную шкалу; сравнивайте направление и моменты изменений.'}
          </p>
        </div>
        <div className="comparison-actions">
          {effectiveScope === 'network' ? (
            <>
              <button
                className={`mode-button ${!allNormalized ? 'active' : ''}`}
                onClick={() => onAllNormalizedChange(false)}
              >
                Значения
              </button>
              <button
                className={`mode-button ${allNormalized ? 'active' : ''}`}
                onClick={() => onAllNormalizedChange(true)}
              >
                Относительно нормы
              </button>
            </>
          ) : (
            <>
              <button
                className={`mode-button ${detailMode === 'median' ? 'active' : ''}`}
                onClick={() => onDetailModeChange('median')}
              >
                Относительно нормы
              </button>
              <button
                className={`mode-button ${detailMode === 'own' ? 'active' : ''}`}
                onClick={() => onDetailModeChange('own')}
              >
                Свои шкалы
              </button>
            </>
          )}
        </div>
      </section>

      <section
        className="branch-filter comparison-scope"
        aria-label="Подразделение запчасти"
      >
        <button
          className={effectiveScope === 'network' ? 'active' : ''}
          onClick={() => onScopeChange('network')}
        >
          Все подразделения
        </button>
        {accounts.map((account) => (
          <button
            key={account.branch}
            className={effectiveScope === account.branch ? 'active' : ''}
            onClick={() => onScopeChange(account.branch)}
          >
            <i style={{ background: BRANCH_COLORS[account.branch] }} />
            {account.branch}
          </button>
        ))}
      </section>

      {effectiveScope === 'network' ? (
        <>
          <div className="comparison-charts">
            {comparisonMetrics.map((metric) => (
              <PartMetricChart
                key={metric}
                metric={metric}
                accounts={accounts}
                to={to}
                normalized={allNormalized}
                removable={comparisonMetrics.length > 1}
                onRemove={() =>
                  onComparisonMetricsChange(
                    comparisonMetrics.filter((value) => value !== metric),
                  )
                }
                onChange={(value) => {
                  const nextMetric = value as Metric;
                  const currentIndex = comparisonMetrics.indexOf(metric);
                  const nextIndex = comparisonMetrics.indexOf(nextMetric);
                  if (currentIndex < 0 || currentIndex === nextIndex) return;
                  const next = [...comparisonMetrics];
                  next[currentIndex] = nextMetric;
                  if (nextIndex >= 0) next[nextIndex] = metric;
                  onComparisonMetricsChange(next);
                }}
              />
            ))}
          </div>
          {comparisonMetrics.length < 4 && (
            <div className="add-chart">
              <Button variant="outline" onClick={addComparisonMetric}>
                <Plus />
                Добавить график
              </Button>
              <span>До четырёх показателей одновременно</span>
            </div>
          )}
        </>
      ) : activeAccount ? (
        <PartBranchMetrics
          account={activeAccount}
          to={to}
          metrics={detailMetrics}
          mode={detailMode}
          onMetricsChange={onDetailMetricsChange}
        />
      ) : (
        <div className="empty-chart">
          У подразделения нет данных по запчасти.
        </div>
      )}

      <section className="account-cards">
        {accounts.map((account) => {
          const latest = account.rows.at(-1);
          return (
            <article key={account.branch}>
              <header>
                <i style={{ background: BRANCH_COLORS[account.branch] }} />
                <h3>{account.branch}</h3>
                <span>{latest ? shortDate(latest.end) : '—'}</span>
              </header>
              <div>
                {(['price', 'views', 'contacts', 'spend'] as Metric[]).map(
                  (item) => (
                    <span key={item}>
                      <small>{METRICS[item].label}</small>
                      <strong>{format(latest?.metrics[item], item)}</strong>
                    </span>
                  ),
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function PartMetricChart({
  metric,
  accounts,
  to,
  normalized,
  removable,
  onRemove,
  onChange,
}: {
  metric: Metric;
  accounts: Account[];
  to: string;
  normalized: boolean;
  removable: boolean;
  onRemove: () => void;
  onChange: (value: string) => void;
}) {
  const prepared = accounts.map((account) => ({
    account,
    baseline: recentMetricMedian(account.rows, metric, to),
  }));
  const dates = [
    ...new Set(
      accounts.flatMap((account) => account.rows.map((row) => row.end)),
    ),
  ].sort();
  const data = dates.map((date) => {
    const row: Record<string, unknown> = { date };
    prepared.forEach(({ account, baseline }) => {
      const value =
        account.rows.find((item) => item.end === date)?.metrics[metric] ?? null;
      row[account.branch] =
        normalized && value != null
          ? baseline.value != null && baseline.value > 0
            ? (value / baseline.value) * 100
            : null
          : value;
    });
    return row;
  });

  return (
    <section className="comparison-chart part-chart panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {normalized ? 'НОРМА — МЕДИАНА ДО 12 НЕДЕЛЬ' : 'ВСЕ ПОДРАЗДЕЛЕНИЯ'}
          </span>
          <h2>{METRICS[metric].label}</h2>
        </div>
        <div className="chart-actions">
          <Picker
            label="Показатель графика"
            value={metric}
            onChange={onChange}
            items={metricChoices}
          />
          {removable && (
            <Button
              className="chart-remove-button"
              variant="ghost"
              onClick={onRemove}
              aria-label="Убрать график"
            >
              <X />
            </Button>
          )}
        </div>
      </div>
      <Chart
        data={data}
        series={accounts.map((account) => ({
          key: account.branch,
          label: account.branch,
          color: BRANCH_COLORS[account.branch],
        }))}
        metric={metric}
        indexed={normalized}
      />
      <div className="chart-summary">
        {prepared.map(({ account, baseline }) => {
          const value = account.rows.findLast(
            (row) => row.metrics[metric] != null,
          )?.metrics[metric];
          const index =
            value != null && baseline.value != null && baseline.value > 0
              ? (value / baseline.value) * 100
              : null;
          return (
            <span key={account.branch}>
              <i style={{ background: BRANCH_COLORS[account.branch] }} />
              {account.branch}
              <strong>{format(value, metric)}</strong>
              {normalized && (
                <small>
                  {index == null
                    ? 'нет нормы'
                    : `${index.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% нормы · ${baseline.count} нед.`}
                </small>
              )}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function PartBranchMetrics({
  account,
  to,
  metrics,
  mode,
  onMetricsChange,
}: {
  account: Account;
  to: string;
  metrics: Metric[];
  mode: MultiMetricMode;
  onMetricsChange: (metrics: Metric[]) => void;
}) {
  const data = account.rows.map((row) => ({
    date: row.end,
    ...row.metrics,
  }));
  const series = metrics.map((metric) => {
    const baseline = recentMetricMedian(account.rows, metric, to);
    return {
      metric,
      color: METRIC_COLORS[PART_METRICS.indexOf(metric) % METRIC_COLORS.length],
      median: baseline.value,
      medianCount: baseline.count,
    } satisfies MultiMetricSeries;
  });

  function toggleMetric(metric: Metric) {
    onMetricsChange(
      metrics.includes(metric)
        ? metrics.filter((value) => value !== metric)
        : PART_METRICS.filter((value) => [...metrics, metric].includes(value)),
    );
  }

  function toggleGroup(groupMetrics: Metric[]) {
    const allSelected = groupMetrics.every((metric) =>
      metrics.includes(metric),
    );
    const next = allSelected
      ? metrics.filter((metric) => !groupMetrics.includes(metric))
      : [...new Set([...metrics, ...groupMetrics])];
    onMetricsChange(PART_METRICS.filter((metric) => next.includes(metric)));
  }

  return (
    <div className="metric-workbench">
      <aside className="metric-groups panel">
        <header>
          <div>
            <span className="eyebrow">ПОКАЗАТЕЛИ</span>
            <strong>{metrics.length} выбрано</strong>
          </div>
          {metrics.length > 0 && (
            <button type="button" onClick={() => onMetricsChange([])}>
              Очистить
            </button>
          )}
        </header>
        {PART_METRIC_GROUPS.map((group) => {
          const selectedCount = group.metrics.filter((metric) =>
            metrics.includes(metric),
          ).length;
          const allSelected = selectedCount === group.metrics.length;
          const partiallySelected = selectedCount > 0 && !allSelected;
          return (
            <section className="metric-group" key={group.title}>
              <button
                type="button"
                className={`metric-group-toggle ${selectedCount ? 'selected' : ''}`}
                aria-pressed={allSelected}
                onClick={() => toggleGroup(group.metrics)}
              >
                <span className="metric-check" aria-hidden="true">
                  {allSelected ? (
                    <Check />
                  ) : partiallySelected ? (
                    <Minus />
                  ) : null}
                </span>
                <strong>{group.title}</strong>
                <small>
                  {selectedCount}/{group.metrics.length}
                </small>
              </button>
              <div className="metric-options">
                {group.metrics.map((metric) => (
                  <label key={metric}>
                    <input
                      type="checkbox"
                      checked={metrics.includes(metric)}
                      onChange={() => toggleMetric(metric)}
                    />
                    <span>{METRICS[metric].label}</span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </aside>

      <section className="metric-overlay-panel panel">
        <div className="section-heading metric-overlay-heading">
          <div>
            <span className="branch-title">
              <i style={{ background: BRANCH_COLORS[account.branch] }} />
              {account.branch}
            </span>
            <h2>
              {mode === 'median'
                ? 'Динамика относительно нормы'
                : 'Динамика на собственных шкалах'}
            </h2>
          </div>
          <p>
            {mode === 'median'
              ? '100% — медиана до 12 доступных недель'
              : 'Шкала слева относится к выделенной линии'}
          </p>
        </div>
        {metrics.length ? (
          <MultiMetricChart data={data} series={series} mode={mode} />
        ) : (
          <div className="empty-chart">Выберите хотя бы один показатель.</div>
        )}
      </section>
    </div>
  );
}
