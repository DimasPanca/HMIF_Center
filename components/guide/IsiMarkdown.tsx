/**
 * Render blok markdown Guide (ADR-060) sebagai elemen React — tanpa `dangerouslySetInnerHTML`.
 * Inline yang didukung: **tebal**, *miring*, `kode`, [tautan](url). Tautan eksternal dibuka di tab baru.
 */

import { Link as IkonTautan } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';

import type { Blok } from '@/lib/guide/markdown';

const RE_INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

export function Inline({ teks }: { teks: string }) {
  const bagian = teks.split(RE_INLINE);
  return (
    <>
      {bagian.map((b, i): ReactNode => {
        if (b.startsWith('**') && b.endsWith('**')) return <strong key={i} className="font-semibold text-primary">{b.slice(2, -2)}</strong>;
        if (b.length > 2 && b.startsWith('*') && b.endsWith('*')) return <em key={i}>{b.slice(1, -1)}</em>;
        if (b.startsWith('`') && b.endsWith('`'))
          return (
            <code key={i} className="rounded-[4px] bg-muted px-1 py-0.5 font-mono text-[0.9em]">
              {b.slice(1, -1)}
            </code>
          );
        const t = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(b);
        if (t) {
          const luar = /^https?:\/\//.test(t[2]!);
          // Tautan relatif antarpanduan (`kadept.md`) diarahkan ke halaman Guide-nya.
          const href = luar ? t[2]! : t[2]!.replace(/^(?:\.\/)?([a-z]+)\.md(#.*)?$/, '/guide/$1$2');
          return (
            <a key={i} href={href} className="text-link underline-offset-2 hover:underline" {...(luar ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
              {t[1]}
            </a>
          );
        }
        return b;
      })}
    </>
  );
}

export function IsiMarkdown({ blok }: { blok: Blok[] }) {
  return (
    <div className="space-y-4 text-[15px] leading-[1.65] text-secondary">
      {blok.map((b, i) => {
        switch (b.jenis) {
          case 'judul': {
            const Tag = b.level <= 2 ? 'h2' : b.level === 3 ? 'h3' : 'h4';
            return (
              <Tag
                key={i}
                id={b.id}
                className={
                  b.level <= 2
                    ? 'group scroll-mt-28 pt-6 text-[20px] leading-7 font-semibold text-primary first:pt-0'
                    : 'group scroll-mt-28 pt-2 text-[16px] leading-6 font-semibold text-primary'
                }
              >
                <a href={`#${b.id}`} className="inline-flex items-center gap-2 outline-none focus-visible:underline">
                  <Inline teks={b.teks} />
                  <IkonTautan aria-hidden="true" className="size-3.5 text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </Tag>
            );
          }
          case 'paragraf':
            return (
              <p key={i}>
                <Inline teks={b.teks} />
              </p>
            );
          case 'kutipan':
            return (
              <p key={i} className="rounded-md bg-subtle px-4 py-3 text-[14px] text-secondary">
                <Inline teks={b.teks} />
              </p>
            );
          case 'kode':
            return (
              <pre key={i} className="overflow-x-auto rounded-md bg-subtle p-3 font-mono text-[13px] leading-5 text-primary">
                {b.teks}
              </pre>
            );
          case 'gambar':
            return (
              <figure key={i} className="overflow-hidden rounded-lg border border-default bg-subtle">
                <Image src={b.src} alt={b.alt} width={1280} height={800} className="h-auto w-full" sizes="(min-width: 1024px) 760px, 100vw" unoptimized />
                {b.alt ? <figcaption className="border-t border-default px-3 py-2 text-[12px] text-tertiary">{b.alt}</figcaption> : null}
              </figure>
            );
          case 'daftar': {
            const Tag = b.berurut ? 'ol' : 'ul';
            return (
              <Tag key={i} className={b.berurut ? 'list-decimal space-y-1.5 pl-5 marker:text-tertiary' : 'list-disc space-y-1.5 pl-5 marker:text-tertiary'}>
                {b.butir.map((x, j) => (
                  <li key={j} className="pl-1">
                    <Inline teks={x.teks} />
                    {x.anak.length ? (
                      <ul className="mt-1.5 list-[circle] space-y-1 pl-5 marker:text-tertiary">
                        {x.anak.map((a, k) => (
                          <li key={k}>
                            <Inline teks={a} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </Tag>
            );
          }
          case 'tabel':
            return (
              // Tabel panduan ≤ 3 kolom: dibungkus, tidak digeser (ADR-037).
              <div key={i} className="overflow-hidden rounded-lg border border-default">
                <table className="w-full table-fixed border-collapse text-left text-[14px]">
                  <thead className="bg-subtle text-primary">
                    <tr>
                      {b.kepala.map((k, j) => (
                        <th key={j} scope="col" className="px-3 py-2 align-top font-semibold break-words">
                          <Inline teks={k} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.baris.map((r, j) => (
                      <tr key={j} className="border-t border-default">
                        {r.map((c, k) => (
                          <td key={k} className="px-3 py-2 align-top break-words">
                            <Inline teks={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
