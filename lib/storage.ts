import { env } from 'cloudflare:workers';
import type { Snapshot } from './model';

export function db() {
  return env.DB as D1Database;
}
export async function setting(key: string): Promise<string | null> {
  return (
    (
      await db()
        .prepare('SELECT value FROM settings WHERE key = ?')
        .bind(key)
        .first<{ value: string }>()
    )?.value ?? null
  );
}
export async function putSetting(key: string, value: string) {
  await db()
    .prepare(
      'INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    )
    .bind(key, value)
    .run();
}
export async function readSnapshot(): Promise<Snapshot | null> {
  const active = await setting('active');
  if (!active) return null;
  const { results } = await db()
    .prepare(
      'SELECT value FROM snapshot_chunks WHERE snapshot = ? ORDER BY ordinal',
    )
    .bind(active)
    .all<{ value: string }>();
  if (!results.length) throw new Error('Сохранённая версия недоступна.');
  return JSON.parse(results.map((x) => x.value).join(''));
}
export async function saveSnapshot(snapshot: Snapshot) {
  const previous = await setting('active');
  const id = crypto.randomUUID(),
    serialized = JSON.stringify(snapshot),
    commands = [];
  // Bound each D1 row. Publish only after all chunks are durable.
  for (
    let offset = 0, ordinal = 0;
    offset < serialized.length;
    offset += 60000, ordinal++
  ) {
    commands.push(
      db()
        .prepare(
          'INSERT INTO snapshot_chunks (id,snapshot,ordinal,value) VALUES (?,?,?,?)',
        )
        .bind(
          `${id}:${ordinal}`,
          id,
          ordinal,
          serialized.slice(offset, offset + 60000),
        ),
    );
  }
  for (let i = 0; i < commands.length; i += 30)
    await db().batch(commands.slice(i, i + 30));
  await putSetting('active', id);
  // Keep exactly the active and previous versions for recovery.
  if (previous)
    await db()
      .prepare(
        'DELETE FROM snapshot_chunks WHERE snapshot != ? AND snapshot != ?',
      )
      .bind(id, previous)
      .run();
  else
    await db()
      .prepare('DELETE FROM snapshot_chunks WHERE snapshot != ?')
      .bind(id)
      .run();
  return id;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new Error('Обновление доступно только из дашборда.');
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
