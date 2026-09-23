import { extractArticle } from './explore';
import {
  DAY,
  aggregate,
  type AdRow,
  type Metric,
  type Snapshot,
} from './model';

export type InsightKind =
  | 'reach-drop'
  | 'view-rate-drop'
  | 'contact-rate-drop'
  | 'peer-gap'
  | 'peer-winner'
  | 'duplicate';
export type InsightTone = 'high' | 'medium' | 'opportunity' | 'check';

export const INSIGHT_KIND_LABELS: Record<InsightKind, string> = {
  'reach-drop': 'Снижение охвата',
  'view-rate-drop': 'Мало просмотров',
  'contact-rate-drop': 'Мало контактов',
  'peer-gap': 'Хуже других подразделений',
  'peer-winner': 'Успешный пример',
  duplicate: 'Возможный дубль',
};

export interface Insight {
  id: string;
  kind: InsightKind;
  tone: InsightTone;
  branch: string;
  listingId?: string;
  listingKey?: string;
  listingKeys?: string[];
  article?: string | null;
  name: string;
  category?: string;
  title: string;
  summary: string;
  current: string;
  comparison: string;
  expected?: string;
  sufficiency: string;
  method: string;
  facts: string[];
  checks: string[];
  score: number;
  probability?: number;
}

export interface InsightDiagnostics {
  activeListings: number;
  listingsWithHistory: number;
  shortHistory: number;
  lowVolume: number;
  ownRateTests: number;
  peerTests: number;
  noComparablePeers: number;
  listingsWithConclusions: number;
  withoutConclusion: number;
}

export interface InsightReport {
  insights: Insight[];
  diagnostics: InsightDiagnostics;
}

interface ListingSeries {
  key: string;
  branch: string;
  id: string;
  rows: AdRow[];
  latest: AdRow;
  article: string | null;
}

interface RateTest {
  id: string;
  listing: ListingSeries;
  kind: 'view-rate-drop' | 'contact-rate-drop';
  numerator: Metric;
  denominator: Metric;
  baselineRows: AdRow[];
  currentRows: AdRow[];
  baselineSuccesses: number;
  baselineTrials: number;
  currentSuccesses: number;
  currentTrials: number;
  baselineRate: number;
  currentRate: number;
  expected: number;
  pValue: number;
}

interface PeerTest {
  id: string;
  kind: 'peer-gap' | 'peer-winner';
  article: string;
  branch: string;
  listing: ListingSeries;
  listingKeys: string[];
  listingCount: number;
  targetSuccesses: number;
  targetTrials: number;
  peerSuccesses: number;
  peerTrials: number;
  peerBranches: number;
  targetRate: number;
  peerRate: number;
  expected: number;
  pValue: number;
  targetPrice: number | null;
  peerMedianPrice: number | null;
  rows: AdRow[];
}

interface ReachCandidate {
  listing: ListingSeries;
  baselineMedian: number;
  currentTotal: number;
  currentAverage: number;
  drop: number;
  relativeMad: number;
}

const MIN_HISTORY_REPORTS = 6;
const CURRENT_REPORTS = 2;
const BASELINE_REPORTS = 8;
const FDR_LIMIT = 0.05;

const numberFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 1,
});
const integerFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

const num = (value: number) => integerFormat.format(value);
const percent = (value: number) =>
  `${numberFormat.format(Math.max(0, value) * 100)}%`;
const money = (value: number) => `${integerFormat.format(value)} ₽`;
const probabilityLabel = (value: number) =>
  value < 0.001 ? 'меньше 0,1%' : percent(value);

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sumMetric(rows: AdRow[], metric: Metric): number | null {
  return aggregate(rows, metric);
}

function logGamma(value: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (value < 0.5)
    return (
      Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * value)) -
      logGamma(1 - value)
    );
  let x = 0.9999999999998099;
  const z = value - 1;
  coefficients.forEach((coefficient, index) => {
    x += coefficient / (z + index + 1);
  });
  const t = z + coefficients.length - 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x)
  );
}

