import { index, sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
export const snapshotChunks = sqliteTable(
  'snapshot_chunks',
  {
    id: text('id').primaryKey(),
    snapshot: text('snapshot').notNull(),
    ordinal: integer('ordinal').notNull(),
    value: text('value').notNull(),
  },
  (table) => [
    index('idx_snapshot_chunks_snapshot_ordinal').on(
      table.snapshot,
      table.ordinal,
    ),
  ],
);
