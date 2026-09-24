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
  categories: Record<string, string | null>;
  recognized: number;
  withValue: number;
  withoutValue: number;
  withCategory: number;
  invalid: number;
  issues: DemandParseIssue[];
}

export interface DemandParseIssue {
  line: number;
  input: string;
  reason: string;
}

export function normalizeDemandArticle(value: string): string {
  return value
    .replace(/[*_`]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/VRN$/, '');
}

function normalizeCategory(value: string | undefined): string | null {
  const candidate = (value ?? '')
    .replace(/[*_`]/g, '')
    .trim()
    .split(/\s+/)[0]
    ?.toUpperCase();
  return candidate && /^[A-ZА-ЯЁ][A-ZА-ЯЁ0-9_-]{0,9}$/.test(candidate)
    ? candidate
    : null;
}

function cellsFromLine(rawLine: string): string[] {
  const line = rawLine.trim();
  if (line.startsWith('|')) {
    const cells = line.split('|');
    if (!cells[0]) cells.shift();
    if (!cells.at(-1)) cells.pop();
    return cells.map((cell) => cell.trim());
  }
  if (rawLine.includes('\t')) return rawLine.split('\t');
  if (line.includes(';')) return line.split(';');
  return line.split(/\s+/, 3);
}

export function parseDemandAnalysis(text: string): DemandAnalysis {
  const values: Record<string, number | null> = {};
  const categories: Record<string, string | null> = {};
  const issues: DemandParseIssue[] = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;
    if (/артикул/i.test(line) && /спрос/i.test(line)) return;
    const parts = cellsFromLine(rawLine);
    if (parts.every((part) => !part.trim() || /^:?-+:?$/.test(part.trim())))
      return;
    const article = normalizeDemandArticle(parts[0] ?? '');
    if (!article || article.length < 4 || !/[0-9]/.test(article)) {
      issues.push({
        line: index + 1,
        input: line,
        reason: 'не удалось определить артикул',
      });
      return;
    }
    const rawValue = (parts[1] ?? '')
      .trim()
      .replace(/\s+/g, '')
      .replace(',', '.');
    if (!rawValue || /^(?:-|—|нет|n\/a|null)$/i.test(rawValue)) {
      values[article] = null;
      categories[article] = normalizeCategory(parts[2]);
      return;
    }
    const demand = Number(rawValue);
    if (!Number.isFinite(demand) || demand < 0) {
      issues.push({
        line: index + 1,
        input: line,
        reason: `значение спроса «${parts[1]?.trim() || 'пусто'}» не является числом`,
      });
      return;
    }
    values[article] = demand;
    categories[article] = normalizeCategory(parts[2]);
  });
  const entries = Object.values(values);
  const withValue = entries.filter((value) => value != null).length;
  return {
    values,
    categories,
    recognized: entries.length,
    withValue,
    withoutValue: entries.length - withValue,
    withCategory: Object.values(categories).filter((value) => value != null)
      .length,
    invalid: issues.length,
    issues,
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
