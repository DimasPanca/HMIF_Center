'use client';

import { LogOut, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Avatar } from '@/components/ui/avatar';
import type { RoleCode } from '@/lib/auth/permissions';

interface UserMenuProps {
  email: string;
  nama: string;
  roles: readonly RoleCode[];
}

export function UserMenu({ email, nama, roles }: UserMenuProps) {
  const [keluar, setKeluar] = useState(false);

  async function logout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setKeluar(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  return (
    <details className="group relative">
      <summary className="flex h-[34px] cursor-pointer list-none items-center gap-2 rounded-sm px-1.5 text-secondary transition-colors duration-fast hover:bg-muted hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        <Avatar name={nama} size="sm" />
        <span className="hidden max-w-28 truncate text-[12px] font-medium xl:block">{nama}</span>
      </summary>

      <div className="absolute top-[calc(100%+8px)] right-0 z-50 w-64 rounded-sm border border-default bg-elevated p-2 shadow-lg">
        <div className="flex items-start gap-2 border-b border-default px-2 py-2">
          <UserRound className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-primary">{nama}</p>
            <p className="truncate text-[11px] text-tertiary">{email}</p>
            <p className="mt-1 text-[10px] font-medium text-secondary">
              {roles.join(' · ') || 'Tanpa role'}
            </p>
          </div>
        </div>
        <form onSubmit={logout} className="pt-1">
          <button
            type="submit"
            data-testid="logout-submit"
            disabled={keluar}
            className="flex h-[34px] w-full items-center gap-2 rounded-sm px-2 text-[12px] text-[var(--danger)] transition-colors duration-fast hover:bg-[var(--danger-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {keluar ? 'Keluar…' : 'Keluar'}
          </button>
        </form>
      </div>
    </details>
  );
}