const logBeta = (a: number, b: number) =>
  logGamma(a) + logGamma(b) - logGamma(a + b);
const logChoose = (n: number, k: number) =>
  logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * erf);
}

function betaBinomialTail(
  observed: number,
  trials: number,
  baselineSuccesses: number,
  baselineTrials: number,
  direction: 'lower' | 'upper',
): number {
  const n = Math.max(0, Math.round(trials));
  const k = Math.min(n, Math.max(0, Math.round(observed)));
  const alpha = Math.max(0, baselineSuccesses) + 0.5;
  const beta = Math.max(0, baselineTrials - baselineSuccesses) + 0.5;
  if (n > 2000) {
    const mean = (n * alpha) / (alpha + beta);
    const variance =
      (n * alpha * beta * (alpha + beta + n)) /
      ((alpha + beta) ** 2 * (alpha + beta + 1));
    if (!(variance > 0)) return 1;
    const z =
      direction === 'lower'
        ? (k + 0.5 - mean) / Math.sqrt(variance)
        : (k - 0.5 - mean) / Math.sqrt(variance);
    return direction === 'lower' ? normalCdf(z) : 1 - normalCdf(z);
  }
  const start = direction === 'lower' ? 0 : k;
  const end = direction === 'lower' ? k : n;
  const logs: number[] = [];
  for (let value = start; value <= end; value++) {
    logs.push(
      logChoose(n, value) +
        logBeta(value + alpha, n - value + beta) -
        logBeta(alpha, beta),
    );
  }
  const max = Math.max(...logs);
  if (!Number.isFinite(max)) return 0;
  const result =
    Math.exp(max) * logs.reduce((total, log) => total + Math.exp(log - max), 0);
  return Math.min(1, Math.max(0, result));
}

export function acceptedByFalseDiscoveryRate(
  probabilities: number[],
  limit = FDR_LIMIT,
): Set<number> {
  const sorted = probabilities
    .map((probability, index) => ({
      probability: Number.isFinite(probability) ? probability : 1,
      index,
    }))
    .sort((a, b) => a.probability - b.probability);
  let cutoff = -1;
  sorted.forEach((item, index) => {
    if (item.probability <= ((index + 1) / sorted.length) * limit)
      cutoff = item.probability;
  });
  return new Set(
    cutoff < 0
      ? []
      : sorted
          .filter((item) => item.probability <= cutoff)
          .map((item) => item.index),
  );
}

