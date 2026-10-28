// Classic script: set preferences before CSS paints, without waiting for a module fetch.
(() => {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('minute:preferences') ?? 'null');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) saved = parsed as Record<string, unknown>;
  } catch { /* Storage may be blocked; browser preferences still work. */ }
  const supported = ['en', 'ru'];
  const preferred = (navigator.languages?.length ? navigator.languages : [navigator.language]).map(value => String(value).toLowerCase().split(/[-_]/)[0] ?? '');
  const language = typeof saved.language === 'string' && supported.includes(saved.language) ? saved.language : preferred.find(value => supported.includes(value)) ?? 'en';
  const choice = saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : 'system';
  const theme = choice === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : choice;
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = language;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.dataset.languageLoading = 'true';
})();
