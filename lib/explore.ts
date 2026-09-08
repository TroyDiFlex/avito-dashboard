import {
  aggregate,
  calendar,
  validRange,
  METRICS,
  type AdRow,
  type Metric,
  type Metrics,
  type StatRow,
} from './model';

export type Grain = 'week' | 'month' | 'year';
export const GRAINS = [
  { value: 'week', label: 'По неделям' },
  { value: 'month', label: 'По месяцам' },
  { value: 'year', label: 'По годам' },
];
export const SCOPES = [
  { value: 'moscow', label: 'Москва', branches: ['И31', 'Х7'] },
  {
    value: 'spb',
    label: 'Санкт-Петербург',
    branches: ['Автово', 'Б116', 'Ворошилова'],
  },
  {
    value: 'network',
    label: 'Вся сеть',
    branches: ['И31', 'Х7', 'Автово', 'Б116', 'Ворошилова'],
  },
  ...['И31', 'Х7', 'Автово', 'Б116', 'Ворошилова', 'К20'].map((value) => ({
    value,
    label: value === 'К20' ? 'К20 · история' : value,
    branches: [value],
  })),
];
export const scopeBranches = (scope: string) =>
  SCOPES.find((s) => s.value === scope)?.branches ?? [];
export const scopeLabel = (scope: string) =>
  SCOPES.find((s) => s.value === scope)?.label ?? scope;
export const adKey = (ad: Pick<AdRow, 'branch' | 'id'>) =>
  `${ad.branch}:${ad.id}`;
export const bucket = (end: string, grain: Grain) =>
  grain === 'year'
    ? `${end.slice(0, 4)}-01-01`
    : grain === 'month'
      ? `${end.slice(0, 7)}-01`
      : end;
export function periodLabel(date: string, grain: Grain): string {
  if (grain === 'year') return date.slice(0, 4);
  return new Date(date + 'T12:00:00Z').toLocaleDateString(
    'ru-RU',
    grain === 'month'
      ? { month: 'short', year: 'numeric', timeZone: 'UTC' }
      : { day: '2-digit', month: '2-digit', timeZone: 'UTC' },
  );
}
export function bucketDates(
  from: string,
  to: string,
  grain: Grain,
  observed: string[],
): string[] {
  if (!validRange(from, to)) return [];
  if (grain === 'week') return calendar(from, to, observed);
  const dates: string[] = [];
  const d = new Date(bucket(from, grain) + 'T12:00:00Z');
  for (
    let tick = 0;
    tick < 122 && d.getTime() <= Date.parse(bucket(to, grain) + 'T12:00:00Z');
    tick++
  ) {
    dates.push(d.toISOString().slice(0, 10));
    if (grain === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
  }
  return dates;
}
export function scopeHistory(rows: StatRow[], scope: string): StatRow[] {
  const branches = scopeBranches(scope);
  const selected = rows.filter((s) => branches.includes(s.branch));
  const dates = [...new Set(selected.map((s) => s.end))].sort();
  return dates.map((end) => {
    const sameDate = selected.filter((s) => s.end === end),
      metrics: Metrics = {};
    for (const metric of Object.keys(METRICS) as Metric[]) {
      const present = branches.every((b) =>
        sameDate.some((s) => s.branch === b),
      );
      if (!present) {
        metrics[metric] = null;
        continue;
      }
      if (branches.length === 1)
        metrics[metric] = sameDate[0].metrics[metric] ?? null;
      else if (metric === 'roi') metrics[metric] = null;
      else if (METRICS[metric].kind === 'last') {
        const values = sameDate.map((s) => s.metrics[metric]);
        metrics[metric] = values.some((v) => v == null)
          ? null
          : values.reduce<number>((n, v) => n + v!, 0) /
            (['rating', 'responseTime'].includes(metric) ? values.length : 1);
      } else metrics[metric] = aggregate(sameDate, metric);
    }
    return { ...sameDate[0], branch: scope, end, metrics };
  });
}
export function timeSeries(
  rows: { end: string; metrics: Metrics }[],
  metric: Metric,
  grain: Grain,
  from: string,
  to: string,
): { date: string; value: number | null; count: number }[] {
  const selected = rows
    .filter((r) => r.end >= from && r.end <= to)
    .sort((a, b) => a.end.localeCompare(b.end));
  const groups = new Map<string, typeof selected>();
  for (const row of selected) {
    const key = bucket(row.end, grain);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return bucketDates(
    from,
    to,
    grain,
    selected.map((r) => r.end),
  ).map((date) => {
    const group = groups.get(date) ?? [];
    return { date, value: aggregate(group, metric), count: group.length };
  });
}
export function distribution(values: (number | null | undefined)[]) {
  const valid = values
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b);
  const n = valid.length;
  return {
    count: n,
    missing: values.length - n,
    mean: n ? valid.reduce((a, b) => a + b, 0) / n : null,
    median: n
      ? n % 2
        ? valid[(n - 1) / 2]
        : (valid[n / 2 - 1] + valid[n / 2]) / 2
      : null,
  };
}

export interface Article {
  value: string | null;
  origin: 'title' | 'manual' | 'missing';
  candidates: string[];
}
export function extractArticle(title: string, override?: string): Article {
  if (override !== undefined)
    return {
      value: override.trim().toUpperCase() || null,
      origin: 'manual',
      candidates: [],
    };
  // Long OEM/warehouse identifiers, not short engine families (N47, M273) or model names.
  const tokens =
    title.toUpperCase().match(/[A-ZА-Я0-9]+(?:[-.][A-ZА-Я0-9]+)*/g) ?? [];
  const candidates = tokens.filter((token) => {
    if (!/[0-9]/.test(token) || token.length < 6 || token.length > 24)
      return false;
    if (/[А-Я]/.test(token) || /^\d+\.\d+$/.test(token)) return false;
    if (/^\d+$/.test(token)) return token.length >= 7 && token.length <= 14;
    return (token.match(/\d/g) ?? []).length >= 4 && /[A-Z]/.test(token);
  });
  return {
    value: candidates[0] ?? null,
    origin: candidates.length ? 'title' : 'missing',
    candidates,
  };
}
export function searchUrl(template: string, title: string): string | null {
  if (!template.includes('{query}')) return null;
  try {
    const url = new URL(
      template.replaceAll('{query}', encodeURIComponent(title)),
    );
    if (
      url.protocol !== 'https:' ||
      !/(^|\.)avito\.ru$/.test(url.hostname) ||
      url.username ||
      url.password
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