function listingSeries(
  snapshot: Snapshot,
  branches: string[],
  from: string,
  to: string,
) {
  const groups = new Map<string, AdRow[]>();
  snapshot.ads
    .filter(
      (row) =>
        branches.includes(row.branch) && row.end >= from && row.end <= to,
    )
    .forEach((row) => {
      const key = `${row.branch}:${row.id}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    });
  return [...groups.entries()].map(([key, unsorted]) => {
    const rows = [...unsorted].sort((a, b) => a.end.localeCompare(b.end));
    const latest = rows.at(-1)!;
    return {
      key,
      branch: latest.branch,
      id: latest.id,
      rows,
      latest,
      article: extractArticle(latest.name).value,
    } satisfies ListingSeries;
  });
}

function branchLatestDates(series: ListingSeries[]) {
  const result = new Map<string, string>();
  series.forEach((listing) => {
    const current = result.get(listing.branch);
    if (!current || listing.latest.end > current)
      result.set(listing.branch, listing.latest.end);
  });
  return result;
}

function rateTest(
  listing: ListingSeries,
  kind: RateTest['kind'],
): RateTest | null {
  if (listing.rows.length < MIN_HISTORY_REPORTS) return null;
  const currentRows = listing.rows.slice(-CURRENT_REPORTS);
  const baselineRows = listing.rows.slice(
    -CURRENT_REPORTS - BASELINE_REPORTS,
    -CURRENT_REPORTS,
  );
  if (currentRows.length < CURRENT_REPORTS || baselineRows.length < 4)
    return null;
  const numerator: Metric = kind === 'view-rate-drop' ? 'views' : 'contacts';
  const denominator: Metric =
    kind === 'view-rate-drop' ? 'impressions' : 'views';
  const baselineSuccesses = sumMetric(baselineRows, numerator);
  const baselineTrials = sumMetric(baselineRows, denominator);
  const currentSuccesses = sumMetric(currentRows, numerator);
  const currentTrials = sumMetric(currentRows, denominator);
  if (
    baselineSuccesses == null ||
    baselineTrials == null ||
    currentSuccesses == null ||
    currentTrials == null ||
    baselineTrials <= 0 ||
    currentTrials <= 0
  )
    return null;
  const minimumBaselineSuccesses = kind === 'view-rate-drop' ? 20 : 5;
  const minimumBaselineTrials = kind === 'view-rate-drop' ? 200 : 40;
  if (
    baselineSuccesses < minimumBaselineSuccesses ||
    baselineTrials < minimumBaselineTrials
  )
    return null;
  const baselineRate = baselineSuccesses / baselineTrials;
  const currentRate = currentSuccesses / currentTrials;
  const predictiveRate = (baselineSuccesses + 0.5) / (baselineTrials + 1);
  const expected = currentTrials * predictiveRate;
  const minimumExpected = kind === 'view-rate-drop' ? 10 : 3;
  if (expected < minimumExpected) return null;
  return {
    id: `${kind}:${listing.key}`,
    listing,
    kind,
    numerator,
    denominator,
    baselineRows,
    currentRows,
    baselineSuccesses,
    baselineTrials,
    currentSuccesses,
    currentTrials,
    baselineRate,
    currentRate,
    expected,
    pValue: betaBinomialTail(
      currentSuccesses,
      currentTrials,
      baselineSuccesses,
      baselineTrials,
      'lower',
    ),
  };
}

function rateInsight(test: RateTest): Insight {
  const contact = test.kind === 'contact-rate-drop';
  const spend = sumMetric(test.currentRows, 'spend');
  const rateDrop = 1 - test.currentRate / test.baselineRate;
  const facts = [
    `${contact ? 'Контакты' : 'Просмотры'}: ${num(test.currentSuccesses)} из ${num(test.currentTrials)} (${percent(test.currentRate)}).`,
    `Историческая база: ${num(test.baselineSuccesses)} из ${num(test.baselineTrials)} (${percent(test.baselineRate)}).`,
  ];
  if (contact && spend != null && spend > 0)
    facts.push(`Расходы за текущие отчёты: ${money(spend)}.`);
  return {
    id: test.id,
    kind: test.kind,
    tone: rateDrop >= 0.75 ? 'high' : 'medium',
    branch: test.listing.branch,
    listingId: test.listing.id,
    listingKey: test.listing.key,
    article: test.listing.article,
    name: test.listing.latest.name,
    category: test.listing.latest.category,
    title: contact
      ? 'Просмотры перестали переходить в контакты'
      : 'Показы перестали переходить в просмотры',
    summary: contact
      ? `Текущая конверсия ниже собственного устойчивого уровня на ${numberFormat.format(rateDrop * 100)}%.`
      : `Доля просмотров снизилась относительно собственной истории на ${numberFormat.format(rateDrop * 100)}%.`,
    current: `Сейчас: ${num(test.currentSuccesses)} из ${num(test.currentTrials)} · ${percent(test.currentRate)}`,
    comparison: `Раньше: ${num(test.baselineSuccesses)} из ${num(test.baselineTrials)} · ${percent(test.baselineRate)}`,
    expected: `При прежнем уровне ожидалось около ${numberFormat.format(test.expected)} ${contact ? 'контакта' : 'просмотра'}.`,
    sufficiency: `Использованы ${test.baselineRows.length} отчётов базы и ${test.currentRows.length} последних отчёта. Объёма достаточно, чтобы ожидать не меньше ${contact ? '3 контактов' : '10 просмотров'}.`,
    method: `Вероятность получить такое или более сильное снижение случайно — ${probabilityLabel(test.pValue)}. Сигнал также прошёл общую защиту от случайных срабатываний среди всех проверенных объявлений.`,
    facts,
    checks: contact
      ? [
          'Сравнить цену с другими подразделениями',
          'Проверить наличие и условия',
          'Проверить описание и способы связи',
        ]
      : [
          'Проверить заголовок и первое фото',
          'Сравнить цену с аналогами',
          'Проверить категорию и параметры объявления',
        ],
    score: 80 + rateDrop * 40 + Math.min(test.expected, 10),
    probability: test.pValue,
  };
}

function reachCandidate(listing: ListingSeries): ReachCandidate | null {
  if (listing.rows.length < MIN_HISTORY_REPORTS) return null;
  const current = listing.rows.slice(-CURRENT_REPORTS);
  const baseline = listing.rows.slice(
    -CURRENT_REPORTS - BASELINE_REPORTS,
    -CURRENT_REPORTS,
  );
  const baselineValues = baseline.map((row) => row.metrics.impressions);
  const currentValues = current.map((row) => row.metrics.impressions);
  if (
    baseline.length < 4 ||
    current.length < CURRENT_REPORTS ||
    baselineValues.some((value) => value == null) ||
    currentValues.some((value) => value == null)
  )
    return null;
  const cleanBaseline = baselineValues as number[];
  const cleanCurrent = currentValues as number[];
  const baselineMedian = median(cleanBaseline);
  if (baselineMedian == null || baselineMedian < 100) return null;
  const mad = median(
    cleanBaseline.map((value) => Math.abs(value - baselineMedian)),
  );
  const relativeMad = (mad ?? 0) / baselineMedian;
  const currentAverage =
    cleanCurrent.reduce((total, value) => total + value, 0) /
    cleanCurrent.length;
  const drop = 1 - currentAverage / baselineMedian;
  if (
    relativeMad > 0.45 ||
    drop < 0.5 ||
    cleanCurrent.some((value) => value > baselineMedian * 0.7)
  )
    return null;
  return {
    listing,
    baselineMedian,
    currentTotal: cleanCurrent.reduce((total, value) => total + value, 0),
    currentAverage,
    drop,
    relativeMad,
  };
}

function reachInsight(candidate: ReachCandidate): Insight {
  return {
    id: `reach-drop:${candidate.listing.key}`,
    kind: 'reach-drop',
    tone: candidate.drop >= 0.7 ? 'high' : 'medium',
    branch: candidate.listing.branch,
    listingId: candidate.listing.id,
    listingKey: candidate.listing.key,
    article: candidate.listing.article,
    name: candidate.listing.latest.name,
    category: candidate.listing.latest.category,
    title: 'Объявление потеряло охват',
    summary: `Показы снизились на ${numberFormat.format(candidate.drop * 100)}% и остаются низкими два отчёта подряд.`,
    current: `Сейчас: ${num(candidate.currentTotal)} показов за 2 отчёта`,
    comparison: `Раньше: медиана ${num(candidate.baselineMedian)} показов за отчёт`,
    sufficiency: `История содержит не меньше 4 базовых и 2 текущих отчётов. База была достаточно стабильной: типичное отклонение ${percent(candidate.relativeMad)}.`,
    method:
      'Для охвата не предполагается идеальное случайное распределение. Сигнал требует сильного падения, стабильной базы и двух последовательных слабых отчётов.',
    facts: [
      `Среднее за последние два отчёта: ${num(candidate.currentAverage)} показов.`,
      `Обычный уровень: ${num(candidate.baselineMedian)} показов за отчёт.`,
    ],
    checks: [
      'Проверить публикацию и ограничения',
      'Проверить продвижение',
      'Сравнить спрос по этому артикулу в сети',
    ],
    score: 70 + candidate.drop * 40,
  };
}

function latestPrice(listings: ListingSeries[]): number | null {
  const prices = listings
    .map((listing) => listing.latest.price)
    .filter((value): value is number => value != null && value > 0);
  return median(prices);
}

function peerTests(
  series: ListingSeries[],
  targetBranches: string[],
  from: string,
  to: string,
) {
  const parts = new Map<string, Map<string, ListingSeries[]>>();
  series.forEach((listing) => {
    if (!listing.article) return;
    const branches =
      parts.get(listing.article) ?? new Map<string, ListingSeries[]>();
    branches.set(listing.branch, [
      ...(branches.get(listing.branch) ?? []),
      listing,
    ]);
    parts.set(listing.article, branches);
  });
  const maxDate = series
    .map((listing) => listing.latest.end)
    .sort()
    .at(-1);
  if (!maxDate) return { tests: [] as PeerTest[], noPeers: 0 };
  const recentStart = new Date(
    Math.max(
      Date.parse(`${from}T12:00:00Z`),
      Date.parse(`${maxDate}T12:00:00Z`) - 27 * DAY,
    ),
  )
    .toISOString()
    .slice(0, 10);
  const tests: PeerTest[] = [];
  let noPeers = 0;
  parts.forEach((branchMap, article) => {
    targetBranches.forEach((branch) => {
      const targetListings = branchMap.get(branch);
      if (!targetListings) return;
      const rowsFor = (listings: ListingSeries[]) =>
        listings.flatMap((listing) =>
          listing.rows.filter((row) => row.end >= recentStart && row.end <= to),
        );
      const targetRows = rowsFor(targetListings);
      const targetCoverage = new Set(targetRows.map((row) => row.end)).size;
      const peerEntries = [...branchMap.entries()]
        .filter(([peer]) => peer !== branch)
        .map(([peer, listings]) => ({
          peer,
          listings,
          rows: rowsFor(listings),
        }))
        .filter((entry) => new Set(entry.rows.map((row) => row.end)).size >= 3);
      if (targetCoverage < 3 || peerEntries.length < 2) {
        noPeers++;
        return;
      }
      const peerRows = peerEntries.flatMap((entry) => entry.rows);
      const targetSuccesses = sumMetric(targetRows, 'contacts');
      const targetTrials = sumMetric(targetRows, 'views');
      const peerSuccesses = sumMetric(peerRows, 'contacts');
      const peerTrials = sumMetric(peerRows, 'views');
      if (
        targetSuccesses == null ||
        targetTrials == null ||
        peerSuccesses == null ||
        peerTrials == null ||
        targetTrials <= 0 ||
        peerSuccesses < 5 ||
        peerTrials < 30
      ) {
        noPeers++;
        return;
      }
      const peerRate = peerSuccesses / peerTrials;
      const targetRate = targetSuccesses / targetTrials;
      const expected =
        targetTrials * ((peerSuccesses + 0.5) / (peerTrials + 1));
      if (expected < 3) {
        noPeers++;
        return;
      }
      const representative = [...targetListings].sort(
        (a, b) => b.rows.length - a.rows.length,
      )[0];
      const peerPrices = peerEntries
        .map((entry) => latestPrice(entry.listings))
        .filter((value): value is number => value != null);
      const common = {
        article,
        branch,
        listing: representative,
        listingKeys: targetListings.map((listing) => listing.key),
        listingCount: targetListings.length,
        targetSuccesses,
        targetTrials,
        peerSuccesses,
        peerTrials,
        peerBranches: peerEntries.length,
        targetRate,
        peerRate,
        expected,
        targetPrice: latestPrice(targetListings),
        peerMedianPrice: median(peerPrices),
        rows: targetRows,
      };
      tests.push({
        ...common,
        id: `peer-gap:${branch}:${article}`,
        kind: 'peer-gap',
        pValue: betaBinomialTail(
          targetSuccesses,
          targetTrials,
          peerSuccesses,
          peerTrials,
          'lower',
        ),
      });
      if (targetSuccesses >= 5)
        tests.push({
          ...common,
          id: `peer-winner:${branch}:${article}`,
          kind: 'peer-winner',
          pValue: betaBinomialTail(
            targetSuccesses,
            targetTrials,
            peerSuccesses,
            peerTrials,
            'upper',
          ),
        });
    });
  });
  return { tests, noPeers };
}

function peerInsight(test: PeerTest): Insight {
  const winner = test.kind === 'peer-winner';
  const rateDifference = winner
    ? test.targetRate / test.peerRate - 1
    : 1 - test.targetRate / test.peerRate;
  const facts = [
    `${test.branch}: ${num(test.targetSuccesses)} контактов на ${num(test.targetTrials)} просмотров (${percent(test.targetRate)}).`,
    `${test.peerBranches} других подразделения: ${num(test.peerSuccesses)} контактов на ${num(test.peerTrials)} просмотров (${percent(test.peerRate)}).`,
  ];
  const checks = winner
    ? [
        'Сравнить заголовок с другими подразделениями',
        'Зафиксировать цену и условия как ориентир',
      ]
    : [
        'Сравнить цену с другими подразделениями',
        'Проверить наличие и условия',
        'Сравнить содержание карточек',
      ];
  if (
    test.targetPrice != null &&
    test.peerMedianPrice != null &&
    test.peerMedianPrice > 0
  ) {
    const priceDifference = test.targetPrice / test.peerMedianPrice - 1;
    if (Math.abs(priceDifference) >= 0.15) {
      facts.push(
        `Цена ${money(test.targetPrice)} — на ${numberFormat.format(Math.abs(priceDifference) * 100)}% ${priceDifference > 0 ? 'выше' : 'ниже'} медианы других подразделений (${money(test.peerMedianPrice)}).`,
      );
      if (!winner && !checks.includes('Проверить актуальность цены'))
        checks.unshift('Проверить актуальность цены');
    }
  }
  const spend = sumMetric(test.rows, 'spend');
  if (!winner && spend != null && spend > 0)
    facts.push(`Расходы за сравниваемый период: ${money(spend)}.`);
  return {
    id: test.id,
    kind: test.kind,
    tone: winner ? 'opportunity' : rateDifference >= 0.75 ? 'high' : 'medium',
    branch: test.branch,
    listingId: test.listing.id,
    listingKey: test.listing.key,
    listingKeys: test.listingKeys,
    article: test.article,
    name: test.listing.latest.name,
    category: test.listing.latest.category,
    title: winner
      ? 'Объявление стабильно лучше аналогов'
      : 'В других подразделениях спрос подтверждён',
    summary: winner
      ? `Конверсия в контакты выше сетевого ориентира на ${numberFormat.format(rateDifference * 100)}%.`
      : `Конверсия в контакты ниже других подразделений на ${numberFormat.format(rateDifference * 100)}%.`,
    current: `${test.branch}: ${num(test.targetSuccesses)} из ${num(test.targetTrials)} · ${percent(test.targetRate)}`,
    comparison: `Другие подразделения: ${num(test.peerSuccesses)} из ${num(test.peerTrials)} · ${percent(test.peerRate)}`,
    expected: winner
      ? undefined
      : `При сетевом уровне ожидалось около ${numberFormat.format(test.expected)} контакта.`,
    sufficiency: `Сравниваются ${test.peerBranches} других подразделения, в каждом есть не меньше 3 отчётов. У них накоплено ${num(test.peerSuccesses)} контактов, а здесь объёма хватает минимум для 3 ожидаемых контактов.`,
    method: `Вероятность получить такое или более сильное отличие случайно — ${probabilityLabel(test.pValue)}. Сигнал прошёл общую защиту от случайных находок.`,
    facts,
    checks,
    score:
      (winner ? 45 : 85) + rateDifference * 35 + Math.min(test.expected, 10),
    probability: test.pValue,
  };
}

function duplicateInsights(
  series: ListingSeries[],
  targetBranches: string[],
  latestDates: Map<string, string>,
): Insight[] {
  const groups = new Map<string, ListingSeries[]>();
  series.forEach((listing) => {
    if (
      !targetBranches.includes(listing.branch) ||
      !listing.article ||
      listing.latest.end !== latestDates.get(listing.branch)
    )
      return;
    const key = `${listing.branch}:${listing.article}`;
    groups.set(key, [...(groups.get(key) ?? []), listing]);
  });
  return [...groups.entries()]
    .filter(([, listings]) => listings.length >= 2)
    .map(([key, listings]) => {
      const representative = listings[0];
      return {
        id: `duplicate:${key}`,
        kind: 'duplicate',
        tone: 'check',
        branch: representative.branch,
        listingId: representative.id,
        listingKey: representative.key,
        listingKeys: listings.map((listing) => listing.key),
        article: representative.article,
        name: representative.latest.name,
        category: representative.latest.category,
        title: 'Несколько активных объявлений одного артикула',
        summary: `Найдено ${listings.length} объявления с артикулом ${representative.article}. Это не ошибка, но стоит проверить, не разделяют ли они один спрос.`,
        current: `${listings.length} объявления · номера ${listings.map((listing) => listing.id).join(', ')}`,
        comparison: 'Вывод об эффективности не делается',
        sufficiency:
          'Совпадение основано на подразделении, артикуле и наличии объявлений в последнем отчёте.',
        method:
          'Это структурная проверка, а не статистический вывод. Она не утверждает, что дубли ухудшают результат.',
        facts: listings.map(
          (listing) => `№ ${listing.id}: ${listing.latest.name}`,
        ),
        checks: [
          'Проверить назначение каждого объявления',
          'Сравнить цены и условия',
          'Убедиться, что объявления не дублируют друг друга полностью',
        ],
        score: 20 + listings.length,
      } satisfies Insight;
    });
}

export function buildInsightReport(
  snapshot: Snapshot,
  options: {
    from: string;
    to: string;
    availableBranches: string[];
    scope: string;
  },
): InsightReport {
  const { from, to, availableBranches, scope } = options;
  const targetBranches =
    scope === 'network'
      ? availableBranches
      : [scope].filter((branch) => availableBranches.includes(branch));
  const series = listingSeries(snapshot, availableBranches, from, to);
  const latestDates = branchLatestDates(series);
  const activeTargets = series.filter(
    (listing) =>
      targetBranches.includes(listing.branch) &&
      listing.latest.end === latestDates.get(listing.branch),
  );
  const shortHistory = activeTargets.filter(
    (listing) => listing.rows.length < MIN_HISTORY_REPORTS,
  ).length;
  const historyReady = activeTargets.length - shortHistory;
  const viewTests = activeTargets
    .map((listing) => rateTest(listing, 'view-rate-drop'))
    .filter((test): test is RateTest => Boolean(test));
  const contactTests = activeTargets
    .map((listing) => rateTest(listing, 'contact-rate-drop'))
    .filter((test): test is RateTest => Boolean(test));
  const rateTests = [...viewTests, ...contactTests];
  const lowVolume = activeTargets.filter(
    (listing) =>
      listing.rows.length >= MIN_HISTORY_REPORTS &&
      !viewTests.some((test) => test.listing.key === listing.key) &&
      !contactTests.some((test) => test.listing.key === listing.key),
  ).length;
  const rateInsights: Insight[] = [];
  for (const tests of [viewTests, contactTests]) {
    const accepted = acceptedByFalseDiscoveryRate(
      tests.map((test) => test.pValue),
    );
    tests.forEach((test, index) => {
      const maximumRatio = test.kind === 'view-rate-drop' ? 0.6 : 0.5;
      if (
        accepted.has(index) &&
        test.currentRate <= test.baselineRate * maximumRatio
      )
        rateInsights.push(rateInsight(test));
    });
  }
  const reachCandidates = activeTargets
    .map(reachCandidate)
    .filter((candidate): candidate is ReachCandidate => Boolean(candidate));
  const reachEligibility = new Map<string, number>();
  activeTargets.forEach((listing) => {
    if (listing.rows.length >= MIN_HISTORY_REPORTS)
      reachEligibility.set(
        listing.branch,
        (reachEligibility.get(listing.branch) ?? 0) + 1,
      );
  });
  const systemicBranches = new Set<string>();
  const systemicInsights: Insight[] = [];
  targetBranches.forEach((branch) => {
    const affected = reachCandidates.filter(
      (candidate) => candidate.listing.branch === branch,
    );
    const eligible = reachEligibility.get(branch) ?? 0;
    if (
      affected.length >= 8 &&
      eligible > 0 &&
      affected.length / eligible >= 0.3
    ) {
      systemicBranches.add(branch);
      systemicInsights.push({
        id: `reach-drop:${branch}:systemic`,
        kind: 'reach-drop',
        tone: 'high',
        branch,
        name: branch,
        listingKeys: affected.map((candidate) => candidate.listing.key),
        title: 'Массовое снижение показов в подразделении',
        summary: `${affected.length} из ${eligible} объявлений с достаточной историей одновременно потеряли не меньше половины обычного охвата.`,
        current: `${affected.length} объявлений со снижением`,
        comparison: `${num((affected.length / eligible) * 100)}% проверяемых объявлений`,
        sufficiency:
          'Каждое объявление имеет стабильную базу и два последовательных слабых отчёта. Массовость проверяется только среди объявлений с достаточной историей.',
        method:
          'Отдельные карточки этого снижения скрыты, чтобы не выдавать вероятную общую проблему подразделения за множество независимых проблем объявлений.',
        facts: affected
          .sort((a, b) => b.drop - a.drop)
          .slice(0, 5)
          .map(
            (candidate) =>
              `${candidate.listing.latest.name}: −${numberFormat.format(candidate.drop * 100)}%.`,
          ),
        checks: [
          'Проверить ограничения аккаунта',
          'Проверить продвижение и бюджет',
          'Проверить полноту последней выгрузки',
        ],
        score: 140 + affected.length,
      });
    }
  });
  const reachInsights = reachCandidates
    .filter((candidate) => !systemicBranches.has(candidate.listing.branch))
    .map(reachInsight);
  const peerResult = peerTests(series, targetBranches, from, to);
  const peerInsights: Insight[] = [];
  for (const kind of ['peer-gap', 'peer-winner'] as const) {
    const tests = peerResult.tests.filter((test) => test.kind === kind);
    const accepted = acceptedByFalseDiscoveryRate(
      tests.map((test) => test.pValue),
    );
    tests.forEach((test, index) => {
      const meaningful =
        kind === 'peer-gap'
          ? test.targetRate <= test.peerRate * 0.5
          : test.targetRate >= test.peerRate * 1.5 &&
            test.targetRate - test.peerRate >= 0.03;
      if (accepted.has(index) && meaningful)
        peerInsights.push(peerInsight(test));
    });
  }
  const duplicates = duplicateInsights(series, targetBranches, latestDates);
  const insights = [
    ...systemicInsights,
    ...rateInsights,
    ...reachInsights,
    ...peerInsights,
    ...duplicates,
  ].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'ru'));
  const concludedKeys = new Set(
    insights.flatMap((insight) =>
      insight.listingKeys?.length
        ? insight.listingKeys
        : insight.listingKey
          ? [insight.listingKey]
          : [],
    ),
  );
  return {
    insights,
    diagnostics: {
      activeListings: activeTargets.length,
      listingsWithHistory: historyReady,
      shortHistory,
      lowVolume,
      ownRateTests: rateTests.length,
      peerTests: peerResult.tests.length,
      noComparablePeers: peerResult.noPeers,
      listingsWithConclusions: concludedKeys.size,
      withoutConclusion: Math.max(0, activeTargets.length - concludedKeys.size),
    },
  };
}
