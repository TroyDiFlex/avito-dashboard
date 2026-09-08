import fs from 'node:fs/promises';
import ts from 'typescript';
await fs.mkdir('private/compiled', { recursive: true });
for (const name of ['model', 'normalize']) {
  const source = await fs.readFile(`lib/${name}.ts`, 'utf8');
  const out = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replaceAll("'./model'", "'./model.js'");
  await fs.writeFile(`private/compiled/${name}.js`, out);
}
const { normalize } = await import('../private/compiled/normalize.js');
const snapshot = normalize(JSON.parse(await fs.readFile('private/raw.json', 'utf8')), 'excel');
await fs.mkdir('public/data', { recursive: true });
await fs.writeFile('public/data/snapshot.json', JSON.stringify(snapshot));
const groups = {};
for (const issue of snapshot.issues) groups[issue.code] = (groups[issue.code] || 0) + 1;
console.log(JSON.stringify({ records: snapshot.ads.length, sourceRecords: snapshot.rawAdCount, stats: snapshot.stats.length, issues: groups, errors: snapshot.issues.filter(i => i.severity === 'error').slice(0, 8) }, null, 2));
