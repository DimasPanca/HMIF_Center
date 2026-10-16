'use client';

/**
 * Grid RAB inline-editable (T-087, PRD F-9.3, DESIGN_SYSTEM §9.3).
 *
 *   Divisi → Sub-section → Item. Bukan komponen spreadsheet pihak ketiga.
 *
 * ===========================================================================
 * ALIRAN DATA
 * ===========================================================================
 * Setiap ketikan langsung mengubah state lewat `terapkanUbah` — fungsi yang
 * SAMA dengan yang dijalankan server — sehingga total item, divisi, dan acara
 * berubah dalam satu render (< 100 ms, kontrak "Selesai bila"). Penyimpanan
 * terjadi saat sel ditinggalkan: PATCH berisi field yang berubah saja, dan
 * jawaban server menimpa state (INV-27). Bila total server berbeda dari
 * hitungan klien, pengguna diberi tahu.
 *
 * Penyimpanan diantrekan berurutan; aksi struktur (tambah/hapus) menunggu
 * antrean kosong lebih dulu supaya pohon baru dari server tidak menimpa ketikan
 * yang sedang dikirim.
 *
 * Divisi tanpa hak tulis dirender tanpa satu pun input/tombol (INV-30); bila
 * RAB terkunci (DISETUJUI dst.), semua divisi begitu (INV-29).
 *
 * Test id: rab-grid, rab-divisi (data-divisi-id, data-boleh-tulis),
 * rab-divisi-total, rab-tambah-item, rab-tambah-section(-nama),
 * rab-tambah-divisi(-nama), rab-hapus-divisi, rab-terkunci.
 */

import { Plus, Trash2 } from 'lucide-react';
import * as React from 'react';

import { RabRow, type Kolom } from '@/components/rab/RabRow';
import { hitungRab } from '@/lib/rab/calculate';
import { RabSectionHeader } from '@/components/rab/RabSectionHeader';
import { RabFooter, RabSummary } from '@/components/rab/RabSummary';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ToastProvider, useToast } from '@/components/ui/toast';
import {

  jumlahkanDivisi,
  jumlahkanSection,
  terapkanUbah,
  type DivisiRab,
  type ItemRab,
  type UbahItem,
} from '@/lib/rab/item';
import type { DataRab, ItemTerverifikasi } from '@/lib/rab/service';
import { cn } from '@/lib/utils';
import { formatRupiah } from '@/lib/utils/format-rupiah';

type Jawaban<T> = { ok?: boolean; data?: T; error?: { message?: string } };

const KOLOM_KIRIM: (keyof ItemRab & keyof UbahItem)[] = [
  'jenis_barang',
  'jumlah_teks',
  'jumlah_numerik',
  'harga_satuan',
  'total_manual',
  'total',
  'keterangan',
];

function semuaItem(divisi: DivisiRab[]): Map<string, ItemRab> {
  return new Map(divisi.flatMap((d) => d.sections.flatMap((s) => s.items.map((i) => [i.id, i] as const))));
}

function petaItem(divisi: DivisiRab[], id: string, f: (i: ItemRab) => ItemRab | null): DivisiRab[] {
  return divisi.map((d) => ({
    ...d,
    sections: d.sections.map((s) =>
      s.items.some((i) => i.id === id)
        ? {
            ...s,
            items: s.items
              .map((i) => (i.id === id ? f(i) : i))
              .filter((i): i is ItemRab => i !== null)
              .map((i, n) => ({ ...i, no_urut: n + 1 })),
          }
        : s,
    ),
  }));
}

