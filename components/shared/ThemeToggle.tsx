'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { toggleTheme } from '@/lib/theme';

type ResolvedTheme = 'light' | 'dark';

function readResolvedTheme(): ResolvedTheme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function ThemeToggle() {
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light');

  useEffect(() => {
    setResolvedTheme(readResolvedTheme());
  }, []);

  const isDark = resolvedTheme === 'dark';
  const label = isDark ? 'Aktifkan tema terang' : 'Aktifkan tema gelap';

  function handleToggle() {
    setResolvedTheme(toggleTheme());
  }

  return (
    <button
      type="button"
      className="inline-flex size-[34px] items-center justify-center rounded-sm border border-default bg-panel text-secondary transition-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
      aria-label={label}
      title={label}
      onClick={handleToggle}
    >
      {isDark ? <Sun aria-hidden="true" size={16} /> : <Moon aria-hidden="true" size={16} />}
    </button>
  );
}
