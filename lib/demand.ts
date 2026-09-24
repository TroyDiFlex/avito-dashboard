export const DEFAULT_DEMAND_TEXT = `03L115389HVRN\t66
11428596283VRN\t569
A7252703114VRN\t35
1113761512VRN\t
A6511801310VRN\t92
11428488578VRN\t57
LR113200VRN\t55
06F115397HVRN\t33
11428683206VRN\t45
11428580415VRN\t30
11428649177VRN\t65`;

export interface DemandAnalysis {
  values: Record<string, number | null>;
  recognized: number;
  withValue: number;
  withoutValue: number;
  invalid: number;
}

export function normalizeDemandArticle(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '').replace(/VRN$/, '');
}

export function parseDemandAnalysis(text: string): DemandAnalysis {
  const values: Record<string, number | null> = {};
  let invalid = 0;
  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    const tab = rawLine.indexOf('\t');
    const parts =
      tab >= 0
        ? [rawLine.slice(0, tab), rawLine.slice(tab + 1)]
        : line.split(/[; ]+/, 2);
    const article = normalizeDemandArticle(parts[0] ?? '');
    if (!article || article.length < 4 || !/[0-9]/.test(article)) {
      invalid++;
      return;
    }
    const rawValue = (parts[1] ?? '')
      .trim()
      .replace(/\s+/g, '')
      .replace(',', '.');
    if (!rawValue) {
      values[article] = null;
      return;
    }
    const demand = Number(rawValue);
    if (!Number.isFinite(demand) || demand < 0) {
      invalid++;
      return;
    }
    values[article] = demand;
  });
  const entries = Object.values(values);
  const withValue = entries.filter((value) => value != null).length;
  return {
    values,
    recognized: entries.length,
    withValue,
    withoutValue: entries.length - withValue,
    invalid,
  };
}

export function demandForArticle(
  values: Record<string, number | null>,
  article: string | null | undefined,
): { found: boolean; value: number | null } {
  if (!article) return { found: false, value: null };
  const key = normalizeDemandArticle(article);
  return Object.hasOwn(values, key)
    ? { found: true, value: values[key] }
    : { found: false, value: null };
}
