export type Metric =
  | 'impressions'
  | 'views'
  | 'viewRate'
  | 'contacts'
  | 'contactRate'
  | 'favorites'
  | 'spend'
  | 'viewCost'
  | 'contactCost'
  | 'marginParts'
  | 'marginService'
  | 'margin'
  | 'roi'
  | 'rating'
  | 'reviews'
  | 'lowReviews'
  | 'responseTime'
  | 'active'
  | 'unpublished'
  | 'archived'
  | 'stock';
export type Metrics = Partial<Record<Metric, number | null>>;
export interface StatRow {
  branch: string;
  end: string;
  start: string;
  label: string;
  metrics: Metrics;
  source: string;
  row: number;
  column: number;
}
export interface AdRow {
  branch: string;
  id: string;
  end: string;
  name: string;
  category: string;
  price: number | null;
  metrics: Metrics;
  source: string;
  row: number;
  profile: string;
}
export interface Issue {
  severity: 'warning' | 'error';
  code: string;
  source: string;
  row?: number;
  branch?: string;
  end?: string;
  message: string;
}
export interface Snapshot {
  version: 1;
  updatedAt: string;
  mode: 'excel' | 'google' | 'demo';
  stats: StatRow[];
  ads: AdRow[];
  issues: Issue[];
  sources: string[];
  rawAdCount: number;
}
export const BRANCHES = ['И31', 'Х7', 'Автово', 'Б116', 'Ворошилова', 'К20'];
export const COLORS = [
  '#fb7185',
  '#60a5fa',
  '#fbbf24',
  '#a78bfa',
  '#34d399',
  '#94a3b8',
];
export const METRICS: Record<
  Metric,
  {
    label: string;
    unit: 'count' | 'money' | 'percent' | 'decimal' | 'minutes';
    kind: 'sum' | 'last' | 'ratio';
    good: 'up' | 'down' | 'neutral';
    group: string;
  }
