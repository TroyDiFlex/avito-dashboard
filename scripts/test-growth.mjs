import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

await fs.mkdir('private/compiled', { recursive: true });
for (const name of ['model', 'explore', 'demand', 'growth']) {
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
    .replaceAll("'./demand'", "'./demand.js'");
  await fs.writeFile(`private/compiled/${name}.js`, output);
}

const { buildGrowthCases, DEFAULT_GROWTH_RULES } =
  await import('../private/compiled/growth.js');

function ad({
  id,
  end,
  impressions = 0,
  views = 0,
  contacts = 0,
  branch = 'И31',
  article = '11121432928',
}) {
  return {
    branch,
    id,
    end,
    name: `Деталь BMW ${article}`,
    category: 'Запчасти',
    price: 10000,
    metrics: { impressions, views, contacts },
    source: 'test',
    row: 1,
    profile: 'test',
  };
}

function cases(ads, demand = 193, category = 'A') {
  return buildGrowthCases(
    {
      version: 1,
      updatedAt: new Date().toISOString(),
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
      branches: ['И31'],
      demandByArticle: { 11121432928: demand },
      categoryByArticle: { 11121432928: category },
      rules: DEFAULT_GROWTH_RULES,
    },
  );
}

const oldRows = ['2026-01-05', '2026-01-12', '2026-01-19'].map((end) =>
  ad({ id: '100', end, impressions: 500, views: 50, contacts: 5 }),
);
const newRows = ['2026-02-02', '2026-02-09', '2026-02-16', '2026-02-23'].map(
  (end) => ad({ id: '200', end }),
);
const recreated = cases([...oldRows, ...newRows]);
assert.equal(recreated.length, 1, 'One branch and article must render once.');
assert.deepEqual(recreated[0].currentIds, ['200']);
assert.deepEqual(recreated[0].previousIds, ['100']);
assert.equal(recreated[0].reportCount, 4);
assert.equal(
  recreated[0].impressions,
  0,
  'Old reach must not leak into the new ID.',
);
assert.ok(
  recreated[0].signals.some((signal) => signal.kind === 'no-impressions'),
);
assert.equal(recreated[0].demand, 193);
assert.equal(recreated[0].category, 'A');

const tooNew = cases([...oldRows, ...newRows.slice(0, 2)]);
assert.equal(tooNew[0].state, 'waiting');
assert.equal(tooNew[0].signals.length, 0);

const duplicate = cases([
  ...oldRows,
  ad({ id: '300', end: '2026-03-02', impressions: 20 }),
  ad({ id: '301', end: '2026-03-02', impressions: 20 }),
]);
assert.deepEqual(duplicate[0].currentIds, ['300', '301']);
assert.deepEqual(
  duplicate[0].signals.map((signal) => signal.kind),
  ['duplicate'],
);

console.log(
  'Passed: current listing generations stay separate, new IDs wait for data, and same-date duplicates remain explicit.',
);
