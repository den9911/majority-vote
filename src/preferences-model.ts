export const languages = ['en', 'es', 'ru'] as const;
export type Language = (typeof languages)[number];
export type ThemeChoice = 'system' | 'light' | 'dark';
export type ResolvedTheme = Exclude<ThemeChoice, 'system'>;
export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && languages.some(language => language === value);
}
export function resolveLanguage(saved: unknown, preferred: readonly string[] = []): Language {
  if (isLanguage(saved)) return saved;
  for (const value of preferred) {
    const language = String(value).toLowerCase().split(/[-_]/)[0];
    if (isLanguage(language)) return language;
  }
  return 'en';
}
export function resolveTheme(choice: unknown, prefersDark = false): ResolvedTheme {
  return choice === 'dark' || choice === 'light' ? choice : prefersDark ? 'dark' : 'light';
}
