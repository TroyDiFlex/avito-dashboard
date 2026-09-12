'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Search } from 'lucide-react';
import { Chart, Picker } from '@/components/analytics-ui';
import { Input } from '@/components/ui/input';
import {
  AD_METRICS,
  BRANCH_COLORS,
  METRICS,
  aggregate,
  format,
  shortDate,
  type AdRow,
  type Metric,
  type Metrics,
  type Snapshot,
} from '@/lib/model';
import { adKey, extractArticle } from '@/lib/explore';
const metricChoices = AD_METRICS.map((value) => ({
  value,
  label: METRICS[value].label,
}));

type Listing = {
  key: string;
  rows: AdRow[];
  latest: AdRow;
};
type Part = {
  key: string;
  article: string | null;
  name: string;
  category: string;
  listings: Listing[];
};
type Account = {
  branch: string;
  listings: Listing[];
  rows: { end: string; metrics: Metrics }[];
};

function buildParts(snapshot: Snapshot): Part[] {
  const listingRows = new Map<string, AdRow[]>();
  snapshot.ads.forEach((row) => {
    const key = adKey(row);
    listingRows.set(key, [...(listingRows.get(key) ?? []), row]);
  });
  const parts = new Map<string, Part>();
  listingRows.forEach((unsorted, key) => {
    const rows = [...unsorted].sort((a, b) => a.end.localeCompare(b.end));
    const latest = rows.at(-1)!;
    const article = extractArticle(latest.name).value;
    const partKey = article ? `article:${article}` : `listing:${key}`;
    const current = parts.get(partKey);
    const listing = { key, rows, latest };
    if (current) current.listings.push(listing);
    else {
      parts.set(partKey, {
        key: partKey,
        article,
        name: latest.name,
        category: latest.category,
        listings: [listing],
      });
    }
  });
  return [...parts.values()];
}

function accountsFor(part: Part, from: string, to: string): Account[] {
  const grouped = new Map<string, Listing[]>();
  part.listings.forEach((listing) => {
    const branch = listing.latest.branch;
    grouped.set(branch, [...(grouped.get(branch) ?? []), listing]);
  });
  return [...grouped].map(([branch, listings]) => {
    const dates = [
      ...new Set(
        listings.flatMap((listing) =>
          listing.rows
            .filter((row) => row.end >= from && row.end <= to)
            .map((row) => row.end),
        ),
      ),
    ].sort();
    return {
      branch,
      listings,
      rows: dates.map((end) => {
        const rows = listings.flatMap((listing) =>
          listing.rows.filter((row) => row.end === end),
        );
        const metrics: Metrics = {};
        AD_METRICS.forEach((metric) => {
          metrics[metric] = aggregate(rows, metric);
        });
        return { end, metrics };
      }),
    };
  });
}

function avitoUrl(id: string) {
  return /^\d+$/.test(id) ? `https://www.avito.ru/${id}` : '#';
}

