'use client';

/**
 * Diskusi berulir kendala (T-082 #2–#3). Tiga tingkat menjorok; balasan yang
 * lebih dalam diratakan di tingkat ketiga dengan keterangan "membalas X".
 * Mention disorot; mention ke diri sendiri disorot lebih tegas. Teks tidak
 * pernah dirender sebagai HTML.
 *
 * Test id: utas, balasan-{id} (data-kedalaman), balasan-mention,
 * balasan-balas-{id}, balasan-kirim, balasan-galat.
 */

import { useRouter } from 'next/navigation';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { pecahMention, susunUtas, type BalasanDatar, type SimpulUtas } from '@/lib/kendala/skema';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

import { MentionInput, type MentionInputHandle, type OrangMention } from './MentionInput';

const JOROK: Record<number, string> = { 1: '', 2: 'ml-4 sm:ml-8', 3: 'ml-8 sm:ml-16' };

function IsiTeks({ konten, saya }: { konten: string; saya: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-primary">
      {pecahMention(konten).map((s, i) =>
        s.t === 'teks' ? (
          <React.Fragment key={i}>{s.v}</React.Fragment>
        ) : (
          <mark
            key={i}
            data-testid="balasan-mention"
            data-saya={s.id === saya ? 'ya' : undefined}
            className={`rounded-xs px-0.5 font-medium ${s.id === saya ? 'bg-[var(--warning-subtle)] text-primary' : 'bg-[var(--primary-subtle)] text-[var(--primary)]'}`}
          >
            @{s.nama}
          </mark>
        ),
      )}
    </p>
  );
}

function Komposer({
  kendalaId,
  parentId,
  orang,
  onSelesai,
  onBatal,
}: {
  kendalaId: string;
  parentId: string | null;
  orang: OrangMention[];
  onSelesai: () => void;
  onBatal?: () => void;
}) {
  const ref = React.useRef<MentionInputHandle>(null);
  const [isi, setIsi] = React.useState('');
  const [proses, setProses] = React.useState(false);
  const [galat, setGalat] = React.useState<string | null>(null);

  async function kirim(e: React.FormEvent) {
    e.preventDefault();
    const konten = ref.current?.keToken() ?? '';
    if (!konten) return setGalat('Balasan wajib diisi.');
    setProses(true);
    setGalat(null);
    try {
      const r = await fetch(`/api/kendala/${kendalaId}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ konten, parent_id: parentId }),
      });
      const b = (await r.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!r.ok || !b?.ok) return setGalat(b?.error?.message ?? 'Balasan gagal dikirim.');
      ref.current?.kosongkan();
      onSelesai();
    } catch {
      setGalat('Tidak dapat menghubungi server. Coba lagi.');
    } finally {
      setProses(false);
    }
  }

  return (
    <form onSubmit={kirim} className="grid gap-2">
      <MentionInput ref={ref} orang={orang} disabled={proses} onChange={setIsi} />
      {galat ? (
        <p role="alert" data-testid="balasan-galat" className="text-[13px] text-danger">
          {galat}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        {onBatal ? (
          <Button type="button" variant="ghost" onClick={onBatal} disabled={proses}>
            Batal
          </Button>
        ) : null}
        <Button type="submit" loading={proses} disabled={!isi.trim()} data-testid="balasan-kirim">
          Kirim balasan
        </Button>
      </div>
    </form>
  );
}

function Simpul({
  s,
  kendalaId,
  orang,
  saya,
  bolehBalas,
  dibalas,
  setDibalas,
  muatUlang,
}: {
  s: SimpulUtas;
  kendalaId: string;
  orang: OrangMention[];
  saya: string;
  bolehBalas: boolean;
  dibalas: string | null;
  setDibalas: (id: string | null) => void;
  muatUlang: () => void;
}) {
  return (
    <li className="grid gap-2">
      <article
        data-testid={`balasan-${s.id}`}
        data-kedalaman={s.kedalaman}
        className={`${JOROK[s.kedalaman] ?? JOROK[3]} rounded-sm border border-default bg-panel p-3 ${s.kedalaman > 1 ? 'border-l-2 border-l-[var(--primary)]' : ''}`}
      >
        <header className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs text-secondary">
          <span className="font-semibold text-primary">{s.nama_penulis}</span>
          {s.membalas ? <span>membalas {s.membalas}</span> : null}
          <time dateTime={s.created_at}>{formatTanggalWaktu(s.created_at)}</time>
        </header>
        <IsiTeks konten={s.konten} saya={saya} />
        {bolehBalas && dibalas !== s.id ? (
          <button
            type="button"
            className="mt-1 text-xs font-medium text-[var(--primary)] hover:underline"
            onClick={() => setDibalas(s.id)}
            data-testid={`balasan-balas-${s.id}`}
          >
            Balas
          </button>
        ) : null}
      </article>
      {dibalas === s.id ? (
        <div className={JOROK[Math.min(s.kedalaman + 1, 3)]}>
          <Komposer
            kendalaId={kendalaId}
            parentId={s.id}
            orang={orang}
            onBatal={() => setDibalas(null)}
            onSelesai={() => {
              setDibalas(null);
              muatUlang();
            }}
          />
        </div>
      ) : null}
      {s.anak.length ? (
        <ul className="grid gap-2">
          {s.anak.map((a) => (
            <Simpul key={a.id} s={a} kendalaId={kendalaId} orang={orang} saya={saya} bolehBalas={bolehBalas} dibalas={dibalas} setDibalas={setDibalas} muatUlang={muatUlang} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ReplyThread({
  kendalaId,
  balasan,
  orang,
  saya,
  bolehBalas,
}: {
  kendalaId: string;
  balasan: BalasanDatar[];
  orang: OrangMention[];
  saya: string;
  bolehBalas: boolean;
}) {
  const router = useRouter();
  const [dibalas, setDibalas] = React.useState<string | null>(null);
  const utas = React.useMemo(() => susunUtas(balasan), [balasan]);
  const muatUlang = React.useCallback(() => router.refresh(), [router]);

  return (
    <section aria-labelledby="judul-utas" className="grid gap-3" data-testid="utas">
      <h2 id="judul-utas" className="text-base font-semibold text-primary">
        Diskusi ({balasan.length})
      </h2>
      {utas.length ? (
        <ul className="grid gap-2">
          {utas.map((s) => (
            <Simpul key={s.id} s={s} kendalaId={kendalaId} orang={orang} saya={saya} bolehBalas={bolehBalas} dibalas={dibalas} setDibalas={setDibalas} muatUlang={muatUlang} />
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-secondary">Belum ada diskusi.</p>
      )}
      {bolehBalas ? (
        dibalas === null ? (
          <Komposer kendalaId={kendalaId} parentId={null} orang={orang} onSelesai={muatUlang} />
        ) : null
      ) : (
        <p className="text-xs text-tertiary" data-testid="utas-baca-saja">
          Anda dapat membaca diskusi ini, tetapi tidak dapat membalas.
        </p>
      )}
    </section>
  );
}
