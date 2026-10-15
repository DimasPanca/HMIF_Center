'use client';

/**
 * Textarea dengan saran `@nama` (T-082 #3). Pengguna mengetik `@` lalu
 * beberapa huruf → muncul daftar pengurus relevan; memilih menyisipkan
 * `@Nama Lengkap` yang terbaca. Saat dikirim, `keToken()` mengubah nama yang
 * DIPILIH dari daftar menjadi token `@[Nama](uuid)` — mengetik `@Budi` manual
 * tanpa memilih tidak menjadi mention (menghindari salah orang).
 *
 * Test id: mention-input, mention-saran, mention-opsi-{id}.
 */

import * as React from 'react';

import { Textarea } from '@/components/ui/textarea';
import { tokenMention } from '@/lib/kendala/skema';

export interface OrangMention {
  id: string;
  nama: string;
  peran: string;
}

export interface MentionInputHandle {
  /** Teks dengan mention terpilih sebagai token. */
  keToken: () => string;
  kosongkan: () => void;
}

const POLA_PEMICU = /(^|\s)@([^\s@]{0,30})$/;

export const MentionInput = React.forwardRef<
  MentionInputHandle,
  { orang: OrangMention[]; id?: string; placeholder?: string; disabled?: boolean; onChange?: (teks: string) => void; testId?: string }
>(function MentionInput({ orang, id, placeholder, disabled, onChange, testId = 'mention-input' }, ref) {
  const [teks, setTeks] = React.useState('');
  const [kueri, setKueri] = React.useState<string | null>(null);
  const [aktif, setAktif] = React.useState(0);
  const dipilih = React.useRef(new Map<string, string>());
  const area = React.useRef<HTMLTextAreaElement>(null);
  const idDaftar = React.useId();

  const saran = React.useMemo(() => {
    if (kueri === null) return [];
    const q = kueri.toLocaleLowerCase('id-ID');
    return orang.filter((o) => o.nama.toLocaleLowerCase('id-ID').split(/\s+/).some((kata) => kata.startsWith(q)) || o.nama.toLocaleLowerCase('id-ID').startsWith(q)).slice(0, 6);
  }, [kueri, orang]);

  function ganti(nilai: string, kursor: number) {
    setTeks(nilai);
    onChange?.(nilai);
    const m = POLA_PEMICU.exec(nilai.slice(0, kursor));
    setKueri(m ? m[2]! : null);
    setAktif(0);
  }

  function pilih(o: OrangMention) {
    const el = area.current;
    const kursor = el?.selectionStart ?? teks.length;
    const sebelum = teks.slice(0, kursor).replace(/@([^\s@]{0,30})$/, `@${o.nama} `);
    const baru = sebelum + teks.slice(kursor);
    dipilih.current.set(o.nama, o.id);
    setTeks(baru);
    onChange?.(baru);
    setKueri(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(sebelum.length, sebelum.length);
    });
  }

  React.useImperativeHandle(ref, () => ({
    keToken() {
      let hasil = teks;
      // Nama terpanjang dulu: "Budi Santoso" tidak terpotong oleh "Budi".
      for (const [nama, uid] of [...dipilih.current].sort((a, b) => b[0].length - a[0].length)) {
        hasil = hasil.split(`@${nama}`).join(tokenMention(nama, uid));
      }
      return hasil.trim();
    },
    kosongkan() {
      setTeks('');
      dipilih.current.clear();
      setKueri(null);
      onChange?.('');
    },
  }));

  return (
    <div className="relative">
      <Textarea
        ref={area}
        id={id}
        rows={3}
        value={teks}
        disabled={disabled}
        placeholder={placeholder ?? 'Tulis balasan… ketik @ untuk menyebut pengurus'}
        maxLength={3000}
        data-testid={testId}
        role="combobox"
        aria-expanded={saran.length > 0}
        aria-controls={idDaftar}
        aria-autocomplete="list"
        onChange={(e) => ganti(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => {
          if (!saran.length) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAktif((a) => (a + 1) % saran.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setAktif((a) => (a - 1 + saran.length) % saran.length);
          } else if (e.key === 'Enter' || e.key === 'Tab') {
            e.preventDefault();
            pilih(saran[aktif]!);
          } else if (e.key === 'Escape') {
            setKueri(null);
          }
        }}
      />
      {saran.length ? (
        <ul
          id={idDaftar}
          role="listbox"
          data-testid="mention-saran"
          className="absolute left-0 z-20 mt-1 w-full max-w-xs overflow-hidden rounded-sm border border-default bg-panel shadow-md"
        >
          {saran.map((o, i) => (
            <li
              key={o.id}
              role="option"
              aria-selected={i === aktif}
              data-testid={`mention-opsi-${o.id}`}
              className={`cursor-pointer px-3 py-2 text-[13px] ${i === aktif ? 'bg-subtle' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pilih(o);
              }}
            >
              <span className="font-medium text-primary">{o.nama}</span>
              <span className="ml-2 text-xs text-tertiary">{o.peran.toLocaleLowerCase('id-ID')}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});
