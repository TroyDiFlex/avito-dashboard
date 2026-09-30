import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { resolveThumbCollision } from '../node_modules/@base-ui/react/slider/utils/resolveThumbCollision.js';

await fs.mkdir('private/compiled', { recursive: true });
for (const name of ['model', 'explore', 'demand', 'growth-signals', 'growth']) {
  const source = await fs.readFile(`lib/${name}.ts`, 'utf8');
  const output = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replaceAll("'./model'", "'./model.js'")
    .replaceAll("'./explore'", "'./explore.js'")
    .replaceAll("'./growth-signals'", "'./growth-signals.js'")
    .replaceAll("'./demand'", "'./demand.js'");
  await fs.writeFile(`private/compiled/${name}.js`, output);
}
const {
  buildGrowthCases,
  filterGrowthCases,
  defaultGrowthFilters,
  restoreGrowthFilters,
  growthRangeMaximum,
  growthMetricValue,
  parseGrowthBound,
  invalidGrowthRange,
  clampGrowthRange,
  NO_GROWTH_CATEGORY,
} = await import('../private/compiled/growth.js');
function ad({
  id,
  end,
  impressions = 100,
  views = 10,
  contacts = 1,
  branch = 'И31',
  article = '11121432928',
}) {
  return {
    branch,
    id,
    end,
    name: article ? `Деталь BMW ${article}` : 'Без артикула',
    category: 'Запчасти',
    price: 10000,
    metrics: { impressions, views, contacts },
    source: 'test',
    row: 1,
    profile: 'test',
  };
}
function cases(ads, options = {}) {
  return buildGrowthCases(
    {
      version: 1,
      updatedAt: '2026-09-30T00:00:00Z',
      mode: 'demo',
      stats: [],
      ads,
      issues: [],
      sources: ['test'],
      rawAdCount: ads.length,
    },
    {
      from: '2026-01-01',
      to: '2026-12-31',
      branches: ['И31', 'Х7'],
      demandByArticle: { 11121432928: 193 },
      categoryByArticle: { 11121432928: 'A' },
      ...options,
    },
  );
}
const weeks = [
  '2026-01-05',
  '2026-01-12',
  '2026-01-19',
  '2026-01-26',
  '2026-02-02',
  '2026-02-09',
  '2026-02-16',
  '2026-02-23',
  '2026-03-02',
  '2026-03-09',
];
const history = weeks.map((end) =>
  ad({ id: '100', end, impressions: 1000, views: 500, contacts: 2 }),
);
const full = cases(history);
assert.equal(full[0].reportCount, 10);
assert.equal(
  full[0].impressions,
  10000,
  'The full selected history must not be truncated to six reports.',
);
assert.equal(full[0].views, 5000);
const recent = cases(history, { from: '2026-03-09', to: '2026-03-09' });
assert.equal(growthRangeMaximum(full, 'views'), 5000);
assert.equal(
  growthRangeMaximum(recent, 'views'),
  500,
  'Slider ceilings must follow the selected period.',
);
assert.equal(
  growthRangeMaximum(
    cases([ad({ id: '100', end: weeks.at(-1), views: 10000 })]),
    'views',
  ),
  10000,
);
assert.equal(growthRangeMaximum(full, 'demand'), 193);

const recreated = cases([
  ...history,
  ad({ id: '200', end: '2026-03-16', impressions: 7, views: 0, contacts: 0 }),
]);
assert.equal(recreated.length, 1);
assert.equal(recreated[0].primaryId, '200');
assert.deepEqual(recreated[0].currentIds, ['200']);
assert.deepEqual(recreated[0].previousIds, ['100']);
assert.equal(
  recreated[0].impressions,
  7,
  'Old ID metrics must not leak into its replacement.',
);
assert.equal(recreated[0].isDuplicate, false);
const past = cases([...history, ad({ id: '200', end: '2026-03-16' })], {
  from: weeks[0],
  to: weeks.at(-1),
});
assert.equal(
  past[0].primaryId,
  '200',
  'Roster selection must use the latest loaded report even when dates select the past.',
);
assert.equal(
  past[0].impressions,
  null,
  'No observations in a period are not zero.',
);
const removed = cases([
  ad({ id: '100', end: '2026-01-05' }),
  ad({ id: '900', end: '2026-01-12', article: '22221432928' }),
]);
assert.equal(
  removed.length,
  1,
  'An old article absent from the branch latest report must disappear.',
);
assert.equal(removed[0].primaryId, '900');

