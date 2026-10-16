'use client';

/**
 * Editor TOR 14 bagian (T-094, PRD F-10.1).
 *
 *   - Teks kaya (3, 5, 7, 13) memakai NotulensiEditor yang dimuat dinamis;
 *     pembaca melihat KontenProsa (tanpa TipTap).
 *   - Bagian 11 (rundown) disinkronkan ke tabel `rundown`, bukan tor.data.
 *   - Bagian 12 (anggaran) & 14 (penandatangan) hanya tampilan: ditarik dari
 *     RAB dan data acara/periode — tidak ada satu pun input di sana.
 *   - Auto-save tiap 10 detik bila ada perubahan + "Simpan sekarang".
 *   - Penghitung "x dari 14 bagian terisi" dihitung `kelengkapanTor` — fungsi
 *     yang sama dipakai generator T-095 untuk menolak dokumen bolong.
 *   - "Buat dokumen TOR" (T-095) menyimpan dulu, lalu generate; bagian yang
 *     kurang ditampilkan apa adanya dari server.
 */

import { Check, Download, ExternalLink, FileText } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

import { BagianRepeatable } from '@/components/tor/BagianRepeatable';
import { Teks, TeksKaya } from '@/components/tor/BidangDokumen';
import { ParameterKelulusan } from '@/components/tor/ParameterKelulusan';
import { RundownEditor, galatRundown } from '@/components/tor/RundownEditor';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { DataTorLengkap } from '@/lib/tor/service';
import {
  BAGIAN_TOR,
  SkemaDataTor,
  bagianTerisi,
  type BarisRundown,
  type DataTor,
  type IdBagianTor,
} from '@/lib/tor/schema';
import { formatRupiah } from '@/lib/utils/format-rupiah';
import { formatTanggalWaktu } from '@/lib/utils/format-tanggal';

export const SELANG_AUTOSAVE_TOR_MS = 10_000;

type Status = 'tersimpan' | 'berubah' | 'menyimpan' | 'gagal';
type Respons =
  { ok: true; data: { diperbarui_at: string } } | { ok: false; error?: { message?: string } };

function Bagian({
  id,
  no,
  judul,
  terisi,
  children,
}: {
  id: IdBagianTor;
  no: number;
  judul: string;
  terisi: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`bagian-${id}`}
      aria-labelledby={`bagian-${id}-judul`}
      className="scroll-mt-14"
      data-testid={`tor-bagian-${id}`}
      data-terisi={terisi ? '1' : '0'}
    >
      <Card className="space-y-3 p-4">
        <h2 id={`bagian-${id}-judul`} className="flex items-center gap-2 text-[15px] font-semibold">
          <span className="tabular-nums text-tertiary">{no}.</span> {judul}
          {terisi ? <Check aria-label="terisi" className="size-4 text-success" /> : null}
        </h2>
        {children}
      </Card>
    </section>
  );
}

type ResponsGenerate =
  | { ok: true; data: { dokumen_id: string } }
  | { ok: false; error?: { message?: string; details?: { kurang?: string[] } } };

