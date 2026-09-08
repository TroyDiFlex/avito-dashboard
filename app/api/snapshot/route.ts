import { json, readSnapshot } from '@/lib/storage';
export async function GET() {
  try { const snapshot = await readSnapshot(); return snapshot ? json(snapshot) : json({ empty: true }, 404); }
  catch { return json({ error: 'Не удалось прочитать сохранённые данные.' }, 503); }
}