const pair = ['2026-03-09', '2026-03-16'].flatMap((end) => [
  ad({ id: '300', end }),
  ad({ id: '301', end }),
]);
const duplicate = cases(pair);
assert.equal(duplicate[0].isDuplicate, true);
assert.deepEqual(duplicate[0].duplicateIds, ['300', '301']);
assert.deepEqual(duplicate[0].duplicateDates, ['2026-03-09', '2026-03-16']);
assert.equal(
  cases(pair, { from: '2026-01-01', to: '2026-01-02' })[0].isDuplicate,
  true,
  'Duplicate detection must ignore history selection.',
);
assert.equal(
  cases(pair.slice(2))[0].isDuplicate,
  false,
  'One overlap report is a permitted replacement transition.',
);
assert.equal(
  cases([
    ad({ id: '300', end: '2026-03-09', article: '22221432928' }),
    ...pair.slice(1),
  ])[0].isDuplicate,
  false,
  'The article must match in both reports, even when IDs are unchanged.',
);
assert.equal(
  cases([...pair, ad({ id: '301', end: '2026-03-23' })])[0].isDuplicate,
  false,
  'Resolved historical duplicates must disappear.',
);
assert.equal(
  cases([
    ad({ id: '300', end: '2026-03-09' }),
    ad({ id: '301', end: '2026-03-09' }),
    ad({ id: '300', end: '2026-03-16' }),
    ad({ id: '302', end: '2026-03-16' }),
  ])[0].isDuplicate,
  false,
  'The same article with different ID pairs in successive weeks is not a persistent pair.',
);
const gap = cases([
  ...pair,
  ad({ id: '900', end: '2026-03-12', article: '22221432928' }),
]);
assert.equal(
  gap.find((item) => item.article === '11121432928').isDuplicate,
  false,
  'Use the branch previous report, not the article previous appearance.',
);
const triple = cases([...pair, ad({ id: '302', end: '2026-03-16' })]);
assert.deepEqual(
  triple[0].duplicateIds,
  ['300', '301'],
  'A newly created third ID must not be falsely marked persistent.',
);
const differentBranches = cases([
  ad({ id: '300', end: '2026-03-16' }),
  ad({ id: '301', end: '2026-03-16', branch: 'Х7' }),
]);
assert.equal(differentBranches.length, 2);
assert.ok(differentBranches.every((item) => !item.isDuplicate));
const branchReports = cases([
  ...pair,
  ad({ id: '900', end: '2026-03-23', branch: 'Х7' }),
]);
assert.equal(
  branchReports.find((item) => item.branch === 'И31').isDuplicate,
  true,
  'Report dates are independent per branch.',
);
assert.deepEqual(
  cases([...pair, ad({ id: '900', end: '2026-03-23', branch: 'Х7' })], {
    branches: ['Х7'],
  }).map((item) => item.branch),
  ['Х7'],
);

