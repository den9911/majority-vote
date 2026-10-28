export const languages = ['en', 'ru'];
export function isLanguage(value) {
    return typeof value === 'string' && languages.some(language => language === value);
}
export function resolveLanguage(saved, preferred = []) {
    if (isLanguage(saved))
        return saved;
    for (const value of preferred) {
        const language = String(value).toLowerCase().split(/[-_]/)[0];
        if (isLanguage(language))
            return language;
    }
    return 'en';
}
export function resolveTheme(choice, prefersDark = false) {
    return choice === 'dark' || choice === 'light' ? choice : prefersDark ? 'dark' : 'light';
}
