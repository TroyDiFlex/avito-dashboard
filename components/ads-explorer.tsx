'use client';

import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChartNoAxesCombined,
  ExternalLink,
  Plus,
  RotateCcw,
  Search,
} from 'lucide-react';
import { Chart, Picker, Spark } from '@/components/analytics-ui';
import { Input } from '@/components/ui/input';
import {
  AD_METRICS,
  BRANCH_COLORS,
  METRICS,
  aggregate,
  contactCostPriceShare,
  format,
  type AdRow,
  type Metric,
  type Metrics,
  type Snapshot,
} from '@/lib/model';

const TOP_LIMIT = 10;
const CHART_LIMIT = 20;
const PAGE_SIZE = 50;
const RANK_METRICS: Metric[] = [
  'contacts',
  'views',
  'favorites',
  'contactRate',
  'impressions',
  'spend',
];
const TABLE_METRICS: Metric[] = [
  'impressions',
  'views',
  'contacts',
  'contactRate',
  'favorites',
  'spend',
];
const LINE_COLORS = [
  '#ef3340',
  '#38bdf8',
  '#22c55e',
  '#f59e0b',
  '#a78bfa',
  '#f472b6',
  '#2dd4bf',
  '#fb923c',
  '#818cf8',
  '#a3e635',
  '#f43f5e',
  '#06b6d4',
  '#84cc16',
  '#eab308',
  '#c084fc',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#65a30d',
];

type Listing = {
  key: string;
  id: string;
  name: string;
  category: string;
  price: number | null;
  rows: AdRow[];
  metrics: Metrics;
  rankValue: number | null;
  trend: (number | null)[];
};

function avitoUrl(id: string) {
  return /^\d+$/.test(id) ? `https://www.avito.ru/${id}` : null;
}

function buildListings(
  snapshot: Snapshot,
  branch: string,
  from: string,
  to: string,
  rankMetric: Metric,
): Listing[] {
  const grouped = new Map<string, AdRow[]>();
  snapshot.ads
    .filter((row) => row.branch === branch && row.end >= from && row.end <= to)
    .forEach((row) =>
      grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]),
    );

  return [...grouped.entries()]
    .map(([id, unsorted]) => {
      const rows = [...unsorted].sort((a, b) => a.end.localeCompare(b.end));
      const latest = rows.at(-1)!;
      const metrics: Metrics = {};
      AD_METRICS.forEach((metric) => {
        metrics[metric] = aggregate(rows, metric);
      });
      const valuesByDate = new Map<string, AdRow[]>();
      rows.forEach((row) => {
        valuesByDate.set(row.end, [...(valuesByDate.get(row.end) ?? []), row]);
      });
      return {
        key: `${branch}:${id}`,
        id,
        name: latest.name,
        category: latest.category,
        price: latest.price,
        rows,
        metrics,
        rankValue: metrics[rankMetric] ?? null,
        trend: [...valuesByDate.keys()]
          .sort()
          .map((date) => aggregate(valuesByDate.get(date)!, rankMetric)),
      };
    })
    .sort((a, b) => {
      const difference =
        (b.rankValue ?? -Infinity) - (a.rankValue ?? -Infinity);
      return difference || a.name.localeCompare(b.name, 'ru');
    });
}

