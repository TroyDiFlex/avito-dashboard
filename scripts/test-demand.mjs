import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

await fs.mkdir('private/compiled', { recursive: true });
const source = await fs.readFile('lib/demand.ts', 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
await fs.writeFile('private/compiled/demand.js', output);

const { demandForArticle, normalizeDemandArticle, parseDemandAnalysis } =
  await import('../private/compiled/demand.js');

assert.equal(normalizeDemandArticle(' 03l115389hVRN '), '03L115389H');
assert.equal(normalizeDemandArticle('11428596283'), '11428596283');

const parsed = parseDemandAnalysis(
  '03L115389HVRN\t66\tA\n11428596283VRN\t569\tC\n1113761512VRN\t\tAN\nBAD\t42\nA6511801310VRN\tошибка',
);
assert.deepEqual(parsed.values, {
  '03L115389H': 66,
  11428596283: 569,
  1113761512: null,
});
assert.deepEqual(parsed.categories, {
  '03L115389H': 'A',
  11428596283: 'C',
  1113761512: 'AN',
});
assert.equal(parsed.recognized, 3);
assert.equal(parsed.withValue, 2);
assert.equal(parsed.withoutValue, 1);
assert.equal(parsed.withCategory, 3);
assert.equal(parsed.invalid, 2);

const markdown = parseDemandAnalysis(`| Артикул | Спрос | Категория |
| --- | :-: | --- |
| **338004A700VRN** | 65 | A |
| | | |
| **713610760VRN** | 40 | C |
| **LR013149VRN** | 45 | B Также текст |`);
assert.deepEqual(markdown.values, {
  '338004A700': 65,
  713610760: 40,
  LR013149: 45,
});
assert.deepEqual(markdown.categories, {
  '338004A700': 'A',
  713610760: 'C',
  LR013149: 'B',
});
assert.equal(markdown.invalid, 0);
assert.deepEqual(demandForArticle(parsed.values, '03l115389h'), {
  found: true,
  value: 66,
});
assert.deepEqual(demandForArticle(parsed.values, 'missing'), {
  found: false,
  value: null,
});

console.log('Passed: demand table parsing, VRN removal and blank values.');
