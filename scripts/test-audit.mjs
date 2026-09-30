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

const insightsProps = {
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
};
const insightsHtml = renderToStaticMarkup(
  createElement(Insights, insightsProps),
);
assert.ok(insightsHtml.includes('Точки роста'));
assert.ok(!insightsHtml.includes('Правила сигналов'));
assert.ok(!insightsHtml.includes('Требуют внимания'));
assert.ok(!insightsHtml.includes('Без сигналов'));
assert.ok(insightsHtml.includes('Дубли'));
assert.equal(
  (insightsHtml.match(/class="growth-range-field"/g) || []).length,
  2,
);
assert.equal(
  (insightsHtml.match(/class="growth-slider-thumb"/g) || []).length,
  4,
);
assert.ok(insightsHtml.includes('Спрос'));
assert.ok(insightsHtml.includes('Категории'));
assert.ok(insightsHtml.includes('Показатели'));
const insightsContent = insightsHtml.replace(
  /<script\b[^>]*>[\s\S]*?<\/script>/g,
  '',
);
assert.ok(
  !insightsContent.includes('NaN') && !insightsContent.includes('Infinity'),
  insightsContent.match(/.{0,100}(?:NaN|Infinity).{0,100}/g)?.join('\n'),
);
console.log('Passed: range filters and current listing cards render.');

// Read saved filters during server rendering; no browser or DOM is started.
const saved = {
  scope: 'И31',
  categories: ['A'],
  demand: { min: '50', max: '100' },
  metric: { metric: 'views', min: '20', max: '40' },
  extra: { metric: 'viewRate', min: '5', max: '10' },
  search: 'no match',
};
globalThis.window = { location: { search: '' } };
globalThis.localStorage = { getItem: () => JSON.stringify(saved) };
try {
  const extraHtml = renderToStaticMarkup(
    createElement(Insights, insightsProps),
  );
  assert.equal(
    (extraHtml.match(/class="growth-range-field"/g) || []).length,
    3,
  );
  assert.equal(
    (extraHtml.match(/class="growth-slider-thumb"/g) || []).length,
    6,
  );
  assert.ok(extraHtml.includes('with-extra'));
  assert.ok(extraHtml.includes('value="no match"'));
  assert.ok(extraHtml.includes('insights-scope-picker'));

  window.location.search = '?growthMode=duplicates';
  const duplicateAds = ['И31', 'Х7'].flatMap((branch, branchIndex) =>
    ['2026-08-24', '2026-08-31'].flatMap((end) =>
      [0, 1].map((index) => ({
        ...row(branch, end, 1),
        id: String(100 + branchIndex * 10 + index),
        name: 'Деталь BMW 11128507607',
        category: 'Запчасти',
        price: 1000,
        profile: 'test',
      })),
    ),
  );
  const duplicateHtml = renderToStaticMarkup(
    createElement(Insights, {
      ...insightsProps,
      snapshot: { ...snapshot, ads: duplicateAds },
      from: '2026-01-01',
      to: '2026-01-02',
    }),
  );
  for (const hidden of [
    'growth-range-field',
    'growth-category-trigger',
    'growth-search',
    'insights-scope-picker',
    'growth-funnel',
    'growth-card-footer',
  ])
    assert.ok(
      !duplicateHtml.includes(hidden),
      `Hidden in duplicate mode: ${hidden}`,
    );
  assert.equal(
    (duplicateHtml.match(/class="growth-card is-duplicate"/g) || []).length,
    2,
  );
  for (const id of [100, 101, 110, 111]) {
    assert.ok(duplicateHtml.includes(`https://www.avito.ru/${id}`));
  }
  assert.ok(duplicateHtml.includes('24.08 и 31.08'));
  assert.ok(duplicateHtml.includes('Отбор'));

  window.location.search = '';
  assert.equal(
    renderToStaticMarkup(createElement(Insights, insightsProps)),
    extraHtml,
  );
  window.location.search = '?growthMode=signals';
  const signalAds = [
    '2026-08-10',
    '2026-08-17',
    '2026-08-24',
    '2026-08-31',
  ].map((end) => ({
    ...row('И31', end, 0),
    id: '500',
    name: 'Деталь BMW 11128507607',
    category: 'Запчасти',
    price: 1000,
    profile: 'test',
    metrics: { impressions: 5, views: 0, contacts: 0 },
  }));
  const signalProps = {
    ...insightsProps,
    snapshot: { ...snapshot, ads: signalAds },
  };
  const signalHtml = renderToStaticMarkup(createElement(Insights, signalProps));
  assert.equal(
    (signalHtml.match(/class="growth-range-field"/g) || []).length,
    1,
  );
  assert.ok(signalHtml.includes('Пороги сигналов'));
  assert.ok(signalHtml.includes('Все сигналы'));
  assert.ok(signalHtml.includes('aria-label="Категории"'));
  assert.ok(
    signalHtml.includes('Сигналы не найдены'),
    'Search/demand filters still apply in signals mode.',
  );
  localStorage.getItem = () =>
    JSON.stringify({ ...saved, search: '', demand: { min: '', max: '' } });
  const signalCardHtml = renderToStaticMarkup(
    createElement(Insights, signalProps),
  );
  assert.ok(signalCardHtml.includes('Стабильно низкий охват'));
  assert.ok(signalCardHtml.includes('4 из 4 выгрузок'));
  assert.ok(signalCardHtml.includes('growth-signal-findings'));
  assert.ok(signalCardHtml.includes('growth-funnel'));
  assert.ok(signalCardHtml.includes('insights-scope-picker'));
  assert.ok(!signalCardHtml.includes('Добавить показатель'));
  assert.ok(!signalCardHtml.includes('Убрать дополнительный показатель'));
  console.log(
    'Passed: three modes, current cards, range layout, signal evidence/category/demand filters, independent duplicates and saved settings.',
  );
} finally {
  delete globalThis.window;
  delete globalThis.localStorage;
}
