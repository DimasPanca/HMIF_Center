export type Theme = 'light' | 'dark' | 'system';

type ResolvedTheme = Exclude<Theme, 'system'>;

const THEME_STORAGE_KEY = 'theme';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system' ? (prefersDark() ? 'dark' : 'light') : theme;
}

function blockThemeTransitions(): () => void {
  if (typeof document === 'undefined') return () => undefined;

  const style = document.createElement('style');
  style.dataset.hmifThemeTransition = 'blocked';
  style.textContent =
    '*,*::before,*::after{transition:none!important;animation:none!important;}';
  document.head.appendChild(style);

  return () => {
    const removeStyle = () => style.remove();

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(removeStyle));
      return;
    }

    removeStyle();
  };
}

export function getTheme(): Theme {
  if (typeof window === 'undefined') return 'system';

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(storedTheme) ? storedTheme : 'system';
  } catch {
    return 'system';
  }
}

export function setTheme(theme: Theme): ResolvedTheme {
  const resolvedTheme = resolveTheme(theme);

  if (typeof document !== 'undefined') {
    const restoreTransitions = blockThemeTransitions();
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    void document.documentElement.offsetHeight;
    restoreTransitions();
  }

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Tema tetap diterapkan meskipun penyimpanan browser tidak tersedia.
    }
  }

  return resolvedTheme;
}

export function toggleTheme(): ResolvedTheme {
  const documentTheme =
    typeof document !== 'undefined' ? document.documentElement.dataset.theme : undefined;
  const activeTheme =
    documentTheme === 'light' || documentTheme === 'dark'
      ? documentTheme
      : resolveTheme(getTheme());

  return setTheme(activeTheme === 'dark' ? 'light' : 'dark');
}