const weighted = cases([
  ad({
    id: '100',
    end: '2026-03-09',
    impressions: 100,
    views: 20,
    contacts: 10,
  }),
  ad({
    id: '100',
    end: '2026-03-16',
    impressions: 900,
    views: 90,
    contacts: 1,
  }),
]);
assert.equal(weighted[0].viewRate, 0.11);
assert.equal(weighted[0].contactRate, 0.1);
assert.equal(growthMetricValue(weighted[0], 'viewRate'), 11);
assert.equal(
  growthRangeMaximum(weighted, 'viewRate'),
  11,
  'Percent ceilings must come from observed conversion, not a fixed 100%.',
);
assert.equal(
  growthRangeMaximum(
    cases([ad({ id: '100', end: '2026-03-16', impressions: 10, views: 15 })]),
    'viewRate',
  ),
  150,
);
const zero = cases([
  ad({ id: '100', end: '2026-03-16', impressions: 0, views: 0, contacts: 0 }),
]);
assert.equal(zero[0].viewRate, null);
assert.equal(zero[0].contactRate, null);
assert.equal(growthRangeMaximum(zero, 'views'), 0);
assert.equal(growthRangeMaximum([], 'views'), 0);
const missing = cases([
  ad({
    id: '100',
    end: '2026-03-16',
    impressions: null,
    views: null,
    contacts: null,
  }),
]);
assert.equal(missing[0].views, null);
assert.equal(filterGrowthCases(missing, defaultGrowthFilters()).length, 1);
assert.equal(
  filterGrowthCases(missing, {
    ...defaultGrowthFilters(),
    metric: { metric: 'views', min: '0', max: '0' },
  }).length,
  0,
  'Unknown data must not match a zero filter.',
);
assert.equal(
  filterGrowthCases(zero, {
    ...defaultGrowthFilters(),
    metric: { metric: 'views', min: '0', max: '0' },
  }).length,
  1,
);

const restrictive = {
  ...defaultGrowthFilters('Х7'),
  categories: [],
  demand: { min: '999', max: '1000' },
  metric: { metric: 'views', min: '999', max: '1000' },
  extra: { metric: 'viewRate', min: '5', max: '1' },
  search: 'no match',
};
const saved = JSON.stringify(restrictive);
assert.equal(filterGrowthCases(duplicate, restrictive).length, 0);
assert.equal(
  filterGrowthCases(duplicate, { ...restrictive, mode: 'duplicates' }).length,
  1,
  'Duplicate mode must bypass scope, categories, search and all ranges, even invalid ones.',
);
assert.equal(
  JSON.stringify(restrictive),
  saved,
  'Entering duplicate mode must leave normal filter values intact.',
);
assert.equal(
  filterGrowthCases(full, {
    ...defaultGrowthFilters(),
    categories: ['A', 'B'],
    demand: { min: '100', max: '200' },
    metric: { metric: 'views', min: '4999', max: '5000' },
    extra: { metric: 'viewRate', min: '50', max: '50' },
  }).length,
  1,
);
assert.equal(
  filterGrowthCases(full, { ...defaultGrowthFilters(), categories: [] }).length,
  0,
);
assert.equal(
  filterGrowthCases(removed, {
    ...defaultGrowthFilters(),
    categories: [NO_GROWTH_CATEGORY],
  }).length,
  1,
);
assert.equal(parseGrowthBound('1,5'), 1.5);
assert.equal(parseGrowthBound('-1'), null);
assert.equal(parseGrowthBound('Infinity'), null);
assert.ok(invalidGrowthRange({ min: '10', max: '2' }));
assert.ok(invalidGrowthRange({ min: 'no', max: '' }));
assert.deepEqual(
  clampGrowthRange({ metric: 'views', min: '900', max: '10000' }, 500),
  { metric: 'views', min: '500', max: '500' },
);
const restored = restoreGrowthFilters(
  JSON.parse(JSON.stringify({ ...restrictive, mode: 'duplicates' })),
  new URLSearchParams(),
  'И31',
  ['И31', 'Х7'],
);
assert.deepEqual(restored, { ...restrictive, mode: 'duplicates' });
const legacy = restoreGrowthFilters(
  {
    category: 'A',
    demandMin: '100',
    demandMax: '200',
    view: 'signal',
    signal: 'no-views',
  },
  new URLSearchParams(),
  'И31',
  ['И31'],
);
assert.deepEqual(legacy.categories, ['A']);
assert.deepEqual(legacy.demand, { min: '100', max: '200' });
assert.equal(legacy.mode, 'selection');
assert.deepEqual(
  restoreGrowthFilters(
    {},
    new URLSearchParams(
      'growthCategories=[]&growthMode=duplicates&growthMetric=contactRate&growthMetricMax=2,5',
    ),
    'И31',
    ['И31'],
  ).categories,
  [],
);

