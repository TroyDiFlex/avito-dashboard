import { json, putSetting, sameOrigin, setting } from '@/lib/storage';

export async function GET() {
  try { return json({ configured: !!(await setting('appsScriptUrl')), url: await setting('appsScriptUrl') }); }
  catch { return json({ configured: false, error: 'Хранилище настроек недоступно.' }, 503); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { url, token } = await request.json() as { url: string; token: string };
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) return json({ error: 'Нужна ссылка опубликованного Apps Script, заканчивающаяся на /exec.' }, 400);
    if (typeof token !== 'string' || token.length < 24 || token.length > 200) return json({ error: 'Ключ подключения должен содержать от 24 до 200 символов.' }, 400);
    await putSetting('appsScriptToken', token); await putSetting('appsScriptUrl', url);
    return json({ configured: true });
  } catch { return json({ error: 'Не удалось сохранить подключение.' }, 400); }
}
