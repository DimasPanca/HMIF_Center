/**
 * Tampilan baca konten TipTap (ProseMirror JSON) TANPA memuat TipTap (T-093).
 *
 * Masukannya harus sudah lewat `sanitasiKonten` (allowlist node/mark/atribut,
 * lib/notulensi/sanitasi.ts) — di sini node yang tidak dikenal pun tetap
 * diabaikan, dan teks selalu dirender sebagai teks React (tidak pernah HTML
 * mentah), jadi tidak ada jalur XSS. Tautan hanya http(s)/mailto (disaring
 * sanitizer) dan dibuka dengan rel aman.
 *
 * Dipakai server component maupun klien; tidak menyentuh DOM editor.
 */

import * as React from 'react';

import type { NodeProseMirror } from '@/lib/notulensi/sanitasi';

type Mark = NonNullable<NodeProseMirror['marks']>[number];

function bungkusMark(isi: React.ReactNode, mark: Mark, kunci: number): React.ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong key={kunci}>{isi}</strong>;
    case 'italic':
      return <em key={kunci}>{isi}</em>;
    case 'underline':
      return <u key={kunci}>{isi}</u>;
    case 'strike':
      return <s key={kunci}>{isi}</s>;
    case 'code':
      return <code key={kunci}>{isi}</code>;
    case 'link': {
      const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : null;
      return href && /^(https?:\/\/|mailto:)/i.test(href) ? (
        <a key={kunci} href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline">
          {isi}
        </a>
      ) : (
        isi
      );
    }
    default:
      return isi;
  }
}

function anak(n: NodeProseMirror): React.ReactNode {
  return n.content?.map((c, i) => <Simpul key={i} n={c} />);
}

function Simpul({ n }: { n: NodeProseMirror }): React.ReactNode {
  const span = (k: 'colspan' | 'rowspan') => (typeof n.attrs?.[k] === 'number' ? (n.attrs[k] as number) : undefined);
  switch (n.type) {
    case 'doc':
      return <>{anak(n)}</>;
    case 'text':
      return (n.marks ?? []).reduce<React.ReactNode>((isi, m, i) => bungkusMark(isi, m, i), n.text ?? '');
    case 'paragraph':
      return <p>{anak(n)}</p>;
    case 'hardBreak':
      return <br />;
    case 'horizontalRule':
      return <hr />;
    case 'blockquote':
      return <blockquote>{anak(n)}</blockquote>;
    case 'heading': {
      const level = n.attrs?.level === 1 ? 'h3' : n.attrs?.level === 3 ? 'h5' : 'h4';
      return React.createElement(level, null, anak(n));
    }
    case 'bulletList':
      return <ul className="list-disc pl-5">{anak(n)}</ul>;
    case 'orderedList':
      return (
        <ol className="list-decimal pl-5" start={typeof n.attrs?.start === 'number' ? n.attrs.start : undefined}>
          {anak(n)}
        </ol>
      );
    case 'listItem':
      return <li>{anak(n)}</li>;
    case 'taskList':
      return (
        <ul className="list-none pl-0" data-type="taskList">
          {anak(n)}
        </ul>
      );
    case 'taskItem': {
      const selesai = n.attrs?.checked === true;
      return (
        <li className="flex items-start gap-2" data-checked={selesai ? 'true' : 'false'}>
          <span aria-hidden="true" className="mt-0.5">
            {selesai ? '☑' : '☐'}
          </span>
          <span className={selesai ? 'text-secondary line-through' : undefined}>
            <span className="sr-only">{selesai ? 'Selesai: ' : 'Belum: '}</span>
            {anak(n)}
          </span>
        </li>
      );
    }
    case 'table':
      return (
        <table className="my-2 border-collapse">
          <tbody>{anak(n)}</tbody>
        </table>
      );
    case 'tableRow':
      return <tr>{anak(n)}</tr>;
    case 'tableHeader':
      return (
        <th colSpan={span('colspan')} rowSpan={span('rowspan')} className="border border-default bg-subtle px-2 py-1 text-left">
          {anak(n)}
        </th>
      );
    case 'tableCell':
      return (
        <td colSpan={span('colspan')} rowSpan={span('rowspan')} className="border border-default px-2 py-1">
          {anak(n)}
        </td>
      );
    default:
      return null;
  }
}

/** True bila dokumen tidak memuat teks apa pun (job desk belum disusun). */
export function kontenKosong(n: NodeProseMirror | null | undefined): boolean {
  if (!n) return true;
  if (n.type === 'text') return !(n.text ?? '').trim();
  if (n.type === 'taskItem' || n.type === 'horizontalRule' || n.type === 'table') return false;
  return (n.content ?? []).every(kontenKosong);
}

export function KontenProsa({ konten, className }: { konten: NodeProseMirror; className?: string }) {
  return (
    <div className={['notulensi-prosa text-[14px] leading-6', className].filter(Boolean).join(' ')} data-testid="konten-prosa">
      <Simpul n={konten} />
    </div>
  );
}
