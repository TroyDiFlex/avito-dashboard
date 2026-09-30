import { aggregate, dateRangeLabel, type AdRow } from './model';

export const GROWTH_SIGNAL_TYPES = [
  { value: 'low-reach', label: 'Стабильно низкий охват' },
  { value: 'low-rates', label: 'Стабильно низкая конверсия' },
  { value: 'no-contacts', label: 'Долго без контактов' },
  { value: 'recent-decline', label: 'Недавнее снижение' },
  { value: 'long-decline', label: 'Длительное снижение' },
  { value: 'improvement', label: 'Улучшение показателей' },
  { value: 'stable-good', label: 'Стабильно хорошие показатели' },
] as const;
export type GrowthSignalKind = (typeof GROWTH_SIGNAL_TYPES)[number]['value'];
export interface GrowthSignal {
  kind: GrowthSignalKind;
  title: string;
  explanation: string;
  positive: boolean;
}
export const DEFAULT_SIGNAL_RULES = { reach: 20, viewRate: 1, contactRate: 3 };
export type GrowthSignalRules = typeof DEFAULT_SIGNAL_RULES;
export function restoreSignalRules(
  saved: Record<string, unknown>,
): GrowthSignalRules {
  const result = { ...DEFAULT_SIGNAL_RULES };
  for (const key of ['reach', 'viewRate', 'contactRate'] as const) {
    const value = saved[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
      result[key] = key === 'reach' ? value : Math.min(100, value);
  }
  return result;
}

type Measure = 'impressions' | 'viewRate' | 'contactRate';
const MEASURES: Measure[] = ['impressions', 'viewRate', 'contactRate'];
const LABELS = {
  impressions: 'Показы',
  viewRate: 'Доля просмотров',
  contactRate: 'Доля контактов',
};
const num = (value: number) =>
  value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const labelValue = (value: number, metric: Measure) =>
  `${num(value)}${metric === 'impressions' ? ' показов за выгрузку' : '%'}`;
const datesLabel = (rows: AdRow[]) =>
  dateRangeLabel(rows[0].end, rows.at(-1)!.end);

// Missing rows/denominators never become zeros. Rates use totals, not mean percentages.
function total(rows: AdRow[], metric: 'impressions' | 'views' | 'contacts') {
  if (
    !rows.length ||
    rows.some((row) => {
      const value = row.metrics[metric];
      return value == null || !Number.isFinite(value) || value < 0;
    })
  )
    return null;
  return aggregate(rows, metric);
}
function measure(rows: AdRow[], metric: Measure): number | null {
  if (metric === 'impressions') {
    const count = total(rows, 'impressions');
    return count == null ? null : count / rows.length;
  }
  const numerator = metric === 'viewRate' ? 'views' : 'contacts';
  const denominator = metric === 'viewRate' ? 'impressions' : 'views';
  const successes = total(rows, numerator),
    trials = total(rows, denominator);
  if (
    successes == null ||
    trials == null ||
    trials <= 0 ||
    rows.some((row) => row.metrics[numerator]! > row.metrics[denominator]!)
  )
    return null;
  return (successes / trials) * 100;
}
function enough(rows: AdRow[], metric: Measure) {
  if (metric === 'impressions') return measure(rows, metric) != null;
  return (
    (total(rows, metric === 'viewRate' ? 'impressions' : 'views') ?? 0) >=
    (metric === 'viewRate' ? 200 : 30)
  );
}
function stable(
  values: (number | null)[],
  predicate: (value: number) => boolean,
) {
  return (
    values.length >= 4 &&
    values.every((value) => value != null) &&
    values.filter((value) => value != null && predicate(value)).length >=
      Math.ceil(values.length * 0.75)
  );
}

export function buildGrowthSignals(
  rows: AdRow[],
  dates: string[],
  rules: GrowthSignalRules,
): GrowthSignal[] {
  if (rows.length < 4) return [];
  const reportDates = dates.filter((date) => date >= rows[0].end);
  if (rows.length < reportDates.length * 0.75) return [];
  const result: GrowthSignal[] = [];
  const floors = {
    impressions: rules.reach,
    viewRate: rules.viewRate,
    contactRate: rules.contactRate,
  };
  const add = (
    kind: GrowthSignalKind,
    title: string,
    explanation: string,
    positive = false,
  ) => result.push({ kind, title, explanation, positive });
  for (const metric of MEASURES) {
    const values = rows.map((row) => measure([row], metric));
    if (
      enough(rows, metric) &&
      stable(values, (value) => value < floors[metric])
    ) {
      const count = values.filter(
        (value) => value != null && value < floors[metric],
      ).length;
      add(
        metric === 'impressions' ? 'low-reach' : 'low-rates',
        metric === 'impressions'
          ? 'Стабильно низкий охват'
          : `Стабильно низкая ${metric === 'viewRate' ? 'доля просмотров' : 'доля контактов'}`,
        `${count} из ${rows.length} выгрузок (${datesLabel(rows)}) ниже порога ${labelValue(floors[metric], metric)}. За период: ${labelValue(measure(rows, metric)!, metric)}.`,
      );
    }
  }
  if (total(rows, 'contacts') === 0 && (total(rows, 'views') ?? 0) >= 30)
    add(
      'no-contacts',
      'Долго без контактов',
      `${rows.length} выгрузок (${datesLabel(rows)}): ${num(total(rows, 'views')!)} просмотров, 0 контактов.`,
    );
  const good = rows.filter((row) =>
    MEASURES.every((metric) => {
      const value = measure([row], metric);
      return value != null && value >= floors[metric];
    }),
  ).length;
  if (
    MEASURES.every((metric) => enough(rows, metric)) &&
    (total(rows, 'contacts') ?? 0) >= 4 &&
    good >= Math.ceil(rows.length * 0.75)
  )
    add(
      'stable-good',
      'Стабильно хорошие показатели',
      `${good} из ${rows.length} выгрузок (${datesLabel(rows)}) достигают всех трёх заданных порогов. За период: ${num(total(rows, 'contacts')!)} контактов.`,
      true,
    );

  const byDate = new Map(rows.map((row) => [row.end, row]));
  const window = (dates: string[]) =>
    dates
      .map((date) => byDate.get(date))
      .filter((row): row is AdRow => row != null);
  const current = window(reportDates.slice(-2));
  const previous = window(reportDates.slice(-4, -2));
  if (current.length !== 2 || previous.length !== 2) return result;
  for (const metric of MEASURES) {
    const now = measure(current, metric),
      before = measure(previous, metric);
    if (now == null || before == null || !enough(current, metric)) continue;
    const currentValues = current.map((row) => measure([row], metric));
    const enoughChange = (baseline: number, improving: boolean) => {
      if (metric === 'impressions')
        return Math.max(baseline, now) >= Math.max(20, rules.reach);
      const trials =
        total(current, metric === 'viewRate' ? 'impressions' : 'views') ?? 0;
      return (
        (trials * (improving ? now : baseline)) / 100 >=
        (metric === 'viewRate' ? 10 : 3)
      );
    };
    if (
      enough(previous, metric) &&
      now > before &&
      now >= before * 1.5 &&
      enoughChange(before, true) &&
      currentValues.every(
        (value) => value != null && value > before && value >= before * 1.5,
      )
    ) {
      add(
        'improvement',
        `${LABELS[metric]} ${metric === 'impressions' ? 'выросли' : 'выросла'}`,
        `Предыдущие две выгрузки (${datesLabel(previous)}): ${labelValue(before, metric)}; последние две (${datesLabel(current)}): ${labelValue(now, metric)}. Рост не менее 50% повторяется в обеих последних выгрузках.`,
        true,
      );
      continue;
    }
    // A historical reference must contain two consecutive, sufficiently similar reports.
    // This also detects a long decline that would disappear in the average of all past weeks.
    let baseline: AdRow[] | null = null,
      best = 0;
    let lowerBaseline: AdRow[] | null = null,
      lowest = Infinity;
    for (let index = 0; index < reportDates.length - 3; index++) {
      const pair = window(reportDates.slice(index, index + 2));
      if (pair.length !== 2 || !enough(pair, metric)) continue;
      const value = measure(pair, metric);
      if (value == null) continue;
      if (
        !pair.every((row) => {
          const weekly = measure([row], metric);
          return (
            weekly != null && weekly >= value * 0.7 && weekly <= value * 1.3
          );
        })
      )
        continue;
      if (value > best && value >= floors[metric]) {
        baseline = pair;
        best = value;
      }
      if (value < lowest) {
        lowerBaseline = pair;
        lowest = value;
      }
    }
    if (
      !baseline ||
      !enoughChange(best, false) ||
      !currentValues.every((value) => value != null && value <= best * 0.5)
    ) {
      if (
        lowerBaseline &&
        now > lowest &&
        enoughChange(lowest, true) &&
        currentValues.every(
          (value) => value != null && value > lowest && value >= lowest * 1.5,
        )
      )
        add(
          'improvement',
          `${LABELS[metric]} ${metric === 'impressions' ? 'выросли' : 'выросла'}`,
          `Прежний устойчивый уровень (${datesLabel(lowerBaseline)}): ${labelValue(lowest, metric)}; последние две выгрузки (${datesLabel(current)}): ${labelValue(now, metric)}. Улучшение не менее 50% сохраняется в обеих последних выгрузках.`,
          true,
        );
      continue;
    }
    const lasting = previous.every((row) => {
      const value = measure([row], metric);
      return value != null && value <= best * 0.5;
    });
    add(
      lasting ? 'long-decline' : 'recent-decline',
      `${LABELS[metric]}: ${lasting ? 'длительное снижение' : 'недавнее снижение'}`,
      `Прежний устойчивый уровень (${datesLabel(baseline)}): ${labelValue(best, metric)}; последние две выгрузки (${datesLabel(current)}): ${labelValue(now, metric)}. Снижение минимум на 50% в ${lasting ? 'четырёх' : 'двух'} последних выгрузках.`,
    );
  }
  return result;
}
