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
        .map((ext) => base + ext)
        .find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
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
const { default: WeeklyAudit } = await import('../components/weekly-audit.tsx');
const { Delta } = await import('../components/analytics-ui.tsx');
const { METRICS } = await import('../lib/model.ts');
const { normalize } = await import('../lib/normalize.ts');
const { scopeHistory, SCOPES } = await import('../lib/explore.ts');
const row = (end, contacts) => ({
  branch: 'И31',
  end,
  start: '',
  label: '',
  source: 'test',
  row: 1,
  column: 1,
  metrics: {
    ...Object.fromEntries(Object.keys(METRICS).map((m) => [m, 10])),
    contacts,
  },
});
const fixture = [row('2026-08-24', 100), row('2026-08-31', 125)];
const render = (rows, from = '2026-08-24', to = '2026-08-31', scope = 'И31') =>
  renderToStaticMarkup(createElement(WeeklyAudit, { rows, from, to, scope }));
const html = render(fixture);
assert.equal(
  (html.match(/class="audit-card"/g) || []).length,
  21,
  'All 20 audit metrics plus contact cost are visible',
);
for (const metric of Object.values(METRICS))
  assert.ok(
    html.includes(
      metric.label
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;'),
    ),
  );
assert.match(
  html,
  /<strong>125<\/strong>/,
  'Primary value is the last week, not a sum over the date range',
);
assert.ok(!html.includes('<strong>225</strong>'));
const missing = render([fixture[0]], '2026-08-24', '2026-08-31');
assert.ok(missing.includes('Последняя неделя в диапазоне отсутствует'));
assert.ok(
  !missing.includes('<strong>100</strong>'),
  'Do not substitute an old report for a missing latest week',
);
assert.ok(render([], '2026-08-24', '2026-08-31').includes('нет отчётов'));
const delta = (current, previous, metric) =>
  renderToStaticMarkup(createElement(Delta, { current, previous, metric }));
assert.ok(delta(0.25, 0.2, 'viewRate').includes('п.п.'));
assert.ok(delta(0, 0, 'contacts').includes('Без изменений'));
assert.ok(delta(5, 0, 'contacts').includes('Было 0'));
assert.ok(delta(90, 100, 'contactCost').includes('positive'));
assert.ok(delta(90, 100, 'contacts').includes('negative'));
assert.ok(delta(null, 100, 'contacts').includes('Нет базы сравнения'));
if (fs.existsSync('private/raw.json')) {
  const snapshot = normalize(
    JSON.parse(fs.readFileSync('private/raw.json', 'utf8')),
    'excel',
  );
  const started = performance.now();
  for (const scope of SCOPES) {
    const rows = scopeHistory(snapshot.stats, scope.value);
    if (!rows.length) continue;
    const output = render(rows, rows[0].end, rows.at(-1).end, scope.value);
    assert.equal((output.match(/class="audit-card"/g) || []).length, 21);
    assert.ok(!output.includes('NaN') && !output.includes('Infinity'));
  }
  console.log(
    `Real-data render: ${snapshot.stats.length} reports, ${SCOPES.length} scopes, ${Math.round(performance.now() - started)} ms.`,
  );
}
console.log(
  'Passed: all audit metrics render, weekly values, missing reports, zero baseline, percentage points and semantic change colors.',
);
