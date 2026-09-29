import { demandForArticle, normalizeDemandArticle } from './demand';
import { adKey, extractArticle } from './explore';
import { aggregate, type AdRow, type Snapshot } from './model';

export type GrowthSignalKind =
  | 'duplicate'
  | 'no-impressions'
  | 'no-views'
  | 'no-contacts'
  | 'low-reach';

export type GrowthCaseState = 'signal' | 'waiting' | 'clear';

export interface GrowthRules {
  minimumReports: number;
  observationReports: number;
  maximumImpressions: number;
  maximumViews: number;
  minimumViewsForContacts: number;
  maximumReachShare: number;
}

export const DEFAULT_GROWTH_RULES: GrowthRules = {
  minimumReports: 4,
  observationReports: 6,
  maximumImpressions: 0,
  maximumViews: 0,
  minimumViewsForContacts: 30,
  maximumReachShare: 0.3,
};

export const GROWTH_SIGNAL_LABELS: Record<GrowthSignalKind, string> = {
  duplicate: 'Дубли в последней выгрузке',
  'no-impressions': 'Нет показов',
  'no-views': 'Показы есть, просмотров нет',
  'no-contacts': 'Просмотры есть, контактов нет',
  'low-reach': 'Охват ниже медианы подразделения',
};

export interface GrowthSignal {
  kind: GrowthSignalKind;
  title: string;
  explanation: string;
}

interface ListingGeneration {
  key: string;
  id: string;
  branch: string;
  rows: AdRow[];
  firstSeen: string;
  lastSeen: string;
  latest: AdRow;
}

