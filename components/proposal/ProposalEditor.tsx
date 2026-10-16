'use client';

/**
 * Editor Proposal 8 bagian (T-096, PRD F-10.2).
 *
 *   - Field hasil prefill bertanda "Diisi otomatis dari …" (kontrak 7) dan tetap
 *     dapat diedit; menyunting menghapus tanda dan mencatat field sebagai
 *     `manual` sehingga prefill berikutnya tidak menimpanya.
 *   - Susunan kepanitiaan, anggaran, rincian RAB, rundown: TAMPILAN SAJA,
 *     ditarik dari data acara (kontrak 3–5) — tidak ada field manual untuknya.
 *   - Persentase field terisi otomatis ditampilkan (kontrak 2).
 *   - Auto-save 10 detik; "Buat dokumen proposal" menyimpan lalu generate.
 */

import { Check, Download, ExternalLink, FileText, Sparkles } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { BagianRepeatable } from '@/components/tor/BagianRepeatable';
import { Teks, TeksKaya } from '@/components/tor/BidangDokumen';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { DataProposalLengkap } from '@/lib/proposal/service';
import {
  BAGIAN_PROPOSAL,
  LABEL_ASAL,
  SkemaDataProposal,
  ukurPrefill,
  type DataProposal,
  type IdFieldProposal,
  type Orang,
} from '@/lib/proposal/schema';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalPanjang, formatTanggalWaktu } from '@/lib/utils/format-tanggal';

export const SELANG_AUTOSAVE_PROPOSAL_MS = 10_000;

type Status = 'tersimpan' | 'berubah' | 'menyimpan' | 'gagal';
type Respons =
  { ok: true; data: { diperbarui_at: string } } | { ok: false; error?: { message?: string } };
type ResponsGenerate =
  | { ok: true; data: { dokumen_id: string; pdf: boolean; peringatan: string | null } }
  | { ok: false; error?: { message?: string; details?: { kurang?: string[] } } };

function Bagian({
  id,
  no,
  judul,
  children,
}: {
  id: string;
  no: number;
  judul: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`bagian-${id}`}
      aria-labelledby={`bagian-${id}-judul`}
      className="scroll-mt-14"
      data-testid={`proposal-bagian-${id}`}
    >
      <Card className="space-y-4 p-4">
        <h2 id={`bagian-${id}-judul`} className="text-[15px] font-semibold">
          <span className="tabular-nums text-tertiary">{no}.</span> {judul}
        </h2>
        {children}
      </Card>
    </section>
  );
}

function Lencana({
  asal,
  field,
}: {
  asal: DataProposal['asal'][IdFieldProposal];
  field: IdFieldProposal;
}) {
  if (!asal) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm bg-[var(--info-subtle)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--info)]"
      data-testid={`proposal-otomatis-${field}`}
      data-asal={asal}
    >
      <Sparkles aria-hidden="true" className="size-3" /> {LABEL_ASAL[asal]}
    </span>
  );
}