> = {
  impressions: {
    label: 'Показы',
    unit: 'count',
    kind: 'sum',
    good: 'up',
    group: 'Реклама',
  },
  views: {
    label: 'Просмотры',
    unit: 'count',
    kind: 'sum',
    good: 'up',
    group: 'Реклама',
  },
  viewRate: {
    label: 'Показы → просмотры',
    unit: 'percent',
    kind: 'ratio',
    good: 'up',
    group: 'Реклама',
  },
  contacts: {
    label: 'Контакты',
    unit: 'count',
    kind: 'sum',
    good: 'up',
    group: 'Реклама',
  },
  contactRate: {
    label: 'Просмотры → контакты',
    unit: 'percent',
    kind: 'ratio',
    good: 'up',
    group: 'Реклама',
  },
  favorites: {
    label: 'В избранном',
    unit: 'count',
    kind: 'sum',
    good: 'up',
    group: 'Реклама',
  },
  spend: {
    label: 'Расходы',
    unit: 'money',
    kind: 'sum',
    good: 'neutral',
    group: 'Реклама',
  },
  viewCost: {
    label: 'Стоимость просмотра',
    unit: 'money',
    kind: 'ratio',
    good: 'down',
    group: 'Реклама',
  },
  contactCost: {
    label: 'Стоимость контакта',
    unit: 'money',
    kind: 'ratio',
    good: 'down',
    group: 'Реклама',
  },
  marginParts: {
    label: 'Маржа ЗЧ',
    unit: 'money',
    kind: 'sum',
    good: 'up',
    group: 'Бизнес',
  },
  marginService: {
    label: 'Маржа ЗН',
    unit: 'money',
    kind: 'sum',
    good: 'up',
    group: 'Бизнес',
  },
  margin: {
    label: 'Сумма маржи',
    unit: 'money',
    kind: 'sum',
    good: 'up',
    group: 'Бизнес',
  },
  roi: {
    label: 'ROI из таблицы',
    unit: 'percent',
    kind: 'last',
    good: 'neutral',
    group: 'Бизнес',
  },
  rating: {
    label: 'Рейтинг',
    unit: 'decimal',
    kind: 'last',
    good: 'up',
    group: 'Репутация',
  },
  reviews: {
    label: 'Отзывы',
    unit: 'count',
    kind: 'last',
    good: 'up',
    group: 'Репутация',
  },
  lowReviews: {
    label: 'Отзывы < 5 баллов',
    unit: 'count',
    kind: 'last',
    good: 'down',
    group: 'Репутация',
  },
  responseTime: {
    label: 'Время ответа',
    unit: 'minutes',
    kind: 'last',
    good: 'down',
    group: 'Репутация',
  },
  active: {
    label: 'Активные объявления',
    unit: 'count',
    kind: 'last',
    good: 'neutral',
    group: 'Объявления и склад',
  },
  unpublished: {
    label: 'Неопубликованные',
    unit: 'count',
    kind: 'last',
    good: 'neutral',
    group: 'Объявления и склад',
  },
  archived: {
    label: 'В архиве',
    unit: 'count',
    kind: 'last',
    good: 'neutral',
    group: 'Объявления и склад',
  },
  stock: {
    label: 'Склад',
    unit: 'money',
    kind: 'last',
    good: 'neutral',
    group: 'Объявления и склад',
  },
};
export const AD_METRICS: Metric[] = [
  'impressions',
  'views',
  'contacts',
  'spend',
  'viewRate',
  'contactRate',
  'viewCost',
  'contactCost',
  'favorites',
];
export function text(value: unknown): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';
}
export function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = text(value)
    .trim()
    .replace(/[\s₽$]/g, '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?%?$/.test(s)) return null;
  return Number(s.replace('%', '')) / (s.endsWith('%') ? 100 : 1);
}
export function ratio(
  a: number | null | undefined,
  b: number | null | undefined,
): number | null {
  return a == null || b == null || b === 0 ? null : a / b;
}
export function sum(rows: Metrics[], key: Metric): number | null {
  if (!rows.length || rows.some((r) => r[key] == null)) return null;
  return rows.reduce((total, r) => total + (r[key] as number), 0);
}
export function aggregate(
  rows: { metrics: Metrics }[],
  metric: Metric,
): number | null {
  if (!rows.length) return null;
  const ms = rows.map((r) => r.metrics);
  const ratios: Partial<Record<Metric, [Metric, Metric]>> = {
    viewRate: ['views', 'impressions'],
    contactRate: ['contacts', 'views'],
    viewCost: ['spend', 'views'],
    contactCost: ['spend', 'contacts'],
  };
  if (ratios[metric]) {
    const [a, b] = ratios[metric]!;
    return ratio(sum(ms, a), sum(ms, b));
  }
  return METRICS[metric].kind === 'last'
    ? (rows.at(-1)!.metrics[metric] ?? null)
    : sum(ms, metric);
}
export function format(
  value: number | null | undefined,
  metric: Metric,
  compact = false,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const { unit } = METRICS[metric];
  const v = unit === 'percent' ? value * 100 : value;
  const text = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: unit === 'count' ? 0 : 1,
    minimumFractionDigits: unit === 'decimal' ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(v);
  return (
    text +
    (unit === 'percent'
      ? '%'
      : unit === 'money'
        ? ' ₽'
        : unit === 'minutes'
          ? ' мин'
          : '')
  );
}
export function shortDate(iso: string): string {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  });
}
export function calendar(
  start: string,
  end: string,
  observed: string[] = [],
): string[] {
  if (!start || !end || start > end) return [];
  const dates = new Set(observed.filter((d) => d >= start && d <= end));
  // Keep the user's exact period endpoints and add missing weekly ticks as gaps.
  const d = new Date(end + 'T12:00:00Z');
  while (d.toISOString().slice(0, 10) >= start) {
    dates.add(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 7);
  }
  return [...dates].sort();
}
