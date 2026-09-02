import * as React from 'react';

import { cn } from '@/lib/utils';

type AvatarSize = 'xs' | 'sm' | 'md';

type AvatarProps = Omit<React.ComponentProps<'span'>, 'children'> & {
  alt?: string;
  name: string;
  nim?: string;
  size?: AvatarSize;
  src?: string | null;
};

const sizeStyles: Record<AvatarSize, string> = {
  xs: 'size-5 text-[8px]',
  sm: 'size-6 text-[10px]',
  md: 'size-8 text-[12px]',
};

const avatarTones = [
  'bg-primary-subtle text-primary',
  'bg-accent-subtle text-primary',
  'bg-success-subtle text-primary',
  'bg-warning-subtle text-primary',
  'bg-info-subtle text-primary',
] as const;

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return '??';
  }

  const firstWord = words[0] ?? '';
  const lastWord = words.at(-1) ?? '';
  const characters =
    words.length === 1
      ? Array.from(firstWord).slice(0, 2)
      : [Array.from(firstWord)[0], Array.from(lastWord)[0]];

  return characters.filter(Boolean).join('').toLocaleUpperCase('id-ID');
}

function getToneIndex(identity: string) {
  const hash = Array.from(identity).reduce(
    (currentHash, character) => (currentHash * 31 + (character.codePointAt(0) ?? 0)) >>> 0,
    0,
  );

  return hash % avatarTones.length;
}

function Avatar({ alt, className, name, nim, size = 'md', src, ...props }: AvatarProps) {
  const identity = nim?.trim() || name.trim();
  const accessibleName = alt?.trim() || `Foto profil ${name.trim() || 'pengguna'}`;
  const tone = avatarTones[getToneIndex(identity)];

  return (
    <span
      {...props}
      data-slot="avatar"
      data-size={size}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold leading-none select-none',
        sizeStyles[size],
        tone,
        className,
      )}
    >
      {src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- URL foto anggota bersifat dinamis. */}
          <img
            src={src}
            alt={accessibleName}
            className="absolute inset-0 size-full object-cover"
            decoding="async"
          />
        </>
      ) : (
        <span role="img" aria-label={accessibleName}>
          {getInitials(name)}
        </span>
      )}
    </span>
  );
}

export { Avatar };
export type { AvatarProps, AvatarSize };