export function TorEditor({
  awal,
  hariH,
  dokumenTerakhir,
}: {
  awal: DataTorLengkap;
  hariH: string | null;
  /** ISO waktu TOR terakhir dibuat, null bila belum pernah. */
  dokumenTerakhir: string | null;
}) {
  const tulis = awal.boleh_tulis;
  const [dokumenAt, setDokumenAt] = React.useState(dokumenTerakhir);
  const [membuat, setMembuat] = React.useState(false);
  const [galatBuat, setGalatBuat] = React.useState<{ pesan: string; kurang: string[] } | null>(
    null,
  );
  const [data, setDataMentah] = React.useState<DataTor>(awal.data);
  const [rundown, setRundownMentah] = React.useState<BarisRundown[]>(awal.rundown);
  const [status, setStatus] = React.useState<Status>('tersimpan');
  const [galat, setGalat] = React.useState<string | null>(null);
  const [disimpanAt, setDisimpanAt] = React.useState(awal.diperbarui_at);
  const kotor = React.useRef(false);
  const terbaru = React.useRef({ data, rundown });
  terbaru.current = { data, rundown };
  const sedang = React.useRef(false);
  // Penanda hidrasi untuk gate e2e: input sebelum hidrasi akan diabaikan React.
  const [siap, setSiap] = React.useState(false);
  React.useEffect(() => setSiap(true), []);

  const tandai = () => {
    kotor.current = true;
    setStatus('berubah');
  };
  const setData = (f: (d: DataTor) => DataTor) => {
    setDataMentah(f);
    tandai();
  };
  const setRundown = (r: BarisRundown[]) => {
    setRundownMentah(r);
    tandai();
  };
  const bidang =
    <K extends keyof DataTor>(k: K) =>
    (v: DataTor[K]) =>
      setData((d) => ({ ...d, [k]: v }));

  const galatBaris = galatRundown(rundown);
  const rundownValid = galatBaris.size === 0;

  const simpan = React.useCallback(async () => {
    if (sedang.current || !kotor.current) return;
    const { data: d, rundown: r } = terbaru.current;
    const cek = SkemaDataTor.safeParse(d);
    if (!cek.success) {
      setGalat(cek.error.issues[0]?.message ?? 'Isian TOR tidak valid.');
      setStatus('gagal');
      return;
    }
    const kirimRundown = galatRundown(r).size === 0;
    sedang.current = true;
    kotor.current = false;
    setStatus('menyimpan');
    try {
      const res = await fetch(`/api/tor/${awal.kepanitiaan_id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(kirimRundown ? { data: d, rundown: r } : { data: d }),
      });
      const b = (await res.json().catch(() => null)) as Respons | null;
      if (!res.ok || !b?.ok)
        throw new Error((b && !b.ok && b.error?.message) || 'TOR gagal disimpan.');
      setDisimpanAt(b.data.diperbarui_at);
      setGalat(null);
      // Rundown yang ditahan karena baris belum lengkap tetap "berubah".
      if (!kirimRundown) kotor.current = true;
      setStatus(kotor.current ? 'berubah' : 'tersimpan');
    } catch (e) {
      kotor.current = true;
      setGalat(e instanceof Error ? e.message : 'TOR gagal disimpan.');
      setStatus('gagal');
    } finally {
      sedang.current = false;
    }
  }, [awal.kepanitiaan_id]);

  React.useEffect(() => {
    if (!tulis) return;
    const id = window.setInterval(() => void simpan(), SELANG_AUTOSAVE_TOR_MS);
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
    setGalatBuat(null);
    try {
      kotor.current = true;
      await simpan();
      const res = await fetch(`/api/tor/${awal.kepanitiaan_id}/generate`, { method: 'POST' });
      const b = (await res.json().catch(() => null)) as ResponsGenerate | null;
      if (!res.ok || !b?.ok) {
        const e = b && !b.ok ? b.error : undefined;
        setGalatBuat({
          pesan: e?.message || 'TOR gagal dibuat.',
          kurang: e?.details?.kurang ?? [],
        });
        return;
      }
      setDokumenAt(new Date().toISOString());
    } catch {
      setGalatBuat({ pesan: 'Tidak dapat menghubungi server. Coba lagi.', kurang: [] });
    } finally {
      setMembuat(false);
    }
  };

  const faktaLuar = {
    rundown: rundown.length - galatBaris.size,
    anggaran: awal.anggaran !== 'TERBATAS' && awal.anggaran.total_divisi > 0,
    penandatangan: !!awal.penandatangan.ketua_pelaksana && !!awal.penandatangan.ketua_himpunan,
  };
  const terisi = bagianTerisi(data, faktaLuar);
  const jumlahTerisi = BAGIAN_TOR.filter((b) => terisi[b.id]).length;
  const anggaran = awal.anggaran;

  return (
    <div
      className="grid gap-4 lg:grid-cols-[14rem_1fr]"
      data-testid="tor-editor"
      data-siap={siap ? '1' : '0'}
    >
      <aside className="lg:sticky lg:top-14 lg:self-start">
        <Card className="space-y-3 p-4">
          <p
            className="text-[13px] font-semibold"
            data-testid="tor-kelengkapan"
            data-terisi={jumlahTerisi}
          >
            {jumlahTerisi} dari {BAGIAN_TOR.length} bagian terisi
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
            <div
              className="h-full bg-[var(--primary)]"
              style={{ width: `${(jumlahTerisi / BAGIAN_TOR.length) * 100}%` }}
            />
          </div>
          <nav aria-label="Bagian TOR">
            <ol className="grid gap-0.5 text-[13px]">
              {BAGIAN_TOR.map((b) => (
                <li key={b.id}>
                  <a
                    href={`#bagian-${b.id}`}
                    className="flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-secondary hover:bg-subtle hover:text-primary"
                  >
                    <span className="w-5 tabular-nums text-tertiary">{b.no}.</span>
                    <span className="min-w-0 flex-1 truncate">{b.judul}</span>
                    {terisi[b.id] ? (
                      <Check aria-label="terisi" className="size-3.5 shrink-0 text-success" />
                    ) : null}
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
                data-testid="tor-status"
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
                data-testid="tor-simpan"
              >
                Simpan sekarang
              </Button>
              <Button
                type="button"
                className="w-full"
                onClick={() => void buatDokumen()}
                disabled={membuat || status === 'menyimpan'}
                data-testid="tor-buat-dokumen"
              >
                <FileText aria-hidden="true" /> {membuat ? 'Membuat…' : 'Buat dokumen TOR'}
              </Button>
              {galatBuat ? (
                <div role="alert" className="text-[12px] text-danger" data-testid="tor-buat-galat">
                  <p>
                    {galatBuat.kurang.length ? 'Lengkapi dulu bagian berikut:' : galatBuat.pesan}
                  </p>
                  {galatBuat.kurang.length ? (
                    <ul className="mt-1 list-disc pl-4">
                      {galatBuat.kurang.map((k) => (
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
              data-testid="tor-baca-saja"
            >
              Tampilan baca saja — TOR disusun panitia acara ini.
            </p>
          )}
          {dokumenAt ? (
            <a
              href={`/api/tor/${awal.kepanitiaan_id}/generate`}
              className="flex items-center gap-1.5 border-t border-default pt-3 text-[13px] font-medium underline"
              data-testid="tor-unduh"
            >
              <Download aria-hidden="true" className="size-4" /> Unduh TOR (
              {formatTanggalWaktu(dokumenAt)})
            </a>
          ) : null}
        </Card>
      </aside>

      <div className="min-w-0 space-y-4">
        <Bagian id="nama" no={1} judul="Nama Kegiatan" terisi={terisi.nama}>
          <Teks
            id="tor-nama"
            label="Nama kegiatan"
            nilai={data.nama_kegiatan}
            bolehTulis={tulis}
            maks={200}
            onChange={bidang('nama_kegiatan')}
          />
        </Bagian>

        <Bagian id="tema" no={2} judul="Tema Kegiatan" terisi={terisi.tema}>
          <Teks
            id="tor-tema"
            label="Tema kegiatan"
            nilai={data.tema}
            bolehTulis={tulis}
            maks={300}
            onChange={bidang('tema')}
          />
        </Bagian>

        <Bagian id="gambaran" no={3} judul="Gambaran Umum Kegiatan" terisi={terisi.gambaran}>
          <TeksKaya
            label="Gambaran umum kegiatan"
            konten={data.gambaran_umum}
            bolehTulis={tulis}
            onChange={bidang('gambaran_umum')}
          />
        </Bagian>

        <Bagian id="tujuan" no={4} judul="Tujuan Kegiatan" terisi={terisi.tujuan}>
          <BagianRepeatable<{ tujuan: string }>
            id="tujuan"
            baris={data.tujuan.map((t) => ({ tujuan: t }))}
            onChange={(b) => bidang('tujuan')(b.map((x) => x.tujuan))}
            bolehTulis={tulis}
            buat={() => ({ tujuan: '' })}
            labelTambah="Tambah tujuan"
            namaBaris="Tujuan"
            kolom={[
              { kunci: 'tujuan', label: 'Tujuan', tipe: 'teks', lebar: 'sm:col-span-4', maks: 500 },
            ]}
          />
        </Bagian>

        <Bagian id="bentuk" no={5} judul="Bentuk Acara" terisi={terisi.bentuk}>
          <TeksKaya
            label="Bentuk acara"
            konten={data.bentuk_acara.uraian}
            bolehTulis={tulis}
            onChange={(k) =>
              setData((d) => ({ ...d, bentuk_acara: { ...d.bentuk_acara, uraian: k } }))
            }
          />
          <BagianRepeatable
            id="bentuk-sub"
            baris={data.bentuk_acara.sub}
            onChange={(sub) => setData((d) => ({ ...d, bentuk_acara: { ...d.bentuk_acara, sub } }))}
            bolehTulis={tulis}
            buat={() => ({ judul: '', uraian: '' })}
            labelTambah="Tambah sub-bagian"
            namaBaris="Sub-bagian"
            kosong="Belum ada sub-bagian."
            kolom={[
              {
                kunci: 'judul',
                label: 'Judul sub-bagian',
                tipe: 'teks',
                lebar: 'sm:col-span-4',
                maks: 200,
              },
              {
                kunci: 'uraian',
                label: 'Uraian',
                tipe: 'panjang',
                lebar: 'sm:col-span-4',
                maks: 4000,
              },
            ]}
          />
        </Bagian>

        <Bagian
          id="waktu-tempat"
          no={6}
          judul="Waktu & Tempat Pelaksanaan"
          terisi={terisi['waktu-tempat']}
        >
          <BagianRepeatable
            id="waktu-tempat"
            baris={data.waktu_tempat}
            onChange={bidang('waktu_tempat')}
            bolehTulis={tulis}
            buat={() => ({ sesi: '', tanggal: hariH ?? '', waktu: '', tempat: '' })}
            labelTambah="Tambah sesi"
            namaBaris="Sesi"
            kolom={[
              { kunci: 'sesi', label: 'Nama sesi', tipe: 'teks', maks: 120 },
              { kunci: 'tanggal', label: 'Hari/Tanggal', tipe: 'tanggal' },
              {
                kunci: 'waktu',
                label: 'Waktu',
                tipe: 'teks',
                placeholder: '08.00–12.00 WIB',
                maks: 60,
              },
              { kunci: 'tempat', label: 'Tempat', tipe: 'teks', maks: 200 },
            ]}
          />
        </Bagian>

        <Bagian id="sasaran" no={7} judul="Sasaran Peserta" terisi={terisi.sasaran}>
          <TeksKaya
            label="Sasaran peserta"
            konten={data.sasaran.uraian}
            bolehTulis={tulis}
            onChange={(k) => setData((d) => ({ ...d, sasaran: { ...d.sasaran, uraian: k } }))}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['estimasi_jumlah', 'Estimasi jumlah peserta'],
                ['jumlah_kelompok', 'Jumlah kelompok'],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label htmlFor={`tor-${k}`} className="mb-1 block text-[12px] text-secondary">
                  {label}
                </label>
                <Input
                  id={`tor-${k}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  readOnly={!tulis}
                  value={data.sasaran[k] ?? ''}
                  onChange={(e) =>
                    setData((d) => ({
                      ...d,
                      sasaran: {
                        ...d.sasaran,
                        [k]: e.target.value === '' ? null : Math.trunc(Number(e.target.value)),
                      },
                    }))
                  }
                />
              </div>
            ))}
          </div>
        </Bagian>

        <Bagian id="kondisi" no={8} judul="Kondisi Pelaksanaan" terisi={terisi.kondisi}>
          <BagianRepeatable
            id="kondisi"
            baris={data.kondisi}
            onChange={bidang('kondisi')}
            bolehTulis={tulis}
            buat={() => ({ sesi: '', ketentuan: '' })}
            labelTambah="Tambah kondisi"
            namaBaris="Kondisi"
            kolom={[
              { kunci: 'sesi', label: 'Sesi', tipe: 'teks', maks: 120 },
              {
                kunci: 'ketentuan',
                label: 'Ketentuan',
                tipe: 'panjang',
                lebar: 'sm:col-span-3',
                maks: 2000,
              },
            ]}
          />
        </Bagian>

        <Bagian id="parameter" no={9} judul="Parameter Kelulusan" terisi={terisi.parameter}>
          <ParameterKelulusan
            baris={data.parameter}
            bolehTulis={tulis}
            onChange={bidang('parameter')}
          />
        </Bagian>

        <Bagian id="rangkaian" no={10} judul="Rangkaian Acara" terisi={terisi.rangkaian}>
          <BagianRepeatable
            id="rangkaian"
            baris={data.rangkaian}
            onChange={bidang('rangkaian')}
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
        </Bagian>

        <Bagian id="rundown" no={11} judul="Susunan Acara (Rundown)" terisi={terisi.rundown}>
          <p className="text-[12px] text-secondary">
            Rundown ini satu sumber dengan Proposal dan Surat Undangan acara ini.
          </p>
          <RundownEditor
            baris={rundown}
            bolehTulis={tulis}
            onChange={setRundown}
            tanggalAwal={hariH}
          />
          {tulis && !rundownValid ? (
            <p role="alert" className="text-[12px] text-warning" data-testid="tor-rundown-ditahan">
              Rundown belum disimpan sampai semua baris lengkap (tanggal dan nama acara).
            </p>
          ) : null}
        </Bagian>

        <Bagian id="anggaran" no={12} judul="Anggaran" terisi={terisi.anggaran}>
          <p className="text-[12px] text-secondary">
            Diambil otomatis dari RAB — ubah angkanya di RAB, bukan di sini.
          </p>
          {anggaran === 'TERBATAS' ? (
            <p className="text-[13px] text-secondary">
              Rincian anggaran hanya dapat dibaca pimpinan, Kadept penanggung jawab, dan panitia
              acara ini.
            </p>
          ) : (
            <table className="w-full text-[13px]" data-testid="tor-anggaran">
              <thead>
                <tr className="border-b border-default text-left text-secondary">
                  <th className="py-1 font-medium">Divisi</th>
                  <th className="py-1 text-right font-medium">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {anggaran.divisi.map((d, i) => (
                  <tr key={`${d.nama}-${i}`} className="border-b border-default">
                    <td className="py-1">{d.nama}</td>
                    <td className="py-1 text-right tabular-nums">{formatRupiah(d.total)}</td>
                  </tr>
                ))}
                {anggaran.dana_tak_terduga ? (
                  <tr className="border-b border-default">
                    <td className="py-1">Dana tak terduga</td>
                    <td className="py-1 text-right tabular-nums">
                      {formatRupiah(anggaran.dana_tak_terduga)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <th className="py-1 text-left">Total</th>
                  <td
                    className="py-1 text-right font-semibold tabular-nums"
                    data-testid="tor-anggaran-total"
                  >
                    {formatRupiah(anggaran.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
          <Link
            href={`/acara/${awal.kepanitiaan_id}?tab=rab`}
            className="inline-flex items-center gap-1 text-[13px] font-medium underline"
            data-testid="tor-ubah-di-rab"
          >
            Ubah di RAB <ExternalLink aria-hidden="true" className="size-3.5" />
          </Link>
        </Bagian>

        <Bagian id="penutup" no={13} judul="Penutup" terisi={terisi.penutup}>
          <TeksKaya
            label="Penutup"
            konten={data.penutup}
            bolehTulis={tulis}
            onChange={bidang('penutup')}
          />
        </Bagian>

        <Bagian id="penandatangan" no={14} judul="Penandatangan" terisi={terisi.penandatangan}>
          <dl className="grid gap-3 text-[13px] sm:grid-cols-2" data-testid="tor-penandatangan">
            <div>
              <dt className="text-secondary">Ketua Pelaksana</dt>
              <dd className="font-medium">
                {awal.penandatangan.ketua_pelaksana ?? 'Belum ditetapkan di data acara'}
              </dd>
            </div>
            <div>
              <dt className="text-secondary">Ketua Himpunan</dt>
              <dd className="font-medium">
                {awal.penandatangan.ketua_himpunan
                  ? `${awal.penandatangan.ketua_himpunan.nama} (${awal.penandatangan.ketua_himpunan.nim})`
                  : 'Belum terdaftar di periode ini'}
              </dd>
            </div>
          </dl>
          <p className="text-[12px] text-secondary">
            Diambil dari data acara dan pengurus periode; tanda tangan tersimpan dipakai saat
            dokumen dibuat.
          </p>
        </Bagian>
      </div>
    </div>
  );
}