function Grid({ awal, fokusDivisi }: { awal: DataRab; fokusDivisi?: string }) {
  const toast = useToast();
  const [data, setData] = React.useState(awal);
  const [lipat, setLipat] = React.useState<Set<string>>(() => new Set());
  const [baru, setBaru] = React.useState<string | null>(null);
  const [sibuk, setSibuk] = React.useState(false);
  const [namaDivisi, setNamaDivisi] = React.useState('');
  const [namaSection, setNamaSection] = React.useState<Record<string, string>>({});
  const [hapusDivisi, setHapusDivisi] = React.useState<DivisiRab | null>(null);
  const tersimpan = React.useRef(semuaItem(awal.divisi));
  const antrean = React.useRef<Promise<unknown>>(Promise.resolve());
  const wadah = React.useRef<HTMLDivElement>(null);
  const dataRef = React.useRef(data);
  dataRef.current = data;
  // Penanda hydration selesai: sebelum ini, ketikan pada HTML SSR belum didengar React.
  const [siap, setSiap] = React.useState(false);
  React.useEffect(() => setSiap(true), []);

  const tampil = fokusDivisi ? data.divisi.filter((d) => d.id === fokusDivisi) : data.divisi;
  // T-088: satu kalkulasi untuk footer & ringkasan; dana tak terduga di luar total divisi.
  const ringkasan = hitungRab(tampil, fokusDivisi ? 0 : data.dana_tak_terduga);

  const galat = (pesan: string) => toast.error({ description: pesan, suggestion: 'Periksa isian, atau muat ulang halaman bila berulang.' });

  const gantiData = (rab: DataRab) => {
    tersimpan.current = semuaItem(rab.divisi);
    setData(rab);
  };

  const ubahLokal = (id: string, u: UbahItem) => setData((d) => ({ ...d, divisi: petaItem(d.divisi, id, (i) => terapkanUbah(i, u)) }));

  const batal = (id: string) => {
    const lama = tersimpan.current.get(id);
    if (lama) setData((d) => ({ ...d, divisi: petaItem(d.divisi, id, () => lama) }));
  };

  const simpan = (id: string) => {
    // Dibaca saat dijalankan (bukan saat dijadwalkan) supaya ketikan terakhir ikut terkirim.
    // setTimeout 0: setState dari ketikan/klik yang memicu simpan sudah dirender,
    // jadi dataRef memuat nilai terbarunya (mis. toggle total manual).
    antrean.current = antrean.current.then(() => new Promise((r) => setTimeout(r, 0))).then(async () => {
      const kini = semuaItem(dataRef.current.divisi).get(id);
      const lama = tersimpan.current.get(id);
      if (!kini || !lama) return;
      const ubah: Record<string, unknown> = {};
      for (const k of KOLOM_KIRIM) if (kini[k] !== lama[k]) ubah[k] = kini[k];
      if (!Object.keys(ubah).length) return;
      if (!kini.total_manual) delete ubah.total;
      // Hitungan klien ikut dikirim untuk diverifikasi ulang server (INV-27, T-088).
      ubah.total_klien = kini.total;
      try {
        const r = await fetch(`/api/rab/item/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(ubah) });
        const isi = (await r.json().catch(() => null)) as Jawaban<ItemTerverifikasi> | null;
        if (!r.ok || !isi?.ok || !isi.data) throw new Error(isi?.error?.message ?? 'Item gagal disimpan.');
        const { diverifikasi, ...server } = isi.data;
        tersimpan.current.set(id, server);
        const lokal = semuaItem(dataRef.current.divisi).get(id);
        // Ketikan baru selama permintaan berjalan dipertahankan; selain itu server yang menang.
        if (lokal && KOLOM_KIRIM.every((k) => lokal[k] === kini[k])) {
          setData((d) => ({ ...d, divisi: petaItem(d.divisi, id, () => server) }));
        }
        if (diverifikasi.selisih) {
          toast.info({ description: `Total dihitung ulang server menjadi ${formatRupiah(diverifikasi.total_server)} (tampilan sebelumnya ${formatRupiah(kini.total)}).` });
        }
      } catch (e) {
        batal(id);
        galat(e instanceof Error ? e.message : 'Item gagal disimpan.');
      }
    });
  };

  async function aksi(body: Record<string, unknown>): Promise<string | null> {
    setSibuk(true);
    try {
      await antrean.current;
      const r = await fetch(`/api/kepanitiaan/${data.kepanitiaan_id}/rab`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const isi = (await r.json().catch(() => null)) as Jawaban<{ id: string | null; rab: DataRab }> | null;
      if (!r.ok || !isi?.ok || !isi.data) throw new Error(isi?.error?.message ?? 'Perubahan gagal disimpan.');
      gantiData(isi.data.rab);
      return isi.data.id;
    } catch (e) {
      galat(e instanceof Error ? e.message : 'Perubahan gagal disimpan.');
      return null;
    } finally {
      setSibuk(false);
    }
  }

  async function tambahItem(sectionId: string) {
    const id = await aksi({ aksi: 'TAMBAH_ITEM', section_id: sectionId });
    if (!id) return;
    setBaru(id);
    window.setTimeout(() => setBaru((b) => (b === id ? null : b)), 400);
    requestAnimationFrame(() => wadah.current?.querySelector<HTMLInputElement>(`[data-item-id="${id}"] [data-kolom="jenis"]`)?.focus());
  }

  async function hapusItem(id: string) {
    setSibuk(true);
    try {
      await antrean.current;
      const r = await fetch(`/api/rab/item/${id}`, { method: 'DELETE' });
      const isi = (await r.json().catch(() => null)) as Jawaban<unknown> | null;
      if (!r.ok || !isi?.ok) throw new Error(isi?.error?.message ?? 'Item gagal dihapus.');
      tersimpan.current.delete(id);
      setData((d) => ({ ...d, divisi: petaItem(d.divisi, id, () => null) }));
    } catch (e) {
      galat(e instanceof Error ? e.message : 'Item gagal dihapus.');
    } finally {
      setSibuk(false);
    }
  }

  const pindah = (divisiId: string) => (baris: number, kolom: Kolom) =>
    wadah.current?.querySelector<HTMLInputElement>(`[data-rab-divisi="${divisiId}"] [data-baris="${baris}"][data-kolom="${kolom}"]`)?.focus();

  return (
    <div ref={wadah} className="space-y-4" data-testid="rab-grid" data-status={data.status} data-siap={siap ? '1' : '0'}>
      {!data.terbuka ? (
        <p role="status" data-testid="rab-terkunci" className="rounded-sm bg-[var(--info-subtle)] p-3 text-[13px]">
          RAB berstatus {data.status} dan terkunci. Perubahan hanya dapat dilakukan setelah Bendahara membuka kuncinya.
        </p>
      ) : null}

      {tampil.map((d) => {
        let baris = 0;
        return (
          <section
            key={d.id}
            data-testid="rab-divisi"
            data-divisi-id={d.id}
            data-rab-divisi={d.id}
            data-boleh-tulis={d.boleh_tulis ? '1' : '0'}
            aria-label={`RAB Divisi ${d.nama}`}
            className="overflow-hidden rounded-sm border border-default bg-panel"
          >
            <header className="flex items-center gap-2 border-b border-default bg-subtle px-3 py-2">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: d.warna ?? 'var(--neutral)' }} />
              <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold uppercase">Divisi {d.nama}</h3>
              <span className="text-[14px] font-semibold tabular-nums">{formatRupiah(jumlahkanDivisi(d))}</span>
              {data.boleh_hapus_divisi && !fokusDivisi ? (
                <button
                  type="button"
                  onClick={() => setHapusDivisi(d)}
                  aria-label={`Hapus divisi ${d.nama}`}
                  data-testid="rab-hapus-divisi"
                  className="flex size-7 items-center justify-center rounded-sm text-tertiary hover:bg-[var(--danger-subtle)] hover:text-[var(--danger)]"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </header>

            {d.sections.length === 0 ? (
              <p className="px-3 py-3 text-[13px] text-secondary">Belum ada sub-section.</p>
            ) : null}

            {d.sections.map((s) => {
              const terbukaSection = !lipat.has(s.id);
              return (
                <div key={s.id} className="border-b border-default last:border-b-0">
                  <RabSectionHeader
                    id={s.id}
                    nama={s.nama}
                    subtotal={jumlahkanSection(s)}
                    jumlahItem={s.items.length}
                    terbuka={terbukaSection}
                    bolehTulis={d.boleh_tulis}
                    onToggle={() =>
                      setLipat((l) => {
                        const n = new Set(l);
                        if (n.has(s.id)) n.delete(s.id);
                        else n.add(s.id);
                        return n;
                      })
                    }
                    onGantiNama={(nama) => void aksi({ aksi: 'UBAH_SECTION', section_id: s.id, nama })}
                    onHapus={() => void aksi({ aksi: 'HAPUS_SECTION', section_id: s.id })}
                  />
                  {terbukaSection ? (
                    <div className="overflow-x-auto px-2 pb-2">
                      <table className="w-full min-w-[720px] border-collapse">
                        <thead>
                          <tr className="text-left text-[11px] font-semibold tracking-wide text-tertiary uppercase">
                            <th className="px-2 py-1">No</th>
                            <th className="px-1.5 py-1">Jenis barang</th>
                            <th className="px-1.5 py-1">Jumlah</th>
                            <th className="px-1.5 py-1 text-right">Harga satuan</th>
                            <th className="px-1.5 py-1 text-right">Total</th>
                            <th className="px-1.5 py-1">Keterangan</th>
                            <th className="w-9" aria-label="Aksi" />
                          </tr>
                        </thead>
                        <tbody>
                          {s.items.map((i) => (
                            <RabRow
                              key={i.id}
                              item={i}
                              baris={baris++}
                              bolehTulis={d.boleh_tulis}
                              baru={baru === i.id}
                              onUbah={(u) => ubahLokal(i.id, u)}
                              onSimpan={() => simpan(i.id)}
                              onBatal={() => batal(i.id)}
                              onHapus={() => void hapusItem(i.id)}
                              onPindah={pindah(d.id)}
                            />
                          ))}
                        </tbody>
                      </table>
                      {d.boleh_tulis ? (
                        <Button variant="ghost" className="mt-1" disabled={sibuk} onClick={() => void tambahItem(s.id)} data-testid="rab-tambah-item">
                          <Plus aria-hidden="true" /> Tambah item
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {d.boleh_tulis ? (
              <form
                className="flex flex-wrap items-center gap-2 border-t border-default px-3 py-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const nama = (namaSection[d.id] ?? '').trim();
                  if (!nama) return;
                  void aksi({ aksi: 'TAMBAH_SECTION', divisi_id: d.id, nama }).then((id) => id && setNamaSection((n) => ({ ...n, [d.id]: '' })));
                }}
              >
                <input
                  value={namaSection[d.id] ?? ''}
                  onChange={(e) => setNamaSection((n) => ({ ...n, [d.id]: e.target.value }))}
                  placeholder="Nama sub-section baru, mis. KONSUMSI PANITIA"
                  aria-label={`Nama sub-section baru Divisi ${d.nama}`}
                  maxLength={100}
                  data-testid="rab-tambah-section-nama"
                  className="h-8 min-w-48 flex-1 rounded-sm border border-default bg-panel px-2 text-[13px]"
                />
                <Button type="submit" variant="secondary" disabled={sibuk} data-testid="rab-tambah-section">
                  <Plus aria-hidden="true" /> Tambah sub-section
                </Button>
              </form>
            ) : null}

            <footer className="flex items-center justify-between bg-subtle px-3 py-2 text-[13px]">
              <span className="font-semibold uppercase">Total divisi</span>
              <span data-testid="rab-divisi-total" className={cn('font-semibold tabular-nums')}>
                {formatRupiah(jumlahkanDivisi(d))}
              </span>
            </footer>
          </section>
        );
      })}

      {data.boleh_tambah_divisi && !fokusDivisi ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!namaDivisi.trim()) return;
            void aksi({ aksi: 'TAMBAH_DIVISI', nama: namaDivisi.trim() }).then((id) => id && setNamaDivisi(''));
          }}
        >
          <input
            value={namaDivisi}
            onChange={(e) => setNamaDivisi(e.target.value)}
            placeholder="Nama divisi baru, mis. Konsumsi"
            aria-label="Nama divisi baru"
            maxLength={100}
            data-testid="rab-tambah-divisi-nama"
            className="h-[34px] min-w-48 flex-1 rounded-sm border border-default bg-panel px-2 text-[14px]"
          />
          <Button type="submit" variant="secondary" disabled={sibuk} data-testid="rab-tambah-divisi">
            <Plus aria-hidden="true" /> Tambah divisi
          </Button>
        </form>
      ) : null}

      {!fokusDivisi && tampil.length > 0 ? <RabSummary divisi={tampil} danaTakTerduga={ringkasan.danaTakTerduga} itemTanpaJumlah={ringkasan.itemTanpaJumlah} /> : null}
      <RabFooter total={ringkasan.grandTotal} danaTakTerduga={ringkasan.danaTakTerduga} />

      <ConfirmDialog
        level="typed"
        confirmationText={hapusDivisi?.nama ?? ''}
        open={hapusDivisi !== null}
        onOpenChange={(b) => !b && setHapusDivisi(null)}
        title={`Hapus Divisi ${hapusDivisi?.nama ?? ''}?`}
        description="Seluruh sub-section, item RAB, anggota, Kanban, dan Gantt divisi ini ikut terhapus. Divisi yang sudah punya nota tidak dapat dihapus. Ketik nama divisi untuk memastikan."
        confirmLabel="Hapus divisi"
        confirmVariant="danger"
        onConfirm={() => {
          const d = hapusDivisi;
          setHapusDivisi(null);
          if (d) void aksi({ aksi: 'HAPUS_DIVISI', divisi_id: d.id });
        }}
      />
    </div>
  );
}

export function RabGrid(props: { awal: DataRab; fokusDivisi?: string }) {
  return (
    <ToastProvider>
      <Grid {...props} />
    </ToastProvider>
  );
}
