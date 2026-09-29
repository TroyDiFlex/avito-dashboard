import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const root = path.resolve('.');
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith('@/') ||
      (specifier.startsWith('.') &&
        context.parentURL?.startsWith(pathToFileURL(root).href))
    ) {
      const base = specifier.startsWith('@/')
        ? path.resolve(root, specifier.slice(2))
        : path.resolve(
            path.dirname(fileURLToPath(context.parentURL)),
            specifier,
          );
      const file = ['', '.ts', '.tsx', '.js']
        .map((extension) => base + extension)
        .find(
          (candidate) =>
            fs.existsSync(candidate) && fs.statSync(candidate).isFile(),
        );
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (
      url.startsWith(pathToFileURL(root).href) &&
      /\.tsx?$/.test(url) &&
      !url.includes('node_modules')
    ) {
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(
          fs.readFileSync(fileURLToPath(url), 'utf8'),
          {
            compilerOptions: {
              target: ts.ScriptTarget.ES2022,
              module: ts.ModuleKind.ESNext,
              jsx: ts.JsxEmit.ReactJSX,
            },
          },
        ).outputText,
      };
    }
    return next(url, context);
  },
});

const { default: Overview } = await import('../components/overview.tsx');
const { default: Insights } = await import('../components/insights.tsx');
const { demoSnapshot } = await import('../lib/demo.ts');
const { METRICS } = await import('../lib/model.ts');
const branches = ['И31', 'Х7', 'Автово', 'Б116', 'Ворошилова'];
const row = (branch, end, contacts) => ({
  branch,
  end,
  start: '',
  label: '',
  source: 'test',
  row: 1,
  column: 1,
  metrics: {
    ...Object.fromEntries(Object.keys(METRICS).map((metric) => [metric, 10])),
    contacts,
  },
});
const stats = branches.flatMap((branch, index) => [
  row(branch, '2026-08-24', 100 + index),
  row(branch, '2026-08-31', 125 + index),
]);
const snapshot = {
  version: 1,
  updatedAt: new Date().toISOString(),
  mode: 'demo',
  stats,
  ads: [],
  issues: [],
  sources: ['test'],
  rawAdCount: 0,
};
const html = renderToStaticMarkup(
  createElement(Overview, {
    snapshot,
    from: '2026-08-24',
    to: '2026-08-31',
    branch: 'И31',
    onBranchChange() {},
    branches,
  }),
);
assert.equal((html.match(/class="matrix-group"/g) || []).length, 4);
assert.equal((html.match(/class="history-group"/g) || []).length, 0);
assert.ok(html.includes('overview-table-panel'));
assert.ok(html.includes('Результаты подразделений'));
assert.ok(html.includes('Все подразделения'));
assert.equal((html.match(/colSpan="3"/g) || []).length, branches.length);
assert.ok(!html.includes('История подразделения'));
assert.ok(!html.includes('focus-panel'));
for (const branch of branches) assert.ok(html.includes(branch));
for (const [metricKey, metric] of Object.entries(METRICS)) {
  if (metricKey === 'price' || metricKey === 'contactPriceShare') continue;
  assert.ok(
    html.includes(
      metric.label
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;'),
    ),
    `Missing overview metric label: ${metric.label}`,
  );
}
assert.ok(html.includes('125'));
assert.ok(html.includes('100'));
assert.ok(!html.includes('NaN') && !html.includes('Infinity'));
console.log(
  'Passed: one switchable overview table, five branches and all metrics render.',
);

const insightsHtml = renderToStaticMarkup(
  createElement(Insights, {
    snapshot: demoSnapshot(),
    from: '2026-03-23',
    to: '2026-08-31',
    availableBranches: branches,
    initialBranch: 'network',
    demandByArticle: { 11128507607: 66 },
    categoryByArticle: { 11128507607: 'A' },
    onOpenPart() {},
    onOpenPartMetrics() {},
    getPartHref() {
      return '/?partsScope=network';
    },
    getPartMetricsHref(ad) {
      return `/?partsScope=${encodeURIComponent(ad.branch)}`;
    },
  }),
);
assert.ok(insightsHtml.includes('Точки роста'));
assert.ok(insightsHtml.includes('Правила сигналов'));
assert.ok(insightsHtml.includes('Требуют внимания'));
assert.ok(insightsHtml.includes('Ждём данные'));
assert.ok(insightsHtml.includes('Без сигналов'));
assert.ok(insightsHtml.includes('Спрос'));
assert.ok(insightsHtml.includes('Категория'));
assert.ok(insightsHtml.includes('Показатели'));
assert.ok(!insightsHtml.includes('NaN') && !insightsHtml.includes('Infinity'));
console.log(
  'Passed: transparent growth rules, filters and unique product cards render.',
);