for (const values of [
  [0, 0],
  [500, 500],
  [250, 250],
]) {
  for (const index of [0, 1]) {
    const target = values[0] === 0 ? 100 : values[0] - 100;
    const result = resolveThumbCollision(
      'swap',
      values,
      values,
      values,
      index,
      target,
      0,
      500,
      1,
      0,
    );
    assert.ok(
      result.value[0] < result.value[1],
      `Coincident thumbs must separate: ${values.join(', ')}, index ${index}.`,
    );
    assert.ok(result.value.every((value) => value >= 0 && value <= 500));
  }
}
function signalRows(values, metric = 'impressions', overrides = {}) {
  return values.map((value, index) =>
    ad({
      id: '777',
      end: weeks[index],
      impressions: 1000,
      views: 100,
      contacts: 10,
      [metric]: value,
      ...overrides,
    }),
  );
}
for (const [metric, values, expected] of [
  ['impressions', [1000, 1000, 1000, 1000, 100, 100], 'recent-decline'],
  ['impressions', [1000, 1000, 1000, 1000, 100, 100, 100, 100], 'long-decline'],
  ['views', [100, 100, 100, 100, 10, 10], 'recent-decline'],
  ['contacts', [20, 20, 20, 20, 0, 0], 'recent-decline'],
  ['views', [20, 20, 20, 20, 80, 80], 'improvement'],
  ['contacts', [0, 0, 0, 0, 10, 10], 'improvement'],
  ['contacts', [0, 0, 0, 0, 10, 10, 10, 10], 'improvement'],
  ['contacts', [0, 0, 0, 0], 'no-contacts'],
  ['impressions', [1000, 1000, 1000, 1000], 'stable-good'],
]) {
  const item = cases(signalRows(values, metric))[0];
  assert.ok(
    item.signals.some((signal) => signal.kind === expected),
    `${String(metric)}: ${String(expected)}`,
  );
  assert.ok(
    item.signals.every((signal) => !/NaN|Infinity/.test(signal.explanation)),
  );
}
const weak = cases(
  signalRows([5, 5, 5, 5], 'impressions', { views: 0, contacts: 0 }),
);
assert.ok(weak[0].signals.some((signal) => signal.kind === 'low-reach'));
assert.ok(
  cases(signalRows([5, 5, 5, 5], 'views', { contacts: 0 }))[0].signals.some(
    (signal) => signal.kind === 'low-rates',
  ),
);
assert.deepEqual(cases(signalRows([1000, 1000, 1000]))[0].signals, []);
assert.deepEqual(
  cases(
    signalRows([20, 20, 20, 20], 'impressions', { views: 1, contacts: 1 }),
  )[0].signals,
  [],
  'A few views/contacts are insufficient for a stable positive conversion signal.',
);
const weightedSignal = cases(
  [100, 900, 100, 900].map((impressions, index) =>
    ad({
      id: '777',
      end: weeks[index],
      impressions,
      views: index % 2 ? 9 : 10,
      contacts: 0,
    }),
  ),
  { signalRules: { reach: 20, viewRate: 20, contactRate: 3 } },
)[0].signals.find(
  (signal) => signal.title === 'Стабильно низкая доля просмотров',
);
assert.ok(
  weightedSignal?.explanation.includes('За период: 1,9%.'),
  'Signal rates must weight actual trials, not average weekly percentages.',
);
const gapHistory = signalRows([
  1000, 1000, 1000, 1000, 1000, 1000, 100, 100,
]).filter((_, index) => index !== 6);
assert.ok(
  !cases([
    ...gapHistory,
    ad({ id: '900', end: weeks[6], article: '22221432928' }),
  ])
    .find((item) => item.id === '777')
    .signals.some(
      (signal) =>
        signal.kind === 'recent-decline' || signal.kind === 'long-decline',
    ),
  'A missing penultimate report cannot confirm a two-report decline.',
);
assert.deepEqual(
  cases(
    signalRows([1000, 1000, 1000, 1000], 'impressions', {
      views: null,
      contacts: null,
    }),
  )[0].signals,
  [],
);
assert.ok(
  !cases(signalRows([1000, 100, 100, 100, 100, 100]))[0].signals.some(
    (signal) => signal.title.startsWith('Показы:'),
  ),
  'One isolated historical spike is not a sustained high baseline.',
);
assert.deepEqual(
  cases(signalRows([1000, 1000, 1000, 1000]), { from: weeks[2] })[0].signals,
  [],
  'Signals cannot borrow history from outside the selected period.',
);
const sparse = signalRows([5, 5, 5, 5], 'impressions', {
  views: 0,
  contacts: 0,
}).map((row, index) => ({ ...row, end: weeks[[0, 2, 4, 7][index]] }));
assert.deepEqual(
  cases([
    ...sparse,
    ...weeks
      .slice(0, 8)
      .map((end) => ad({ id: '900', end, article: '22221432928' })),
  ]).find((item) => item.id === '777').signals,
  [],
  'Sparse observations must not be presented as a continuous stable result.',
);
const replacement = cases([
  ...signalRows([5, 5, 5, 5], 'impressions', {
    id: '666',
    views: 0,
    contacts: 0,
  }),
  ...signalRows([1000, 1000, 1000, 1000]).map((row, index) => ({
    ...row,
    end: weeks[index + 4],
  })),
])[0];
assert.equal(replacement.primaryId, '777');
assert.ok(replacement.signals.some((signal) => signal.kind === 'stable-good'));
assert.ok(
  !replacement.signals.some((signal) => signal.kind === 'low-reach'),
  'The old ID history must not affect a replacement.',
);
assert.ok(
  !cases(signalRows([5, 5, 5, 5], 'impressions', { views: 0, contacts: 0 }), {
    signalRules: { reach: 1, viewRate: 1, contactRate: 3 },
  })[0].signals.some((signal) => signal.kind === 'low-reach'),
  'Visible user thresholds must control stable classifications.',
);
const signalFilters = {
  ...defaultGrowthFilters(),
  mode: 'signals',
  signalKinds: ['low-reach'],
  categories: ['A'],
  demand: { min: '100', max: '200' },
  metric: { metric: 'views', min: '9999', max: '10000' },
  extra: { metric: 'viewRate', min: '9999', max: '10000' },
};
assert.equal(
  filterGrowthCases(weak, signalFilters).length,
  1,
  'Hidden manual metric ranges must not affect signals.',
);
for (const patch of [
  { categories: ['B'] },
  { categories: [] },
  { demand: { min: '200', max: '300' } },
  { signalKinds: [] },
  { signalKinds: ['stable-good'] },
  { scope: 'Х7' },
  { search: 'not found' },
])
  assert.equal(
    filterGrowthCases(weak, { ...signalFilters, ...patch }).length,
    0,
    JSON.stringify(patch),
  );