export default function AdsExplorer({
  snapshot,
  from,
  to,
  initialBranch,
  availableBranches,
  onOpenPart,
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  initialBranch: string;
  availableBranches: string[];
  onOpenPart: (ad: Pick<AdRow, 'branch' | 'id'>) => void;
}) {
  const [branch, setBranch] = useState(
    availableBranches.includes(initialBranch)
      ? initialBranch
      : (availableBranches[0] ?? ''),
  );
  const [rankMetric, setRankMetric] = useState<Metric>('contacts');
  const [search, setSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[] | null>(null);
  const [page, setPage] = useState(1);
  const effectiveBranch = availableBranches.includes(branch)
    ? branch
    : (availableBranches[0] ?? '');
  const listings = useMemo(
    () => buildListings(snapshot, effectiveBranch, from, to, rankMetric),
    [snapshot, effectiveBranch, from, to, rankMetric],
  );
  const query = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      query
        ? listings.filter((listing) =>
            `${listing.name} ${listing.id} ${listing.category}`
              .toLowerCase()
              .includes(query),
          )
        : listings,
    [listings, query],
  );
  const rankByKey = useMemo(
    () => new Map(listings.map((listing, index) => [listing.key, index + 1])),
    [listings],
  );
  const topKeys = listings.slice(0, TOP_LIMIT).map((listing) => listing.key);
  const chartKeys = selectedKeys ?? topKeys;
  const listingByKey = new Map(
    listings.map((listing) => [listing.key, listing]),
  );
  const chartListings = chartKeys
    .map((key) => listingByKey.get(key))
    .filter((listing): listing is Listing => Boolean(listing));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const chartDates = [
    ...new Set(
      chartListings.flatMap((listing) => listing.rows.map((row) => row.end)),
    ),
  ].sort();
  const chartData = chartDates.map((date) => {
    const point: Record<string, unknown> = { date };
    chartListings.forEach((listing) => {
      const rows = listing.rows.filter((row) => row.end === date);
      point[listing.key] = rows.length ? aggregate(rows, rankMetric) : null;
    });
    return point;
  });

  function changeBranch(value: string) {
    setBranch(value);
    setSelectedKeys(null);
    setPage(1);
  }

  function changeRankMetric(metric: Metric) {
    setRankMetric(metric);
    setSelectedKeys(null);
    setPage(1);
  }

  function toggleListing(key: string) {
    const base = selectedKeys ?? topKeys;
    if (base.includes(key)) {
      setSelectedKeys(base.filter((item) => item !== key));
      return;
    }
    if (base.length >= CHART_LIMIT) return;
    setSelectedKeys([...base, key]);
  }

  return (
    <div className="listing-analytics-page">
      <section className="catalog-header listing-analytics-header">
        <div>
          <span className="eyebrow">СТАТИСТИКА ОБЪЯВЛЕНИЙ</span>
          <h2>Что приносит результат</h2>
          <p>
            Одна строка — одно объявление. Рейтинг рассчитан за выбранный
            период.
          </p>
        </div>
        <div className="listing-branch-picker">
          <span>Подразделение</span>
          <Picker
            label="Подразделение"
            value={effectiveBranch}
            onChange={changeBranch}
            items={availableBranches.map((value) => ({ value, label: value }))}
          />
        </div>
      </section>

      <section className="rank-controls panel">
        <div>
          <span className="eyebrow">ПОКАЗАТЬ ЛИДЕРОВ</span>
          <div className="rank-switch" aria-label="Показатель рейтинга">
            {RANK_METRICS.map((metric) => (
              <button
                key={metric}
                className={rankMetric === metric ? 'active' : ''}
                onClick={() => changeRankMetric(metric)}
                aria-pressed={rankMetric === metric}
              >
                {METRICS[metric].label}
              </button>
            ))}
          </div>
        </div>
        <span className="rank-total">
          <strong>{listings.length.toLocaleString('ru-RU')}</strong>
          объявлений в рейтинге
        </span>
      </section>

      <section className="listing-chart-panel panel">
        <div className="section-heading listing-chart-heading">
          <div>
            <span className="eyebrow">
              {selectedKeys === null
                ? `ТОП-${Math.min(TOP_LIMIT, listings.length)}`
                : 'РУЧНОЙ ВЫБОР'}{' '}
              · {effectiveBranch}
            </span>
            <h2>
              {selectedKeys === null
                ? `Лидеры по показателю «${METRICS[rankMetric].label}»`
                : `Сравнение по показателю «${METRICS[rankMetric].label}»`}
            </h2>
          </div>
          <div className="chart-selection-state">
            <span>
              {chartListings.length} из {CHART_LIMIT} на графике
            </span>
            {selectedKeys !== null && (
              <button onClick={() => setSelectedKeys(null)}>
                <RotateCcw />
                Вернуть топ-10
              </button>
            )}
          </div>
        </div>
        <Chart
          data={chartData}
          series={chartListings.map((listing, index) => ({
            key: listing.key,
            label: `№ ${listing.id} · ${listing.name}`,
            color: LINE_COLORS[index],
          }))}
          metric={rankMetric}
        />
        {!!chartListings.length && (
          <div className="listing-chart-legend">
            {chartListings.map((listing, index) => (
              <button
                key={listing.key}
                onClick={() => toggleListing(listing.key)}
                title="Убрать с графика"
              >
                <i style={{ background: LINE_COLORS[index] }} />
                <span>{rankByKey.get(listing.key)}</span>
                <strong>{listing.name}</strong>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="listing-table-panel panel">
        <div className="listing-table-toolbar">
          <div>
            <span className="eyebrow">ПОЛНЫЙ РЕЙТИНГ</span>
            <h2>Все объявления</h2>
          </div>
          <div className="search-input">
            <Search />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Название или номер объявления"
              aria-label="Поиск объявлений"
            />
          </div>
        </div>
        <div className="table-scroll">
          <table className="listing-rank-table">
            <thead>
              <tr>
                <th>График</th>
                <th>Место</th>
                <th>Объявление</th>
                {TABLE_METRICS.map((metric) => (
                  <th
                    key={metric}
                    className={rankMetric === metric ? 'ranked-column' : ''}
                  >
                    {METRICS[metric].label}
                  </th>
                ))}
                <th>Динамика</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((listing) => {
                const selected = chartKeys.includes(listing.key);
                const url = avitoUrl(listing.id);
                const contactPriceShare = contactCostPriceShare(
                  listing.metrics.spend,
                  listing.metrics.contacts,
                  listing.price,
                );
                return (
                  <tr
                    key={listing.key}
                    className={selected ? 'selected-for-chart' : ''}
                  >
                    <td>
                      <button
                        className="listing-chart-toggle"
                        onClick={() => toggleListing(listing.key)}
                        disabled={!selected && chartKeys.length >= CHART_LIMIT}
                        aria-label={`${selected ? 'Убрать' : 'Добавить'} объявление № ${listing.id} ${selected ? 'с' : 'на'} график`}
                        title={
                          !selected && chartKeys.length >= CHART_LIMIT
                            ? `На графике может быть не больше ${CHART_LIMIT} объявлений`
                            : selected
                              ? 'Убрать с графика'
                              : 'Добавить на график'
                        }
                      >
                        {selected ? <Check /> : <Plus />}
                      </button>
                    </td>
                    <td>
                      <span className="listing-rank">
                        {rankByKey.get(listing.key)}
                      </span>
                    </td>
                    <td>
                      <strong>{listing.name}</strong>
                      <small>
                        № {listing.id}
                        {listing.price != null
                          ? ` · ${format(listing.price, 'spend')}`
                          : ''}
                      </small>
                      <span className="listing-row-actions">
                        {url && (
                          <a href={url} target="_blank" rel="noreferrer">
                            <ExternalLink />
                            Открыть на Avito
                          </a>
                        )}
                        <button
                          onClick={() =>
                            onOpenPart({
                              branch: effectiveBranch,
                              id: listing.id,
                            })
                          }
                        >
                          <ChartNoAxesCombined />В других подразделениях
                        </button>
                      </span>
                    </td>
                    {TABLE_METRICS.map((metric) => (
                      <td
                        key={metric}
                        className={rankMetric === metric ? 'ranked-column' : ''}
                      >
                        <b>{format(listing.metrics[metric], metric)}</b>
                        {metric === 'spend' && (
                          <small
                            className="contact-price-share"
                            title="Стоимость контакта: расходы ÷ контакты. Доля цены: стоимость контакта ÷ цена объявления"
                          >
                            <span>
                              Контакт:{' '}
                              <strong>
                                {format(
                                  listing.metrics.contactCost,
                                  'contactCost',
                                )}
                              </strong>
                            </span>
                            <span>
                              {contactPriceShare == null
                                ? '— от цены'
                                : `${format(contactPriceShare, 'contactRate')} от цены`}
                            </span>
                          </small>
                        )}
                      </td>
                    ))}
                    <td>
                      <Spark
                        values={listing.trend}
                        color={BRANCH_COLORS[effectiveBranch]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length ? (
          <div className="empty-table">Ничего не найдено.</div>
        ) : (
          <footer className="listing-pagination">
            <span>
              Показаны{' '}
              {((currentPage - 1) * PAGE_SIZE + 1).toLocaleString('ru-RU')}–
              {Math.min(
                currentPage * PAGE_SIZE,
                filtered.length,
              ).toLocaleString('ru-RU')}{' '}
              из {filtered.length.toLocaleString('ru-RU')}
            </span>
            <div>
              <button
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
                aria-label="Предыдущая страница"
              >
                <ArrowLeft />
              </button>
              <strong>
                {currentPage} / {pageCount}
              </strong>
              <button
                disabled={currentPage === pageCount}
                onClick={() => setPage(currentPage + 1)}
                aria-label="Следующая страница"
              >
                <ArrowRight />
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}
