import { normalize, type RawPayload } from '@/lib/normalize';
import { db, json, putSetting, sameOrigin, saveSnapshot, setting } from '@/lib/storage';

export async function POST(request: Request) {
  let lease: string | null = null;
  try {
    sameOrigin(request);
    const url = await setting('appsScriptUrl'), token = await setting('appsScriptToken');
    if (!url || !token) return json({ error: 'Сначала подключите Google-таблицы в настройках.', needsSetup: true }, 409);
    lease = JSON.stringify({ id: crypto.randomUUID(), expires: Date.now() + 240000 });
    const lock = await db().prepare("INSERT INTO settings (key,value) VALUES ('syncLock',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(json_extract(settings.value,'$.expires') AS INTEGER) < ?").bind(lease, Date.now()).run();
    if (!lock.meta.changes) { lease = null; return json({ error: 'Обновление уже выполняется. Дождитесь его завершения.' }, 409); }
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), signal: AbortSignal.timeout(180000), redirect: 'follow' });
    if (!response.ok) throw new Error('Apps Script недоступен. Проверьте публикацию и права доступа.');
    const raw = await response.json() as RawPayload & { error?: string };
    if (raw.error) throw new Error(raw.error);
    const next = normalize(raw, 'google');
    const errors = next.issues.filter(i => i.severity === 'error');
    if (errors.length) return json({ error: `Новая версия не сохранена: ${errors.length} строк или периодов требуют проверки.`, issues: errors.slice(0, 40) }, 422);
    await saveSnapshot(next); await putSetting('lastSuccess', next.updatedAt);
    return json({ ok: true, updatedAt: next.updatedAt, rows: next.ads.length, warnings: next.issues.length });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Обновление не завершено. Предыдущая версия сохранена.' }, 502); }
  finally { if (lease) await db().prepare("DELETE FROM settings WHERE key='syncLock' AND value=?").bind(lease).run().catch(() => {}); }
}