assert.deepEqual(
  restoreGrowthFilters(
    {
      ...signalFilters,
      signalRules: { reach: 50, viewRate: 2.5, contactRate: 10 },
    },
    new URLSearchParams(),
    'И31',
    ['И31', 'Х7'],
  ),
  {
    ...signalFilters,
    signalRules: { reach: 50, viewRate: 2.5, contactRate: 10 },
  },
);
assert.equal(
  restoreGrowthFilters({ duplicatesOnly: true }, new URLSearchParams(), 'И31', [
    'И31',
  ]).mode,
  'duplicates',
  'Old saved duplicate mode must migrate.',
);
const recovered = restoreGrowthFilters(
  {
    mode: 'invalid',
    signalKinds: ['bad', 'low-reach'],
    signalRules: { reach: -1, viewRate: Infinity, contactRate: 200 },
  },
  new URLSearchParams('growthViewFloor=2,5'),
  'И31',
  ['И31'],
);
assert.equal(recovered.mode, 'selection');
assert.deepEqual(recovered.signalKinds, ['low-reach']);
assert.deepEqual(recovered.signalRules, {
  reach: 20,
  viewRate: 2.5,
  contactRate: 100,
});
console.log(
  'Passed: recent/long declines, improvements, stable results, transparent thresholds, sparse/missing data, current-ID history, signal filters and mode migration.',
);
console.log(
  'Passed: latest-report roster, full-period metrics, weighted conversions, persistent ID pairs, independent duplicate mode, filter persistence, observed slider ceilings and coincident-thumb separation.',
);
