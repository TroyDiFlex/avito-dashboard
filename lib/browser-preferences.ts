export function readBrowserPreference(key: string): Record<string, unknown> {
  if (typeof window === 'undefined') return {};
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    return saved && typeof saved === 'object' && !Array.isArray(saved)
      ? saved
      : {};
  } catch {
    return {};
  }
}

export function saveBrowserPreference(
  key: string,
  value: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Device preferences are optional. */
  }
}

export function replaceUrlParameters(values: Record<string, string | null>) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  Object.entries(values).forEach(([key, value]) => {
    if (value == null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  });
  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  );
}