export interface GrowthCase {
  key: string;
  generationKey: string;
  branch: string;
  article: string | null;
  name: string;
  category: string | null;
  demand: number | null;
  demandFound: boolean;
  currentIds: string[];
  primaryId: string;
  firstSeen: string;
  lastSeen: string;
  reportCount: number;
  windowReportCount: number;
  previousIds: string[];
  impressions: number | null;
  views: number | null;
  contacts: number | null;
  medianImpressions: number | null;
  branchMedianImpressions: number | null;
  state: GrowthCaseState;
  signals: GrowthSignal[];
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function listingGenerations(snapshot: Snapshot, branches: string[]) {
  const groups = new Map<string, AdRow[]>();
  snapshot.ads
    .filter((row) => branches.includes(row.branch))
    .forEach((row) => {
      const key = adKey(row);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    });
  return [...groups.entries()].map(([key, unsorted]) => {
    const rows = [...unsorted].sort((left, right) =>
      left.end.localeCompare(right.end),
    );
    return {
      key,
      id: rows.at(-1)!.id,
      branch: rows.at(-1)!.branch,
      rows,
      firstSeen: rows[0].end,
      lastSeen: rows.at(-1)!.end,
      latest: rows.at(-1)!,
    } satisfies ListingGeneration;
  });
}

function articleData(
  article: string | null,
  demandByArticle: Record<string, number | null>,
  categoryByArticle: Record<string, string | null>,
) {
  const normalized = article ? normalizeDemandArticle(article) : null;
  const demand = demandForArticle(demandByArticle, normalized);
  return {
    demand: demand.value,
    demandFound: demand.found,
    category:
      normalized && Object.hasOwn(categoryByArticle, normalized)
        ? categoryByArticle[normalized]
        : null,
  };
}

function safeInteger(value: number, fallback: number, minimum = 0) {
  return Number.isFinite(value)
    ? Math.max(minimum, Math.round(value))
    : fallback;
}

export function normalizeGrowthRules(rules: GrowthRules): GrowthRules {
  const minimumReports = safeInteger(
    rules.minimumReports,
    DEFAULT_GROWTH_RULES.minimumReports,
    1,
  );
  return {
    minimumReports,
    observationReports: Math.max(
      minimumReports,
      safeInteger(
        rules.observationReports,
        DEFAULT_GROWTH_RULES.observationReports,
        1,
      ),
    ),
    maximumImpressions: safeInteger(
      rules.maximumImpressions,
      DEFAULT_GROWTH_RULES.maximumImpressions,
    ),
    maximumViews: safeInteger(
      rules.maximumViews,
      DEFAULT_GROWTH_RULES.maximumViews,
    ),
    minimumViewsForContacts: safeInteger(
      rules.minimumViewsForContacts,
      DEFAULT_GROWTH_RULES.minimumViewsForContacts,
      1,
    ),
    maximumReachShare:
      Number.isFinite(rules.maximumReachShare) &&
      rules.maximumReachShare >= 0 &&
      rules.maximumReachShare <= 1
        ? rules.maximumReachShare
        : DEFAULT_GROWTH_RULES.maximumReachShare,
  };
}

export function buildGrowthCases(
  snapshot: Snapshot,
  options: {
    from: string;
    to: string;
    branches: string[];
    demandByArticle: Record<string, number | null>;
    categoryByArticle: Record<string, string | null>;
    rules: GrowthRules;
  },
): GrowthCase[] {
  const rules = normalizeGrowthRules(options.rules);
  const generations = listingGenerations(snapshot, options.branches);
  const products = new Map<string, ListingGeneration[]>();
  generations.forEach((listing) => {
    const article = extractArticle(listing.latest.name).value;
    const key = article
      ? `${listing.branch}:article:${normalizeDemandArticle(article)}`
      : `${listing.branch}:listing:${listing.id}`;
    products.set(key, [...(products.get(key) ?? []), listing]);
  });

  const cases = [...products.entries()].map(([key, listings]) => {
    const latestDate = listings
      .map((listing) => listing.lastSeen)
      .sort()
      .at(-1)!;
    const current = listings
      .filter((listing) => listing.lastSeen === latestDate)
      .sort((left, right) => right.id.localeCompare(left.id));
    const primary = current[0];
    const article = extractArticle(primary.latest.name).value;
    const product = articleData(
      article,
      options.demandByArticle,
      options.categoryByArticle,
    );
    const selectedRows = primary.rows.filter(
      (row) => row.end >= options.from && row.end <= options.to,
    );
    const windowRows = selectedRows.slice(-rules.observationReports);
    const impressions = aggregate(windowRows, 'impressions');
    const views = aggregate(windowRows, 'views');
    const contacts = aggregate(windowRows, 'contacts');
    const medianImpressions = median(
      windowRows
        .map((row) => row.metrics.impressions)
        .filter((value): value is number => value != null),
    );
    const currentIds = current.map((listing) => listing.id).sort();
    const previousIds = listings
      .filter((listing) => !current.includes(listing))
      .sort(
        (left, right) =>
          right.lastSeen.localeCompare(left.lastSeen) ||
          right.id.localeCompare(left.id),
      )
      .map((listing) => listing.id);
    return {
      key,
      generationKey: `${key}:${currentIds.join('+')}`,
      branch: primary.branch,
      article,
      name: primary.latest.name,
      category: product.category,
      demand: product.demand,
      demandFound: product.demandFound,
      currentIds,
      primaryId: primary.id,
      firstSeen: primary.firstSeen,
      lastSeen: primary.lastSeen,
      reportCount: selectedRows.length,
      windowReportCount: windowRows.length,
      previousIds,
      impressions,
      views,
      contacts,
      medianImpressions,
      branchMedianImpressions: null,
      state: 'waiting' as GrowthCaseState,
      signals: [] as GrowthSignal[],
    };
  });

  const branchMedians = new Map<string, number>();
  const byBranch = new Map<string, GrowthCase[]>();
  cases.forEach((item) =>
    byBranch.set(item.branch, [...(byBranch.get(item.branch) ?? []), item]),
  );
  byBranch.forEach((items, branch) => {
    const value = median(
      items
        .filter((item) => item.reportCount >= rules.minimumReports)
        .map((item) => item.medianImpressions)
        .filter((item): item is number => item != null),
    );
    if (value != null) branchMedians.set(branch, value);
  });

  return cases.map((item) => {
    const branchMedianImpressions = branchMedians.get(item.branch) ?? null;
    const signals: GrowthSignal[] = [];
    if (item.currentIds.length > 1) {
      signals.push({
        kind: 'duplicate',
        title: GROWTH_SIGNAL_LABELS.duplicate,
        explanation: `${item.currentIds.length} объявления одного артикула имеют одинаковую последнюю дату: ${latestDateLabel(item.lastSeen)}.`,
      });
    } else if (item.reportCount >= rules.minimumReports) {
      if (
        item.impressions != null &&
        item.impressions <= rules.maximumImpressions
      ) {
        signals.push({
          kind: 'no-impressions',
          title: GROWTH_SIGNAL_LABELS['no-impressions'],
          explanation: `За ${item.windowReportCount} последних выгрузок текущего номера показов ${item.impressions}; порог правила — не больше ${rules.maximumImpressions}.`,
        });
      } else if (item.views != null && item.views <= rules.maximumViews) {
        signals.push({
          kind: 'no-views',
          title: GROWTH_SIGNAL_LABELS['no-views'],
          explanation: `За ${item.windowReportCount} последних выгрузок просмотров ${item.views} при ${item.impressions ?? '—'} показах; порог — не больше ${rules.maximumViews}.`,
        });
      } else if (
        item.views != null &&
        item.views >= rules.minimumViewsForContacts &&
        item.contacts === 0
      ) {
        signals.push({
          kind: 'no-contacts',
          title: GROWTH_SIGNAL_LABELS['no-contacts'],
          explanation: `Контактов 0 при ${item.views} просмотрах; правило включается от ${rules.minimumViewsForContacts} просмотров.`,
        });
      }
      if (
        item.medianImpressions != null &&
        branchMedianImpressions != null &&
        branchMedianImpressions > 0 &&
        item.medianImpressions > rules.maximumImpressions &&
        item.medianImpressions <=
          branchMedianImpressions * rules.maximumReachShare
      ) {
        signals.push({
          kind: 'low-reach',
          title: GROWTH_SIGNAL_LABELS['low-reach'],
          explanation: `Медиана текущего объявления — ${number(item.medianImpressions)} показов за выгрузку, медиана ${item.branch} — ${number(branchMedianImpressions)}; порог — ${number(rules.maximumReachShare * 100)}%.`,
        });
      }
    }
    return {
      ...item,
      branchMedianImpressions,
      signals,
      state:
        signals.length > 0
          ? 'signal'
          : item.reportCount < rules.minimumReports
            ? 'waiting'
            : 'clear',
    };
  });
}

const integerFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

function number(value: number) {
  return integerFormat.format(value);
}

function latestDateLabel(value: string) {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'UTC',
  });
}
