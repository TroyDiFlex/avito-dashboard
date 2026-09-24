import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

await fs.mkdir('private/compiled', { recursive: true });
for (const name of ['model', 'explore', 'insights']) {
  const source = await fs.readFile(`lib/${name}.ts`, 'utf8');
  const output = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replaceAll("'./model'", "'./model.js'")
    .replaceAll("'./explore'", "'./explore.js'");
  await fs.writeFile(`private/compiled/${name}.js`, output);
}

const { acceptedByFalseDiscoveryRate, buildInsightReport } =
  await import('../private/compiled/insights.js');

const dates = [
  '2026-07-13',
  '2026-07-20',
  '2026-07-27',
  '2026-08-03',
  '2026-08-10',
  '2026-08-17',
  '2026-08-24',
  '2026-08-31',
];

function ad({
  branch = 'И31',
  id = '1',
  name = 'Деталь BMW 11128507607',
  end,
  impressions = 250,
  views = 25,
  contacts = 5,
}) {
  return {
    branch,
    id,
    end,
    name,
    category: 'Запчасти',
    price: 10000,
    metrics: {
      impressions,
      views,
      contacts,
      viewRate: impressions ? views / impressions : null,
      contactRate: views ? contacts / views : null,
      favorites: 0,
      spend: 100,
    },
    source: 'test',
    row: 1,
    profile: 'test',
  };
}

function snapshot(ads) {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    mode: 'demo',
    stats: [],
    ads,
    issues: [],
    sources: ['test'],
    rawAdCount: ads.length,
  };
}

function report(ads, branches = ['И31']) {
  return buildInsightReport(snapshot(ads), {
    from: dates[0],
    to: dates.at(-1),
    availableBranches: branches,
    scope: 'network',
  });
}

assert.deepEqual(
  [...acceptedByFalseDiscoveryRate([0.001, 0.01, 0.2], 0.05)],
  [0, 1],
);

const clearContactDrop = dates.map((end, index) =>
  ad({ end, contacts: index < 4 ? 5 : 0, views: index < 4 ? 25 : 10 }),
);
const clearContactDropInsight = report(clearContactDrop).insights.find(
  (insight) => insight.kind === 'contact-rate-drop',
);
assert.ok(
  clearContactDropInsight,
  'A stable 20% baseline followed by zero contacts with four expected contacts must be shown.',
);
assert.equal(
  clearContactDropInsight.reportCount,
  dates.length,
  'The card must expose the number of source reports used in the calculation.',
);

const tooLittleForZeroConclusion = dates.map((end, index) =>
  ad({
    end,
    contacts: index < 4 ? (index % 2 ? 3 : 2) : 0,
    views: index < 4 ? 25 : 5,
  }),
);
assert.ok(
  !report(tooLittleForZeroConclusion).insights.some(
    (insight) => insight.kind === 'contact-rate-drop',
  ),
  'Zero out of 20 must not be treated as a decline when the baseline only implies two expected contacts.',
);

const oneOfOne = [
  ad({
    end: dates.at(-1),
    id: '2',
    name: 'Деталь BMW 11428683206',
    impressions: 5,
    views: 1,
    contacts: 1,
  }),
];
assert.ok(
  !report(oneOfOne).insights.some(
    (insight) =>
      insight.kind === 'peer-winner' ||
      insight.kind === 'portfolio-winner' ||
      insight.kind === 'contact-rate-drop',
  ),
  'One contact from one view is not sufficient for a performance conclusion.',
);

const reachDrop = dates.map((end, index) =>
  ad({
    end,
    id: '3',
    name: 'Деталь BMW 11518638026',
    impressions: index < 4 ? 240 : 55,
    views: index < 4 ? 24 : 6,
    contacts: index < 4 ? 4 : 1,
  }),
);
assert.ok(
  report(reachDrop).insights.some((insight) => insight.kind === 'reach-drop'),
  'Two consecutive large reach drops against a stable baseline must be shown.',
);

const incompleteCurrentWindow = reachDrop.slice(0, 5);
assert.ok(
  !report(incompleteCurrentWindow).insights.some(
    (insight) => insight.kind === 'reach-drop',
  ),
  'A missing current report must not be treated as zero reach.',
);

const persistentNoResult = dates.slice(0, 6).map((end) =>
  ad({
    end,
    id: '4',
    name: 'Деталь BMW 17118615963',
    impressions: 20,
    views: 2,
    contacts: 0,
  }),
);
assert.ok(
  report(persistentNoResult).insights.some(
    (insight) => insight.kind === 'persistent-no-result',
  ),
  'Six reports without a contact must be shown as a persistent lack of result without claiming a conversion cause.',
);
assert.ok(
  !report(persistentNoResult.slice(0, 5)).insights.some(
    (insight) => insight.kind === 'persistent-no-result',
  ),
  'Five reports are not enough for a persistent no-result conclusion.',
);

const portfolioViewGap = [
  ...dates.map((end) =>
    ad({
      branch: 'И31',
      id: '40',
      name: 'Слабая карточка BMW 13718518111',
      end,
      impressions: 250,
      views: 5,
      contacts: 0,
    }),
  ),
  ...['41', '42'].flatMap((id) =>
    dates.map((end) =>
      ad({
        branch: 'И31',
        id,
        name: `Обычная карточка BMW 1371851811${id}`,
        end,
        impressions: 250,
        views: 50,
        contacts: 3,
      }),
    ),
  ),
];
const portfolioViewGapInsight = report(portfolioViewGap).insights.find(
  (insight) =>
    insight.kind === 'portfolio-view-gap' && insight.listingId === '40',
);
assert.ok(
  portfolioViewGapInsight,
  'A repeatedly weak view rate with enough impressions must be compared with the branch portfolio.',
);
assert.match(
  portfolioViewGapInsight.current,
  /^.+ просмотров из .+ показов · /,
  'The actual result must name views and impressions.',
);
assert.match(
  portfolioViewGapInsight.comparison,
  /% просмотров от показов$/,
  'The comparison rate must explain that it is views divided by impressions.',
);

const peerRows = ['И31', 'Х7', 'Автово'].flatMap((branch, branchIndex) =>
  dates.map((end) =>
    ad({
      branch,
      id: String(branchIndex + 10),
      name: 'Корпус фильтра BMW 11428585235',
      end,
      views: branch === 'И31' ? 10 : 20,
      contacts: branch === 'И31' ? 0 : 5,
      impressions: branch === 'И31' ? 100 : 200,
    }),
  ),
);
assert.ok(
  report(peerRows, ['И31', 'Х7', 'Автово']).insights.some(
    (insight) => insight.kind === 'peer-gap' && insight.branch === 'И31',
  ),
  'A branch with enough views and zero contacts must be flagged when multiple peers confirm demand.',
);

const winnerRows = ['И31', 'Х7', 'Автово'].flatMap((branch, branchIndex) =>
  dates.map((end) =>
    ad({
      branch,
      id: String(branchIndex + 20),
      name: 'Клапанная крышка BMW 11127588412',
      end,
      views: 20,
      contacts: branch === 'И31' ? 8 : 2,
      impressions: 200,
    }),
  ),
);
assert.ok(
  report(winnerRows, ['И31', 'Х7', 'Автово']).insights.some(
    (insight) =>
      (insight.kind === 'peer-winner' || insight.kind === 'portfolio-winner') &&
      insight.branch === 'И31',
  ),
  'A high-volume listing may be shown as a positive example when it reliably beats peers.',
);

console.log(
  'Passed: insufficient samples abstain; persistent, own-history, portfolio, peer and winner signals require evidence.',
);