function Field({
  judul,
  field,
  asal,
  children,
}: {
  judul: string;
  field: IdFieldProposal;
  asal: DataProposal['asal'];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-testid={`proposal-field-${field}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-medium">{judul}</h3>
        <Lencana asal={asal[field]} field={field} />
      </div>
      {children}
    </div>
  );
}

function BarisTarikan({ label, nilai }: { label: string; nilai: string }) {
  return (
    <div>
      <dt className="text-[12px] text-secondary">{label}</dt>
      <dd className="text-[13px] font-medium">{nilai}</dd>
    </div>
  );
}

export function ProposalEditor({
  awal,
  dokumenTerakhir,
}: {
  awal: DataProposalLengkap;
  dokumenTerakhir: string | null;
}) {
  const tulis = awal.boleh_tulis;
  const [data, setDataMentah] = React.useState<DataProposal>(awal.data);
  const [status, setStatus] = React.useState<Status>(
    tulis && !awal.tersimpan ? 'berubah' : 'tersimpan',
  );
  const [galat, setGalat] = React.useState<string | null>(null);
  const [disimpanAt, setDisimpanAt] = React.useState(awal.diperbarui_at);
  const [dokumenAt, setDokumenAt] = React.useState(dokumenTerakhir);
  const [membuat, setMembuat] = React.useState(false);
  const [hasilBuat, setHasilBuat] = React.useState<{
    galat: boolean;
    pesan: string;
    kurang: string[];
  } | null>(null);
  const [siap, setSiap] = React.useState(false);
  // Proposal baru: isian prefill belum tercatat — auto-save pertama mencatatnya.
  const kotor = React.useRef(tulis && !awal.tersimpan);
  const terbaru = React.useRef(data);
  terbaru.current = data;
  const sedang = React.useRef(false);

  React.useEffect(() => setSiap(true), []);

  /** Menyunting field: tanda otomatis hilang, field tercatat `manual`. */
  const ubah = <K extends IdFieldProposal>(k: K, v: DataProposal[K]) => {
    setDataMentah((d) => {
      const asal = { ...d.asal };
      delete asal[k];
      return { ...d, [k]: v, asal, manual: d.manual.includes(k) ? d.manual : [...d.manual, k] };
    });
    kotor.current = true;
    setStatus('berubah');
  };
  const ubahOrang =
    (k: 'sekretaris' | 'ketua_bem' | 'wd3' | 'kaprodi', bagian: keyof Orang) => (v: string) =>
      ubah(k, { ...data[k], [bagian]: v });

  const simpan = React.useCallback(async () => {
    if (sedang.current || !kotor.current) return;
    const cek = SkemaDataProposal.safeParse(terbaru.current);
    if (!cek.success) {
      setGalat(cek.error.issues[0]?.message ?? 'Isian proposal tidak valid.');
      setStatus('gagal');
      return;
    }
    sedang.current = true;
    kotor.current = false;
    setStatus('menyimpan');
    try {
      const res = await fetch(`/api/proposal/${awal.kepanitiaan_id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: terbaru.current }),
      });
      const b = (await res.json().catch(() => null)) as Respons | null;
      if (!res.ok || !b?.ok)
        throw new Error((b && !b.ok && b.error?.message) || 'Proposal gagal disimpan.');
      setDisimpanAt(b.data.diperbarui_at);
      setGalat(null);
      setStatus(kotor.current ? 'berubah' : 'tersimpan');
    } catch (e) {
      kotor.current = true;
      setGalat(e instanceof Error ? e.message : 'Proposal gagal disimpan.');
      setStatus('gagal');
    } finally {
      sedang.current = false;
    }
  }, [awal.kepanitiaan_id]);

  React.useEffect(() => {
    if (!tulis) return;
    const id = window.setInterval(() => void simpan(), SELANG_AUTOSAVE_PROPOSAL_MS);
    const tahan = (e: BeforeUnloadEvent) => {
      if (kotor.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', tahan);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('beforeunload', tahan);
    };
  }, [tulis, simpan]);

  const buatDokumen = async () => {
    setMembuat(true);
    setHasilBuat(null);
    try {
      kotor.current = true;
      await simpan();
      const res = await fetch(`/api/proposal/${awal.kepanitiaan_id}/generate`, { method: 'POST' });
      const b = (await res.json().catch(() => null)) as ResponsGenerate | null;
      if (!res.ok || !b?.ok) {
        const e = b && !b.ok ? b.error : undefined;
        setHasilBuat({
          galat: true,
          pesan: e?.message || 'Proposal gagal dibuat.',
          kurang: e?.details?.kurang ?? [],
        });
        return;
      }
      setDokumenAt(new Date().toISOString());
      setHasilBuat({
        galat: false,
        pesan: b.data.peringatan ?? 'Dokumen proposal dibuat.',
        kurang: [],
      });
    } catch {
      setHasilBuat({
        galat: true,
        pesan: 'Tidak dapat menghubungi server. Coba lagi.',
        kurang: [],
      });
    } finally {
      setMembuat(false);
    }
  };

  const ukuran = ukurPrefill(data, awal.tarikan);
  const ang = awal.anggaran;

  return (
    <div
      className="grid gap-4 lg:grid-cols-[15rem_1fr]"
      data-testid="proposal-editor"
      data-siap={siap ? '1' : '0'}
    >
      <aside className="lg:sticky lg:top-14 lg:self-start">
        <Card className="space-y-3 p-4">
          <div data-testid="proposal-prefill" data-persen={ukuran.persen_otomatis}>
            <p className="text-[13px] font-semibold">
              {ukuran.persen_otomatis}% field terisi otomatis
            </p>
            <p className="text-[12px] text-secondary">
              {ukuran.dari_sumber} dari TOR, proker, dan data panitia · {ukuran.dari_tarikan} dari
              data acara & RAB · {ukuran.terisi} dari {ukuran.total} field terisi
            </p>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
            <div
              className="h-full bg-[var(--primary)]"
              style={{ width: `${ukuran.persen_otomatis}%` }}
            />
          </div>
          <nav aria-label="Bagian proposal">
            <ol className="grid gap-0.5 text-[13px]">
              {BAGIAN_PROPOSAL.map((b) => (
                <li key={b.id}>
                  <a
                    href={`#bagian-${b.id}`}
                    className="flex gap-1.5 rounded-sm px-1.5 py-0.5 text-secondary hover:bg-subtle hover:text-primary"
                  >
                    <span className="w-5 tabular-nums text-tertiary">{b.no}.</span> {b.judul}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          {tulis ? (
            <div className="space-y-2 border-t border-default pt-3">
              <p
                className="text-[12px]"
                role="status"
                aria-live="polite"
                data-testid="proposal-status"
                data-status={status}
              >
                {status === 'tersimpan' ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    Tersimpan <Check aria-hidden="true" className="size-3.5" />
                  </span>
                ) : status === 'menyimpan' ? (
                  'Menyimpan…'
                ) : status === 'gagal' ? (
                  <span className="text-danger">{galat}</span>
                ) : (
                  <span className="text-secondary">Disimpan otomatis tiap 10 detik.</span>
                )}
              </p>
              {disimpanAt ? (
                <p className="text-[11px] text-tertiary">
                  Terakhir {formatTanggalWaktu(disimpanAt)}
                </p>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => void simpan()}
                disabled={status === 'menyimpan'}
                data-testid="proposal-simpan"
              >
                Simpan sekarang
              </Button>
              <Button
                type="button"
                className="w-full"
                onClick={() => void buatDokumen()}
                disabled={membuat || status === 'menyimpan'}
                data-testid="proposal-buat-dokumen"
              >
                <FileText aria-hidden="true" /> {membuat ? 'Membuat…' : 'Buat dokumen proposal'}
              </Button>
              {hasilBuat ? (
                <div
                  role={hasilBuat.galat ? 'alert' : 'status'}
                  className={`text-[12px] ${hasilBuat.galat ? 'text-danger' : 'text-secondary'}`}
                  data-testid="proposal-buat-hasil"
                >
                  <p>{hasilBuat.kurang.length ? 'Lengkapi dulu:' : hasilBuat.pesan}</p>
                  {hasilBuat.kurang.length ? (
                    <ul className="mt-1 list-disc pl-4">
                      {hasilBuat.kurang.map((k) => (
                        <li key={k}>{k}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p
              className="border-t border-default pt-3 text-[12px] text-secondary"
              data-testid="proposal-baca-saja"
            >
              Tampilan baca saja — proposal disusun panitia acara ini.
            </p>
          )}
          {dokumenAt ? (
            <a
              href={`/api/proposal/${awal.kepanitiaan_id}/generate`}
              className="flex items-center gap-1.5 border-t border-default pt-3 text-[13px] font-medium underline"
              data-testid="proposal-unduh"
            >
              <Download aria-hidden="true" className="size-4" /> Unduh proposal (
              {formatTanggalWaktu(dokumenAt)})
            </a>
          ) : null}
        </Card>
      </aside>

      <div className="min-w-0 space-y-4">
        <Bagian id="sampul" no={1} judul="Halaman Sampul">
          <Field judul="Nama kegiatan" field="nama_kegiatan" asal={data.asal}>
            <Teks
              id="proposal-nama"
              label="Nama kegiatan"
              nilai={data.nama_kegiatan}
              bolehTulis={tulis}
              maks={200}
              onChange={(v) => ubah('nama_kegiatan', v)}
            />
          </Field>
          <p className="text-[12px] text-secondary">
            Tahun {awal.tahun} · Program Studi Informatika · HMIF FT UNTIRTA (dari template).
          </p>
        </Bagian>

        <Bagian id="pengesahan" no={2} judul="Lembar Pengesahan">
          <dl className="grid gap-3 sm:grid-cols-2" data-testid="proposal-pengesahan-tarikan">
            <BarisTarikan
              label="Ketua Pelaksana (data acara)"
              nilai={
                awal.ketua_pelaksana
                  ? `${awal.ketua_pelaksana.nama} · ${awal.ketua_pelaksana.nim}`
                  : 'Belum ditetapkan'
              }
            />
            <BarisTarikan
              label="Ketua HMIF (pengurus periode)"
              nilai={
                awal.ketua_himpunan
                  ? `${awal.ketua_himpunan.nama} · ${awal.ketua_himpunan.nim}`
                  : 'Belum terdaftar'
              }
            />
          </dl>
          {(
            [
              ['sekretaris', 'Sekretaris', 'NIM'],
              ['ketua_bem', 'Ketua BEM FT UNTIRTA', 'NIM'],
              ['wd3', 'Wakil Dekan Bidang III FT UNTIRTA', 'NIP'],
              ['kaprodi', 'Ketua Program Studi Informatika', 'NIP'],
            ] as const
          ).map(([k, judul, nomor]) => (
            <Field key={k} judul={judul} field={k} asal={data.asal}>
              <div className="grid gap-2 sm:grid-cols-2">
                <Teks
                  id={`proposal-${k}-nama`}
                  label={`Nama ${judul}`}
                  labelTampak
                  nilai={data[k].nama}
                  bolehTulis={tulis}
                  maks={150}
                  onChange={ubahOrang(k, 'nama')}
                />
                <Teks
                  id={`proposal-${k}-nomor`}
                  label={nomor}
                  labelTampak
                  nilai={data[k].nomor}
                  bolehTulis={tulis}
                  maks={30}
                  onChange={ubahOrang(k, 'nomor')}
                />
              </div>
            </Field>
          ))}
        </Bagian>

        <Bagian id="pendahuluan" no={3} judul="Pendahuluan">
          <Field judul="Latar belakang" field="latar_belakang" asal={data.asal}>
            <TeksKaya
              label="Latar belakang"
              konten={data.latar_belakang}
              bolehTulis={tulis}
              onChange={(k) => ubah('latar_belakang', k)}
            />
          </Field>
          <Field judul="Landasan kegiatan" field="landasan_kegiatan" asal={data.asal}>
            <TeksKaya
              label="Landasan kegiatan"
              konten={data.landasan_kegiatan}
              bolehTulis={tulis}
              onChange={(k) => ubah('landasan_kegiatan', k)}
            />
          </Field>
          <Field judul="Asas pelaksanaan" field="asas" asal={data.asal}>
            <BagianRepeatable<{ teks: string }>
              id="asas"
              baris={data.asas.map((t) => ({ teks: t }))}
              onChange={(b) =>
                ubah(
                  'asas',
                  b.map((x) => x.teks),
                )
              }
              bolehTulis={tulis}
              buat={() => ({ teks: '' })}
              labelTambah="Tambah asas"
              namaBaris="Asas"
              kolom={[
                { kunci: 'teks', label: 'Asas', tipe: 'teks', lebar: 'sm:col-span-4', maks: 500 },
              ]}
            />
          </Field>
          <Field judul="Tujuan kegiatan" field="tujuan" asal={data.asal}>
            <BagianRepeatable<{ teks: string }>
              id="tujuan"
              baris={data.tujuan.map((t) => ({ teks: t }))}
              onChange={(b) =>
                ubah(
                  'tujuan',
                  b.map((x) => x.teks),
                )
              }
              bolehTulis={tulis}
              buat={() => ({ teks: '' })}
              labelTambah="Tambah tujuan"
              namaBaris="Tujuan"
              kolom={[
                { kunci: 'teks', label: 'Tujuan', tipe: 'teks', lebar: 'sm:col-span-4', maks: 500 },
              ]}
            />
          </Field>
        </Bagian>

        <Bagian id="realisasi" no={4} judul="Realisasi Kegiatan">
          <Field judul="Sasaran kegiatan" field="sasaran" asal={data.asal}>
            <TeksKaya
              label="Sasaran kegiatan"
              konten={data.sasaran}
              bolehTulis={tulis}
              onChange={(k) => ubah('sasaran', k)}
            />
          </Field>
          <Field judul="Bentuk acara" field="bentuk_acara" asal={data.asal}>
            <TeksKaya
              label="Bentuk acara"
              konten={data.bentuk_acara}
              bolehTulis={tulis}
              onChange={(k) => ubah('bentuk_acara', k)}
            />
          </Field>
          <Field judul="Waktu & tempat" field="sesi" asal={data.asal}>
            <BagianRepeatable
              id="sesi"
              baris={data.sesi}
              onChange={(b) => ubah('sesi', b)}
              bolehTulis={tulis}
              buat={() => ({ sesi: '', tanggal: '', waktu: '', tempat: '' })}
              labelTambah="Tambah sesi"
              namaBaris="Sesi"
              kolom={[
                { kunci: 'sesi', label: 'Nama sesi', tipe: 'teks', maks: 120 },
                { kunci: 'tanggal', label: 'Hari/Tanggal', tipe: 'tanggal' },
                { kunci: 'waktu', label: 'Waktu', tipe: 'teks', maks: 60 },
                { kunci: 'tempat', label: 'Tempat', tipe: 'teks', maks: 200 },
              ]}
            />
          </Field>
          <Field judul="Pengisi acara" field="pengisi" asal={data.asal}>
            <BagianRepeatable
              id="pengisi"
              baris={data.pengisi}
              onChange={(b) => ubah('pengisi', b)}
              bolehTulis={tulis}
              buat={() => ({ peran: '', nama: '' })}
              labelTambah="Tambah pengisi"
              namaBaris="Pengisi"
              kosong="Belum ada pengisi acara (opsional)."
              kolom={[
                { kunci: 'peran', label: 'Peran', tipe: 'teks', maks: 120 },
                { kunci: 'nama', label: 'Nama', tipe: 'teks', lebar: 'sm:col-span-3', maks: 200 },
              ]}
            />
          </Field>
          <Field judul="Gambaran umum" field="gambaran_umum" asal={data.asal}>
            <TeksKaya
              label="Gambaran umum"
              konten={data.gambaran_umum}
              bolehTulis={tulis}
              onChange={(k) => ubah('gambaran_umum', k)}
            />
          </Field>
          <Field judul="Rangkaian acara" field="rangkaian" asal={data.asal}>
            <BagianRepeatable
              id="rangkaian"
              baris={data.rangkaian}
              onChange={(b) => ubah('rangkaian', b)}
              bolehTulis={tulis}
              buat={() => ({ nama: '', uraian: '' })}
              labelTambah="Tambah rangkaian"
              namaBaris="Rangkaian"
              kolom={[
                { kunci: 'nama', label: 'Nama sesi', tipe: 'teks', maks: 200 },
                {
                  kunci: 'uraian',
                  label: 'Uraian',
                  tipe: 'panjang',
                  lebar: 'sm:col-span-3',
                  maks: 4000,
                },
              ]}
            />
          </Field>
        </Bagian>

        <Bagian id="kepanitiaan" no={5} judul="Susunan Kepanitiaan">
          <p className="text-[12px] text-secondary">
            Diambil dari data panitia acara — ubah lewat pembentukan kepanitiaan, bukan di sini.
          </p>
          {awal.susunan.length ? (
            <div className="grid gap-3 sm:grid-cols-2" data-testid="proposal-susunan">
              {awal.susunan.map((g, i) => (
                <div
                  key={`${g.nama_divisi}-${i}`}
                  className="rounded-sm border border-default p-3"
                  data-testid="proposal-susunan-divisi"
                >
                  <p className="text-[13px] font-semibold">{g.nama_divisi}</p>
                  <ul className="mt-1 text-[13px]">
                    {g.anggota.length ? (
                      g.anggota.map((a, j) => (
                        <li key={`${a.nim}-${j}`}>
                          <span className="text-secondary">{a.jabatan}:</span> {a.nama}
                        </li>
                      ))
                    ) : (
                      <li className="text-tertiary">Belum ada anggota.</li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-secondary">Kepanitiaan belum dibentuk.</p>
          )}
        </Bagian>

        <Bagian id="anggaran" no={6} judul="Anggaran">
          <p className="text-[12px] text-secondary">
            Diambil otomatis dari RAB — rincian per item ikut sebagai Lampiran I.
          </p>
          {ang === 'TERBATAS' ? (
            <p className="text-[13px] text-secondary">
              Rincian anggaran hanya dapat dibaca pimpinan, Kadept penanggung jawab, dan panitia
              acara ini.
            </p>
          ) : (
            <table className="w-full text-[13px]" data-testid="proposal-anggaran">
              <tbody>
                {ang.divisi.map((d, i) => (
                  <tr key={`${d.nama}-${i}`} className="border-b border-default">
                    <td className="py-1">{d.nama}</td>
                    <td className="py-1 text-right tabular-nums">{formatRupiah(d.total)}</td>
                  </tr>
                ))}
                {ang.dana_tak_terduga ? (
                  <tr className="border-b border-default">
                    <td className="py-1">Dana tak terduga</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatRupiah(ang.dana_tak_terduga)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <th className="py-1 text-left">Total</th>
                  <td
                    className="py-1 text-right font-semibold tabular-nums"
                    data-testid="proposal-anggaran-total"
                  >
                    {formatRupiah(ang.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
          <Link
            href={`/acara/${awal.kepanitiaan_id}?tab=rab`}
            className="inline-flex items-center gap-1 text-[13px] font-medium underline"
          >
            Ubah di RAB <ExternalLink aria-hidden="true" className="size-3.5" />
          </Link>
        </Bagian>

        <Bagian id="penutup" no={7} judul="Penutup">
          <Field judul="Penutup" field="penutup" asal={data.asal}>
            <TeksKaya
              label="Penutup proposal"
              konten={data.penutup}
              bolehTulis={tulis}
              onChange={(k) => ubah('penutup', k)}
            />
          </Field>
        </Bagian>

        <Bagian id="lampiran" no={8} judul="Lampiran">
          <p className="text-[12px] text-secondary">
            Lampiran I rincian RAB, Lampiran II struktur kepanitiaan, Lampiran III susunan kegiatan
            — ditarik saat dokumen dibuat.
          </p>
          {awal.rundown.length ? (
            <ul className="grid gap-1 text-[13px]" data-testid="proposal-rundown">
              {awal.rundown.map((r) => (
                <li key={r.id} className="flex flex-wrap gap-x-2 border-b border-default pb-1">
                  <span className="text-secondary">{formatTanggalPanjang(r.tanggal)}</span>
                  <span className="tabular-nums">
                    {r.waktu_mulai
                      ? `${r.waktu_mulai}${r.waktu_selesai ? `–${r.waktu_selesai}` : ''}`
                      : ''}
                  </span>
                  <span className="font-medium">{r.acara}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-secondary">
              Rundown belum disusun —{' '}
              <Link href={`/acara/${awal.kepanitiaan_id}/tor#bagian-rundown`} className="underline">
                susun di TOR
              </Link>
              .
            </p>
          )}
        </Bagian>
      </div>
    </div>
  );
}
