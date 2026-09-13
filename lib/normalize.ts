import {
  type AdRow,
  type Issue,
  type Metric,
  type Metrics,
  type Snapshot,
  type StatRow,
  number,
  ratio,
  text,
} from './model';

export interface RawBook {
  name: string;
  sheets: { name: string; rows: unknown[][] }[];
}
export interface RawPayload {
  books: RawBook[];
  exportedAt?: string;
}
const aliases: Record<string, string> = {
  боровая: 'Б116',
  б116: 'Б116',
  автово: 'Автово',
  ворошилова: 'Ворошилова',
  к20: 'К20',
  и31: 'И31',
  х7: 'Х7',
};
const branch = (v: unknown) => aliases[text(v).trim().toLowerCase()] ?? null;
const clean = (v: unknown) => text(v).trim().replace(/\s+/g, ' ').toLowerCase();
export function date(v: unknown): string | null {
  if (typeof v === 'number' && v > 30000 && v < 80000)
    return new Date(Math.round((v - 25569) * 86400000))
      .toISOString()
      .slice(0, 10);
  const s = text(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
const metricNames: Record<string, Metric> = {
  показы: 'impressions',
  просмотры: 'views',
  '% просмотр': 'viewRate',
  контакты: 'contacts',
  '% контакты': 'contactRate',
  избранное: 'favorites',
  расходы: 'spend',
  '$ просм': 'viewCost',
  'маржа зч': 'marginParts',
  'маржа зн': 'marginService',
  сумма: 'margin',
  roi: 'roi',
  рейтинг: 'rating',
  отзывов: 'reviews',
  '<5 баллов': 'lowReviews',
  'время отв': 'responseTime',
  'акт. объявл': 'active',
  'акт. объявл.': 'active',
  неопубл: 'unpublished',
  архив: 'archived',
  склад: 'stock',
};
function plausible(r: unknown[], s: number): boolean {
  const imp = number(r[s]),
    views = number(r[s + 2]),
    vr = number(r[s + 1]);
  const contacts = number(r[s + 6]),
    cr = number(r[s + 4]);
  if (
    [imp, views, contacts].some(
      (v) => v == null || v < 0 || !Number.isInteger(v),
    )
  )
    return false;
  if ([vr, cr].some((v) => v != null && v < 0)) return false;
  if (imp! > 0 && (vr == null || Math.abs(views! / imp! - vr) > 0.002))
    return false;
  return true;
}
export function parseAd(
  r: unknown[],
  hasAccount: boolean,
  source: string,
  row: number,
  sheetName: string,
): { ad?: AdRow; issue?: Issue } {
  const end = date(r[0]),
    br = hasAccount
      ? branch(r[1])
      : branch(sheetName.replace(/^Детализация\s*/i, ''));
  const id = text(r[hasAccount ? 2 : 1]).replace(/\.0$/, '');
  if (!end || !br || !/^\d+$/.test(id))
    return {
      issue: {
        severity: 'error',
        code: 'identity',
        source,
        row,
        branch: br ?? undefined,
        end: end ?? undefined,
        message: 'Не распознаны дата, подразделение или номер объявления.',
      },
    };
  const expected = hasAccount ? 15 : 14;
  const candidates = [expected, expected - 1, expected - 2].filter((s) =>
    plausible(r, s),
  );
  // Prefer the documented header layout; use a shifted profile only if it passes ratio checks.
  const s = candidates.includes(expected)
    ? expected
    : candidates.length === 1
      ? candidates[0]
      : undefined;
  if (s === undefined)
    return {
      issue: {
        severity: 'error',
        code: 'layout',
        source,
        row,
        branch: br,
        end,
        message:
          'Формат строки не прошёл проверку показателей и конверсий. Строка исключена из детализации.',
      },
    };
  const extended = [r[s + 18], r[s + 19], r[s + 20]].every(
    (v) => number(v) != null,
  );
  const metrics: Metrics = {
    impressions: number(r[s]),
    views: number(r[s + 2]),
    contacts: number(r[s + 6]),
    favorites: number(r[s + 12]),
    spend: number(r[s + (extended ? 18 : 13)]),
  };
  let issue: Issue | undefined;
  const originalContactRate = number(r[s + 4]);
  if (
    metrics.views! > 0 &&
    originalContactRate != null &&
    Math.abs(metrics.contacts! / metrics.views! - originalContactRate) > 0.002
  ) {
    issue = {
      severity: 'warning',
      code: 'contact-inconsistent',
      source,
      row,
      branch: br,
      end,
      message: `Контакты (${metrics.contacts}) не согласуются с просмотрами (${metrics.views}) и исходной конверсией (${originalContactRate}). Контакты этой строки показаны как недоступные; остальные показатели сохранены.`,
    };
    metrics.contacts = null;
  }
  metrics.viewRate = ratio(metrics.views, metrics.impressions);
  metrics.contactRate = ratio(metrics.contacts, metrics.views);
  metrics.viewCost = ratio(metrics.spend, metrics.views);
  metrics.contactCost = ratio(metrics.spend, metrics.contacts);
  const nameIdx = hasAccount ? 9 : 8;
  return {
    issue,
    ad: {
      branch: br,
      id,
      end,
      name: text(r[nameIdx]),
      category: text(r[nameIdx - 1]),
      price: number(r[nameIdx + 1]),
      metrics,
      source,
      row,
      profile: `${extended ? 'expanded' : 'classic'}:${s}`,
    },
  };
}
function parsePeriod(
  label: string,
): { sd: number; sm: number; ed: number; em: number } | null {
  const m = label
    .trim()
    .match(/^(\d{1,2})[./](\d{1,2})\s*[-–]\s*(\d{1,2})[./-](\d{1,2})\s*$/);
  if (!m) return null;
  const [sd, sm, ed, em] = m.slice(1).map(Number);
  return sd >= 1 &&
    sd <= 31 &&
    ed >= 1 &&
    ed <= 31 &&
    sm >= 1 &&
    sm <= 12 &&
    em >= 1 &&
    em <= 12
    ? { sd, sm, ed, em }
    : null;
}
const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export function normalize(
  payload: RawPayload,
  mode: 'excel' | 'google' = 'google',
): Snapshot {
  if (!Array.isArray(payload.books) || payload.books.length !== 2)
    throw new Error('Ожидаются две исходные таблицы.');
  const ads: AdRow[] = [],
    stats: StatRow[] = [],
    issues: Issue[] = [];
  let rawAdCount = 0;
  const keys = new Map<string, AdRow>();
  for (const book of payload.books) {
    if (
      !book.sheets.some((s) => clean(s.name) === 'статистика') ||
      !book.sheets.some((s) => clean(s.name).startsWith('детализация'))
    )
      throw new Error(
        `В таблице ${book.name} отсутствует Статистика или Детализация.`,
      );
    for (const sh of book.sheets.filter((s) =>
      clean(s.name).startsWith('детализация'),
    )) {
      const source = `${book.name} / ${sh.name}`;
      const hasAccount = clean(sh.rows[0]?.[1]) === 'аккаунт';
      if (clean(sh.rows[0]?.[0]) !== 'дата')
        throw new Error(`Изменилась шапка листа ${source}.`);
      sh.rows.slice(1).forEach((r, index) => {
        if (!r.some((v) => v !== null && v !== '')) return;
        rawAdCount++;
        const result = parseAd(r, hasAccount, source, index + 2, sh.name);
        if (result.issue) issues.push(result.issue);
        if (result.ad) {
          const a = result.ad;
          const key = `${a.branch}|${a.id}|${a.end}`;
          if (keys.has(key)) {
            issues.push({
              severity: 'error',
              code: 'duplicate',
              source,
              row: a.row,
              branch: a.branch,
              end: a.end,
              message:
                'Повтор объявления за один период. Обновление требует проверки.',
            });
            return;
          }
          keys.set(key, a);
          ads.push(a);
        }
      });
    }
  }
  for (const book of payload.books) {
    const sh = book.sheets.find((s) => clean(s.name) === 'статистика')!;
    const source = `${book.name} / ${sh.name}`;
    for (let ri = 0; ri < sh.rows.length; ri++) {
      const br = branch(sh.rows[ri]?.[0]);
      if (!br) continue;
      const header = sh.rows[ri];
      const periods = header
        .map((v, ci) => ({ ci, label: text(v), p: parsePeriod(text(v)) }))
        .filter((x) => x.p);
      const ownDates = ads.filter((a) => a.branch === br).map((a) => a.end);
      const endYear = Math.max(
        ...ads
          .filter((a) => a.source.startsWith(book.name + ' /'))
          .map((a) => Number(a.end.slice(0, 4))),
      );
      // Anchor yearless headers against a matching dated detail period, then follow calendar rollovers.
      const anchored = periods.map((x) => ({
        ...x,
        matches: [
          ...new Set(
            ownDates.filter(
              (d) =>
                d.slice(5) ===
                `${String(x.p!.em).padStart(2, '0')}-${String(x.p!.ed).padStart(2, '0')}`,
            ),
          ),
        ],
      }));
      let anchor = -1;
      for (let i = anchored.length - 1; i >= 0; i--)
        if (anchored[i].matches.length === 1) {
          anchor = i;
          break;
        }
      if (anchor < 0) {
        issues.push({
          severity: 'error',
          code: 'year',
          source,
          branch: br,
          message:
            'Год периодов нельзя однозначно связать с датированной детализацией.',
        });
        continue;
      }
      const years: number[] = [];
      years[anchor] = Number(anchored[anchor].matches[0].slice(0, 4));
      for (let i = anchor - 1; i >= 0; i--)
        years[i] =
          years[i + 1] - (periods[i].p!.em > periods[i + 1].p!.em ? 1 : 0);
      for (let i = anchor + 1; i < periods.length; i++)
        years[i] =
          years[i - 1] + (periods[i].p!.em < periods[i - 1].p!.em ? 1 : 0);
      issues.push({
        severity: 'warning',
        code: 'year-inferred',
        source,
        branch: br,
        message:
          'Годы заголовков восстановлены по датам детализации и переходам календарного года; старые периоды требуют подтверждения.',
      });
      for (let pi = 0; pi < periods.length; pi++) {
        const { ci, label, p } = periods[pi];
        const y = years[pi];
        if (!p || !Number.isFinite(y) || y > endYear + 1) continue;
        const metrics: Metrics = {};
        for (
          let j = ri + 1;
          j < sh.rows.length && !branch(sh.rows[j]?.[0]);
          j++
        ) {
          const m = metricNames[clean(sh.rows[j]?.[0])];
          if (m) metrics[m] = number(sh.rows[j]?.[ci]);
        }
        if (!Object.values(metrics).some((v) => v !== null)) continue;
        metrics.viewRate = ratio(metrics.views, metrics.impressions);
        metrics.contactRate = ratio(metrics.contacts, metrics.views);
        metrics.viewCost = ratio(metrics.spend, metrics.views);
        metrics.contactCost = ratio(metrics.spend, metrics.contacts);
        stats.push({
          branch: br,
          end: iso(y, p.em, p.ed),
          start: iso(p.sm > p.em ? y - 1 : y, p.sm, p.sd),
          label,
          metrics,
          source,
          row: ri + 1,
          column: ci + 1,
        });
      }
    }
  }
  const grouped = new Map<string, AdRow[]>();
  for (const a of ads) {
    const key = `${a.branch}|${a.end}`;
    const g = grouped.get(key) ?? [];
    g.push(a);
    grouped.set(key, g);
  }
  for (const stat of stats) {
    const g = grouped.get(`${stat.branch}|${stat.end}`);
    if (!g) continue;
    for (const m of ['impressions', 'views', 'contacts', 'spend'] as Metric[]) {
      const total = g.reduce((n, a) => n + (a.metrics[m] ?? 0), 0),
        expected = stat.metrics[m];
      if (
        expected != null &&
        Math.abs(total - expected) > (m === 'spend' ? 1 : 0.01)
      )
        issues.push({
          severity: 'warning',
          code: 'reconciliation',
          source: stat.source,
          branch: stat.branch,
          end: stat.end,
          message: `${m}: в статистике ${expected}, в детализации ${Math.round(total * 100) / 100}. Итоги источников показаны отдельно.`,
        });
    }
  }
  const statKeys = new Set<string>();
  for (const s of stats) {
    const key = `${s.branch}|${s.end}`;
    if (statKeys.has(key))
      issues.push({
        severity: 'error',
        code: 'duplicate-stat',
        source: s.source,
        branch: s.branch,
        end: s.end,
        message: 'Повтор периода статистики.',
      });
    statKeys.add(key);
  }
  if (!ads.length || !stats.length)
    throw new Error('Не удалось распознать статистику и детализацию.');
  return {
    version: 1,
    mode,
    updatedAt: payload.exportedAt ?? new Date().toISOString(),
    ads: ads.sort((a, b) => a.end.localeCompare(b.end)),
    stats: stats.sort((a, b) => a.end.localeCompare(b.end)),
    issues,
    sources: payload.books.map((b) => b.name),
    rawAdCount,
  };
}
