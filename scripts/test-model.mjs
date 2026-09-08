import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

await fs.mkdir('private/compiled', { recursive: true });
for (const name of ['model', 'normalize', 'explore']) {
  const source = await fs.readFile(`lib/${name}.ts`, 'utf8');
  const output = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replaceAll("'./model'", "'./model.js'");
  await fs.writeFile(`private/compiled/${name}.js`, output);
}
const { aggregate, calendar, number } =
  await import('../private/compiled/model.js');
const { parseAd } = await import('../private/compiled/normalize.js');
const { distribution, extractArticle, scopeHistory, searchUrl, timeSeries } =
  await import('../private/compiled/explore.js');
assert.equal(number('15 499 ₽'), 15499);
assert.equal(number('н/д'), null);
assert.equal(number('0'), 0);
assert.equal(
  aggregate(
    [
      { metrics: { views: 10, contacts: 2 } },
      { metrics: { views: 90, contacts: 3 } },
    ],
    'contactRate',
  ),
  0.05,
);
assert.equal(
  aggregate([{ metrics: { views: 0, spend: 100 } }], 'viewCost'),
  null,
);
assert.equal(
  aggregate(
    [{ metrics: { contacts: 2 } }, { metrics: { contacts: null } }],
    'contacts',
  ),
  null,
);
assert.equal(
  aggregate(
    [{ metrics: { stock: 100 } }, { metrics: { stock: null } }],
    'stock',
  ),
  null,
);
assert.deepEqual(
  calendar('2026-08-10', '2026-08-31', ['2026-08-10', '2026-08-31']),
  ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'],
);
function row(shifted, extended) {
  const r = Array(39).fill(null);
  r[0] = '2026-08-31';
  r[1] = 'Автово';
  r[2] = 1234567890;
  r[9] = 'Тестовое объявление';
  r[10] = '1 000 ₽';
  const s = shifted ? 14 : 15;
  [100, 0.2, 20, 5, 0.1, 20, 2, 1, 1, 0, 0, 50, 3].forEach(
    (v, i) => (r[s + i] = v),
  );
  if (extended) {
    for (let i = 13; i <= 23; i++) r[s + i] = 0;
    r[s + 18] = 100;
    r[s + 20] = 100;
  } else r[s + 13] = 100;
  return r;
}
for (const shifted of [false, true])
  for (const extended of [false, true]) {
    const result = parseAd(
      row(shifted, extended),
      true,
      'synthetic',
      2,
      'Детализация',
    );
    assert.ok(result.ad);
    assert.equal(result.ad.metrics.views, 20);
    assert.equal(result.ad.metrics.contacts, 2);
    assert.equal(result.ad.metrics.spend, 100);
  }
const bad = row(false, false);
bad[21] = 2990;
const result = parseAd(bad, true, 'synthetic', 2, 'Детализация');
assert.equal(result.ad.metrics.contacts, null);
assert.equal(result.ad.metrics.views, 20);
assert.equal(result.issue.code, 'contact-inconsistent');
assert.equal(
  extractArticle('Клапанная крышка N47 11128507607 11128589941').value,
  '11128507607',
);
assert.equal(
  extractArticle('Коллектор впускной Mercedes M273 A2731400T701GH').value,
  'A2731400T701GH',
);
assert.equal(extractArticle('Двигатель N47 BMW').value, null);
assert.equal(extractArticle('Название 11128507607', '').value, null);
assert.equal(
  searchUrl('https://www.avito.ru/moskva?q={query}', 'Крышка N47 11128507607'),
  'https://www.avito.ru/moskva?q=%D0%9A%D1%80%D1%8B%D1%88%D0%BA%D0%B0%20N47%2011128507607',
);
assert.equal(searchUrl('https://example.com/?q={query}', 'test'), null);
const scoped = scopeHistory(
  [
    {
      branch: 'И31',
      end: '2026-08-31',
      start: '',
      label: '',
      source: '',
      row: 1,
      column: 1,
      metrics: { views: 100, contacts: 10, stock: 100, rating: 5 },
    },
    {
      branch: 'Х7',
      end: '2026-08-31',
      start: '',
      label: '',
      source: '',
      row: 1,
      column: 1,
      metrics: { views: 50, contacts: 10, stock: 200, rating: 4 },
    },
  ],
  'moscow',
);
assert.equal(scoped[0].metrics.views, 150);
assert.equal(scoped[0].metrics.contactRate, 20 / 150);
assert.equal(scoped[0].metrics.stock, 300);
assert.equal(scoped[0].metrics.rating, 4.5);
assert.equal(scoped[0].metrics.roi, null);
assert.deepEqual(
  timeSeries(
    [
      { end: '2026-08-24', metrics: { views: 4 } },
      { end: '2026-08-31', metrics: { views: 6 } },
    ],
    'views',
    'month',
    '2026-08-01',
    '2026-08-31',
  ),
  [{ date: '2026-08-01', value: 10, count: 2 }],
);
assert.deepEqual(distribution([1, 2, 10, null]), {
  count: 3,
  missing: 1,
  mean: 13 / 3,
  median: 2,
});
console.log(
  'Passed: data layouts, weighted aggregation, city totals, time grains, missing values, article extraction and safe Avito links.',
);
