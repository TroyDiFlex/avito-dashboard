import { demandForArticle, normalizeDemandArticle } from './demand';
import { adKey, extractArticle } from './explore';
import { aggregate, type AdRow, type Snapshot } from './model';

export type GrowthMetric =
  | 'impressions'
  | 'views'
  | 'contacts'
  | 'viewRate'
  | 'contactRate';
export const GROWTH_METRICS: { value: GrowthMetric; label: string }[] = [
  { value: 'impressions', label: 'Показы' },
  { value: 'views', label: 'Просмотры' },
  { value: 'contacts', label: 'Контакты' },
  { value: 'viewRate', label: 'Показы → просмотры, %' },
  { value: 'contactRate', label: 'Просмотры → контакты, %' },
];
export const NO_GROWTH_CATEGORY = '__none__';

export interface GrowthRange {
  min: string;
  max: string;
}
export interface GrowthMetricFilter extends GrowthRange {
  metric: GrowthMetric;
}
export interface GrowthFilters {
  scope: string;
  categories: string[] | null;
  demand: GrowthRange;
  metric: GrowthMetricFilter;
  extra: GrowthMetricFilter | null;
  search: string;
  duplicatesOnly: boolean;
}

export function defaultGrowthFilters(scope = 'network'): GrowthFilters {
  return {
    scope,
    categories: null,
    demand: { min: '', max: '' },
    metric: { metric: 'views', min: '', max: '' },
    extra: null,
    search: '',
    duplicatesOnly: false,
  };
}

export function restoreGrowthFilters(
  saved: Record<string, unknown>,
  params: URLSearchParams,
  initialBranch: string,
  branches: string[],
): GrowthFilters {
  const fallback = defaultGrowthFilters(
    branches.includes(initialBranch) ? initialBranch : 'network',
  );
  const text = (key: string, stored: unknown, otherwise = '') =>
    params.get(key) ?? (typeof stored === 'string' ? stored : otherwise);
  const metric = (value: string, otherwise: GrowthMetric) =>
    GROWTH_METRICS.some((item) => item.value === value)
      ? (value as GrowthMetric)
      : otherwise;
  const object = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const demand = object(saved.demand),
    primary = object(saved.metric),
    extra = object(saved.extra);
  let categories = saved.categories;
  if (params.has('growthCategories')) {
    try {
      categories = JSON.parse(params.get('growthCategories')!);
    } catch {
      categories = null;
    }
  } else if (categories === undefined) {
    const legacy = text('growthCategory', saved.category, 'all');
    categories =
      legacy === 'all'
        ? null
        : [legacy === 'none' ? NO_GROWTH_CATEGORY : legacy];
  }
  const scope = text('scope', saved.scope, fallback.scope);
  const extraMetric = text('growthExtraMetric', extra.metric);
  return {
    scope: scope === 'network' || branches.includes(scope) ? scope : 'network',
    categories: Array.isArray(categories)
      ? categories.filter((value): value is string => typeof value === 'string')
      : null,
    demand: {
      min: text('growthDemandMin', demand.min ?? saved.demandMin),
      max: text('growthDemandMax', demand.max ?? saved.demandMax),
    },
    metric: {
      metric: metric(text('growthMetric', primary.metric), 'views'),
      min: text('growthMetricMin', primary.min),
      max: text('growthMetricMax', primary.max),
    },
    extra: extraMetric
      ? {
          metric: metric(extraMetric, 'viewRate'),
          min: text('growthExtraMin', extra.min),
          max: text('growthExtraMax', extra.max),
        }
      : null,
    search: text('growthSearch', saved.search),
    duplicatesOnly:
      text(
        'growthMode',
        saved.duplicatesOnly === true ? 'duplicates' : 'all',
      ) === 'duplicates',
  };
}

export interface GrowthListing {
  id: string;
  name: string;
  firstSeen: string;
  lastSeen: string;
  reportCount: number;
  impressions: number | null;
  views: number | null;
  contacts: number | null;
  viewRate: number | null;
  contactRate: number | null;
  latestImpressions: number | null;
  latestViews: number | null;
  latestContacts: number | null;
}

export interface GrowthCase extends GrowthListing {
  key: string;
  generationKey: string;
  branch: string;
  article: string | null;
  category: string | null;
  demand: number | null;
  demandFound: boolean;
  currentIds: string[];
  primaryId: string;
  previousIds: string[];
  listings: GrowthListing[];
  duplicateIds: string[];
  duplicateDates: string[];
  isDuplicate: boolean;
}

