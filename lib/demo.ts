import type { AdRow, Snapshot, StatRow } from './model';

const branches = ['И31', 'Х7', 'Автово', 'Б116', 'Ворошилова'];
const names = [
  'Клапанная крышка BMW N47 11128507607',
  'Коллектор впускной Mercedes M273 A2731400701',
  'Корпус масляного фильтра BMW N20 11428683206',
  'Термостат Audi Volkswagen 06L121111H',
  'Турбокомпрессор Mercedes OM651 A6510906380',
  'Насос охлаждения BMW B48 11518638026',
];
const iso = (date: Date) => date.toISOString().slice(0, 10);

export function demoSnapshot(): Snapshot {
  const stats: StatRow[] = [];
  const ads: AdRow[] = [];
  for (let week = 0; week < 24; week++) {
    const endDate = new Date(Date.UTC(2026, 2, 23 + week * 7));
    const end = iso(endDate);
    const start = iso(new Date(endDate.getTime() - 6 * 86400000));
    branches.forEach((branch, branchIndex) => {
      const wave = 1 + Math.sin((week + branchIndex) / 3.2) * 0.13;
      const impressions = Math.round(
        (1900 + branchIndex * 430 + week * 34) * wave,
      );
      const views = Math.round(impressions * (0.14 + branchIndex * 0.008));
      const contacts = Math.round(
        views * (0.055 + ((week + branchIndex) % 4) * 0.004),
      );
      const spend = Math.round(impressions * (0.92 + branchIndex * 0.08));
      stats.push({
        branch,
        end,
        start,
        label: `${start}–${end}`,
        metrics: {
          impressions,
          views,
          viewRate: views / impressions,
          contacts,
          contactRate: contacts / views,
          favorites: Math.round(views * 0.08),
          spend,
          viewCost: spend / views,
          contactCost: spend / contacts,
          marginParts: 180000 + branchIndex * 26000 + week * 4100,
          marginService: 95000 + branchIndex * 12000 + week * 2600,
          margin: 275000 + branchIndex * 38000 + week * 6700,
          roi: 8.4 + branchIndex * 0.7 + week * 0.11,
          rating: 4.8 + branchIndex * 0.03,
          reviews: 92 + branchIndex * 17 + week * 2,
          lowReviews: (week + branchIndex) % 3,
          responseTime: 36 + branchIndex * 9,
          active: 145 + branchIndex * 18 + week,
          unpublished: 3 + ((week + branchIndex) % 5),
          archived: 42 + branchIndex * 6,
          stock: 620000 + branchIndex * 73000 + week * 8500,
        },
        source: 'Демонстрационные данные',
        row: branchIndex + 1,
        column: week + 1,
      });
      names.forEach((name, adIndex) => {
        const adViews = Math.round((26 + adIndex * 7 + branchIndex * 4) * wave);
        const adContacts = Math.max(
          0,
          Math.round(adViews * (0.045 + adIndex * 0.005)),
        );
        ads.push({
          branch,
          id: `${branchIndex + 1}-${adIndex + 1}`,
          end,
          name,
          category: 'Запчасти для автомобилей',
          price: 5990 + adIndex * 2750 + branchIndex * 190,
          metrics: {
            impressions: adViews * 7,
            views: adViews,
            viewRate: 1 / 7,
            contacts: adContacts,
            contactRate: adViews ? adContacts / adViews : 0,
            favorites: Math.round(adViews * 0.09),
            spend: Math.round(adViews * 7.5),
          },
          source: 'Демонстрационные данные',
          row: adIndex + 1,
          profile: branch,
        });
      });
    });
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    mode: 'demo',
    stats,
    ads,
    issues: [],
    sources: ['Демонстрационные данные'],
    rawAdCount: ads.length,
  };
}