export default function PartExplorer({
  snapshot,
  from,
  to,
  initialScope,
  availableBranches,
}: {
  snapshot: Snapshot;
  from: string;
  to: string;
  initialScope: string;
  availableBranches: string[];
}) {
  const allParts = useMemo(() => buildParts(snapshot), [snapshot]);
  const scopes = useMemo(
    () => [
      { value: 'network', label: 'Все подразделения' },
      ...availableBranches.map((value) => ({ value, label: value })),
    ],
    [availableBranches],
  );
  const [scope, setScope] = useState(
    initialScope === 'network' || availableBranches.includes(initialScope)
      ? initialScope
      : 'network',
  );
  const [metric, setMetric] = useState<Metric>('contacts');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const effectiveScope =
    scope === 'network' || availableBranches.includes(scope) ? scope : 'network';
  const branches = useMemo(
    () => (effectiveScope === 'network' ? availableBranches : [effectiveScope]),
    [availableBranches, effectiveScope],
  );
  const parts = useMemo(
    () =>
      allParts
        .map((part) => {
          const listings = part.listings.filter(
            (listing) =>
              branches.includes(listing.latest.branch) &&
              listing.rows.some((row) => row.end >= from && row.end <= to),
          );
          const rows = listings.flatMap((listing) =>
            listing.rows.filter((row) => row.end >= from && row.end <= to),
          );
          return { ...part, listings, value: aggregate(rows, metric) };
        })
        .filter((part) => {
          const haystack = `${part.article ?? ''} ${part.name} ${part.listings
            .map((listing) => `${listing.latest.id} ${listing.latest.branch}`)
            .join(' ')}`.toLowerCase();
          return part.listings.length > 0 && haystack.includes(search.trim().toLowerCase());
        })
        .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)),
    [allParts, branches, from, to, metric, search],
  );
  const selectedPart = selected ? parts.find((part) => part.key === selected) : null;

  if (selectedPart) {
    return (
      <PartDetail
        part={selectedPart}
        from={from}
        to={to}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="ads-page">
      <section className="catalog-header">
        <div>
          <span className="eyebrow">КАТАЛОГ ОБЪЯВЛЕНИЙ</span>
          <h2>Запчасти и результаты</h2>
          <p>Один артикул — одна строка, независимо от количества аккаунтов.</p>
        </div>
        <strong>{parts.length.toLocaleString('ru-RU')} позиций</strong>
      </section>
      <section className="catalog-toolbar">
        <div className="search-input">
          <Search />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название, артикул или номер объявления"
            aria-label="Поиск объявлений"
          />
        </div>
        <Picker label="Подразделение" value={effectiveScope} onChange={setScope} items={scopes} />
        <Picker
          label="Показатель"
          value={metric}
          onChange={(value) => setMetric(value as Metric)}
          items={metricChoices}
        />
      </section>
      <section className="parts-table panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Запчасть</th>
                <th>Подразделения</th>
                <th>Объявления</th>
                <th>{METRICS[metric].label}</th>
                <th aria-label="Открыть карточку" />
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => {
                const accounts = [...new Set(part.listings.map((listing) => listing.latest.branch))];
                return (
                  <tr key={part.key} onClick={() => setSelected(part.key)}>
                    <td>
                      <strong>{part.name}</strong>
                      <small>{part.article ? `Артикул ${part.article}` : `№ ${part.listings[0].latest.id}`}</small>
                    </td>
                    <td>
                      <div className="account-list">
                        {accounts.map((account) => (
                          <span key={account}><i style={{ background: BRANCH_COLORS[account] }} />{account}</span>
                        ))}
                      </div>
                    </td>
                    <td>{part.listings.length}</td>
                    <td><b>{format(part.value, metric)}</b></td>
                    <td><ArrowRight /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!parts.length && <div className="empty-table">Ничего не найдено.</div>}
      </section>
    </div>
  );
}

function PartDetail({
  part,
  from,
  to,
  onBack,
}: {
  part: Part;
  from: string;
  to: string;
  onBack: () => void;
}) {
  const [metric, setMetric] = useState<Metric>('contacts');
  const accounts = useMemo(() => accountsFor(part, from, to), [part, from, to]);
  const dates = [...new Set(accounts.flatMap((account) => account.rows.map((row) => row.end)))].sort();
  const chartData = dates.map((date) => {
    const row: Record<string, unknown> = { date };
    accounts.forEach((account) => {
      row[account.branch] = account.rows.find((item) => item.end === date)?.metrics[metric] ?? null;
    });
    return row;
  });
  return (
    <div className="part-detail">
      <button className="back-button" onClick={onBack}><ArrowLeft />Все запчасти</button>
      <section className="part-heading">
        <div>
          <span className="eyebrow">{part.article ? `АРТИКУЛ ${part.article}` : 'ОБЪЯВЛЕНИЕ'}</span>
          <h2>{part.name}</h2>
          <p>{part.category}</p>
        </div>
        <span>{accounts.length} подразделений · {part.listings.length} объявлений</span>
      </section>

      <section className="listing-links">
        {accounts.map((account) => (
          <article key={account.branch}>
            <header><i style={{ background: BRANCH_COLORS[account.branch] }} /><strong>{account.branch}</strong></header>
            {account.listings.map((listing) => (
              <a key={listing.key} href={avitoUrl(listing.latest.id)} target="_blank" rel="noreferrer">
                <span>Объявление № {listing.latest.id}</span><ExternalLink />
              </a>
            ))}
          </article>
        ))}
      </section>

      <section className="part-chart panel">
        <div className="section-heading">
          <div><span className="eyebrow">ВСЕ ПОДРАЗДЕЛЕНИЯ</span><h2>{METRICS[metric].label}</h2></div>
          <Picker
            label="Показатель графика"
            value={metric}
            onChange={(value) => setMetric(value as Metric)}
            items={metricChoices}
          />
        </div>
        <Chart
          data={chartData}
          series={accounts.map((account) => ({
            key: account.branch,
            label: account.branch,
            color: BRANCH_COLORS[account.branch],
          }))}
          metric={metric}
        />
      </section>

      <section className="account-cards">
        {accounts.map((account) => {
          const latest = account.rows.at(-1);
          return (
            <article key={account.branch}>
              <header><i style={{ background: BRANCH_COLORS[account.branch] }} /><h3>{account.branch}</h3><span>{latest ? shortDate(latest.end) : '—'}</span></header>
              <div>
                {(['views', 'contacts', 'contactRate', 'spend'] as Metric[]).map((item) => (
                  <span key={item}><small>{METRICS[item].label}</small><strong>{format(latest?.metrics[item], item)}</strong></span>
                ))}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