export function buildGrowthCases(
  snapshot: Snapshot,
  options: {
    from: string;
    to: string;
    branches: string[];
    demandByArticle: Record<string, number | null>;
    categoryByArticle: Record<string, string | null>;
  },
): GrowthCase[] {
  const byListing = new Map<string, AdRow[]>();
  const dates = new Map<string, Set<string>>();
  snapshot.ads.forEach((row) => {
    if (!options.branches.includes(row.branch)) return;
    const key = adKey(row);
    const rows = byListing.get(key) ?? [];
    rows.push(row);
    byListing.set(key, rows);
    const branchDates = dates.get(row.branch) ?? new Set<string>();
    branchDates.add(row.end);
    dates.set(row.branch, branchDates);
  });
  const reportDates = new Map(
    [...dates].map(([branch, values]) => [
      branch,
      [...values].sort().slice(-2),
    ]),
  );
  const products = new Map<
    string,
    { branch: string; article: string | null; rows: AdRow[][] }
  >();
  byListing.forEach((unsorted) => {
    const rows = [...unsorted].sort((left, right) =>
      left.end.localeCompare(right.end),
    );
    const latest = rows.at(-1)!;
    const article = extractArticle(latest.name).value;
    const normalized = article ? normalizeDemandArticle(article) : null;
    const key = normalized
      ? `${latest.branch}:article:${normalized}`
      : `${latest.branch}:listing:${latest.id}`;
    const product = products.get(key) ?? {
      branch: latest.branch,
      article,
      rows: [],
    };
    product.rows.push(rows);
    products.set(key, product);
  });
  const cases: GrowthCase[] = [];
  products.forEach((product, key) => {
    const lastTwo = reportDates.get(product.branch)!;
    const latestDate = lastTwo.at(-1)!;
    const current = product.rows.filter(
      (rows) => rows.at(-1)!.end === latestDate,
    );
    if (!current.length) return;
    current.sort(
      (left, right) =>
        right[0].end.localeCompare(left[0].end) ||
        right
          .at(-1)!
          .id.localeCompare(left.at(-1)!.id, 'en', { numeric: true }),
    );
    const listings = current.map((rows) => {
      const latest = rows.at(-1)!;
      const selected = rows.filter(
        (row) => row.end >= options.from && row.end <= options.to,
      );
      return {
        id: latest.id,
        name: latest.name,
        firstSeen: rows[0].end,
        lastSeen: latest.end,
        reportCount: selected.length,
        impressions: aggregate(selected, 'impressions'),
        views: aggregate(selected, 'views'),
        contacts: aggregate(selected, 'contacts'),
        viewRate: aggregate(selected, 'viewRate'),
        contactRate: aggregate(selected, 'contactRate'),
        latestImpressions: latest.metrics.impressions ?? null,
        latestViews: latest.metrics.views ?? null,
        latestContacts: latest.metrics.contacts ?? null,
      } satisfies GrowthListing;
    });
    const normalized = product.article
      ? normalizeDemandArticle(product.article)
      : null;
    const persistentIds =
      lastTwo.length === 2 && normalized
        ? current
            .filter((rows) =>
              rows.some(
                (row) =>
                  row.end === lastTwo[0] &&
                  normalizeDemandArticle(
                    extractArticle(row.name).value ?? '',
                  ) === normalized,
              ),
            )
            .map((rows) => rows.at(-1)!.id)
            .sort()
        : [];
    const isDuplicate = persistentIds.length >= 2;
    const primary = listings[0];
    const demand = demandForArticle(options.demandByArticle, normalized);
    const currentIds = listings.map((listing) => listing.id).sort();
    cases.push({
      ...primary,
      key,
      generationKey: `${key}:${currentIds.join('+')}`,
      branch: product.branch,
      article: product.article,
      category: normalized
        ? (options.categoryByArticle[normalized] ?? null)
        : null,
      demand: demand.value,
      demandFound: demand.found,
      primaryId: primary.id,
      currentIds,
      previousIds: product.rows
        .filter((rows) => rows.at(-1)!.end !== latestDate)
        .map((rows) => rows.at(-1)!.id)
        .sort(),
      listings,
      duplicateIds: isDuplicate ? persistentIds : [],
      duplicateDates: isDuplicate ? lastTwo : [],
      isDuplicate,
    });
  });
  return cases;
}

export function parseGrowthBound(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value.replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function invalidGrowthRange(range: GrowthRange): boolean {
  const min = parseGrowthBound(range.min),
    max = parseGrowthBound(range.max);
  return !!(
    (range.min.trim() && min == null) ||
    (range.max.trim() && max == null) ||
    (min != null && max != null && min > max)
  );
}

export function clampGrowthRange<T extends GrowthRange>(
  range: T,
  ceiling: number,
): T {
  const clamp = (text: string) => {
    const value = parseGrowthBound(text);
    return value != null && value > ceiling ? String(ceiling) : text;
  };
  return { ...range, min: clamp(range.min), max: clamp(range.max) };
}

export function growthMetricValue(
  item: GrowthListing,
  metric: GrowthMetric,
): number | null {
  const value = item[metric];
  return value == null
    ? null
    : metric === 'viewRate' || metric === 'contactRate'
      ? Math.round(value * 10000) / 100
      : value;
}

export function growthRangeMaximum(
  cases: GrowthCase[],
  metric: GrowthMetric | 'demand',
): number {
  return cases.reduce((max, item) => {
    const value =
      metric === 'demand' ? item.demand : growthMetricValue(item, metric);
    return value != null && Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

function matchesRange(value: number | null, range: GrowthRange) {
  if (invalidGrowthRange(range)) return false;
  const min = parseGrowthBound(range.min),
    max = parseGrowthBound(range.max);
  if (min == null && max == null) return true;
  return (
    value != null &&
    Number.isFinite(value) &&
    (min == null || value >= min) &&
    (max == null || value <= max)
  );
}

export function filterGrowthCases(
  cases: GrowthCase[],
  filters: GrowthFilters,
): GrowthCase[] {
  if (filters.duplicatesOnly) return cases.filter((item) => item.isDuplicate);
  const search = filters.search.trim().toLocaleLowerCase('ru');
  return cases.filter((item) => {
    if (filters.scope !== 'network' && item.branch !== filters.scope)
      return false;
    if (
      filters.categories &&
      !filters.categories.includes(item.category ?? NO_GROWTH_CATEGORY)
    )
      return false;
    if (!matchesRange(item.demand, filters.demand)) return false;
    if (
      !matchesRange(
        growthMetricValue(item, filters.metric.metric),
        filters.metric,
      )
    )
      return false;
    if (
      filters.extra &&
      !matchesRange(
        growthMetricValue(item, filters.extra.metric),
        filters.extra,
      )
    )
      return false;
    return (
      !search ||
      `${item.article ?? ''} ${item.name} ${item.branch} ${item.currentIds.join(' ')}`
        .toLocaleLowerCase('ru')
        .includes(search)
    );
  });
}
