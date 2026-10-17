import { gunzipSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  DAFTAR_MODUL,
  MODUL_BACKUP,
  TABEL_DIKECUALIKAN,
  susunDumpSql,
  susunModul,
  type IsiTabel,
} from '@/lib/backup/export-modul';
import {
  JALUR,
  SkemaManifest,
  berkasHilang,
  sha256,
  slug,
  verifikasiBerkas,
  type Manifest,
} from '@/lib/backup/manifest';
import {
  prosesBackup,
  type CatatanBackup,
  type Progres,
  type SumberBackup,
} from '@/lib/backup/service';
import { bagiVolume, periksaArsip } from '@/lib/backup/zip-storage';
import type { StorageObject } from '@/lib/storage/adapter';

const ID = 'b0000000-0000-4000-8000-000000000001';
const awalan = `backup/${ID}/`;

function tabel(nama: string, baris: Record<string, unknown>[] = []): IsiTabel {
  const kolom = baris[0] ? Object.keys(baris[0]) : ['id'];
  return {
    nama,
    kolom,
    serial: nama === 'audit_log' ? ['id'] : [],
    jumlah: baris.length,
    json: JSON.stringify(baris, null, 4),
  };
}

/** Storage di memori; `rusakkan` mengubah isi satu key setelah ditulis (simulasi korupsi). */
function storageMemori(awal: Record<string, Buffer> = {}, rusakkan?: string) {
  const isi = new Map<string, Buffer>(Object.entries(awal));
  return {
    isi,
    async put(key: string, data: Buffer | Blob) {
      let b = Buffer.isBuffer(data) ? data : Buffer.from(await data.arrayBuffer());
      if (rusakkan && key.endsWith(rusakkan)) b = Buffer.concat([b, Buffer.from('x')]);
      isi.set(key, b);
      return { key };
    },
    async get(key: string) {
      const b = isi.get(key);
      if (!b) throw new Error(`tidak ada: ${key}`);
      return b;
    },
    async list(prefix: string): Promise<StorageObject[]> {
      return [...isi.entries()]
        .filter(([k]) => k.startsWith(prefix))
        .map(([key, b]) => ({ key, size: b.length, contentType: null, updatedAt: null }));
    },
    async delete(key: string) {
      isi.delete(key);
    },
  };
}

function sumber(
  st: ReturnType<typeof storageMemori>,
  ubah: Partial<SumberBackup> = {},
): SumberBackup {
  return {
    storage: st,
    versiSkema: () => '1',
    migrasiTerakhir: async () => '047_lpj_hapus_kaskade',
    tabelTanpaModul: async () => [],
    bacaTabel: async (nama) =>
      nama === 'proker'
        ? tabel(nama, [
            { id: 'p1', nama: 'SYNCHRONIZE', anggaran: '12500000.50' },
            { id: 'p2', nama: "O'Brien $$ test", anggaran: null },
          ])
        : nama === 'audit_log'
          ? tabel(nama, [{ id: 7, aksi: 'LOGIN' }])
          : tabel(nama),
    pgDump: async () => ({ gagal: 'binary pg_dump tidak tersedia di lingkungan ini' }),
    daftarAcara: async () => [
      { id: 'k1aaaaaa-0000', nama_acara: 'SYNCHRONIZE 2026' },
      { id: 'k2bbbbbb-0000', nama_acara: 'Synchronize 2026' },
    ],
    eksporRab: async (id) => Buffer.from(`xlsx-${id}`),
    daftarSurat: async () => ({ xlsx: Buffer.from('xlsx-surat') }),
    ...ubah,
  };
}

function catatanMemori() {
  const log: {
    progres: Progres[];
    sukses?: { manifest: Manifest; ukuran: number };
    gagal?: string;
  } = { progres: [] };
  const c: CatatanBackup = {
    progres: async (_id, p) => void log.progres.push(p),
    sukses: async (_id, manifest, ukuran) => void (log.sukses = { manifest, ukuran }),
    gagal: async (_id, pesan) => void (log.gagal = pesan),
  };
  return { c, log };
}

const BERKAS_STORAGE = {
  'nota/master/n1.jpg': Buffer.from('jpeg-master'),
  'nota/thumb/n1.webp': Buffer.from('thumb'),
  'dokumen/lpj/k1.docx': Buffer.from('docx'),
  'ttd/u1.png': Buffer.from('ttd'),
  'backup/lama/manifest.json': Buffer.from('{}'),
};

describe('backup-service: modul & dump', () => {
  it('12 modul PRD F-16.1, tanpa tabel ganda, tidak memuat tabel yang dikecualikan', () => {
    expect(DAFTAR_MODUL).toEqual([
      'users',
      'periode',
      'departemen',
      'prokers',
      'gantt',
      'kepanitiaan',
      'rab',
      'nota',
      'surat',
      'notulensi',
      'pengurus',
      'audit-log',
    ]);
    const semua = Object.values(MODUL_BACKUP).flat();
    expect(new Set(semua).size).toBe(semua.length);
    for (const t of TABEL_DIKECUALIKAN) expect(semua).not.toContain(t);
  });

  it('modul JSON valid; angka NUMERIC tetap teks apa adanya dari Postgres', () => {
    const buf = susunModul(
      'prokers',
      [tabel('proker', [{ id: 'p1', anggaran: 12500000.5 }]), tabel('proker_lock')],
      { versiSkema: 'v', migrasiTerakhir: '047', dibuatPada: 't' },
    );
    const j = JSON.parse(buf.toString('utf8'));
    expect(j).toMatchObject({
      modul: 'prokers',
      versiSkema: 'v',
      migrasiTerakhir: '047',
      tabel: { proker: [{ id: 'p1', anggaran: 12500000.5 }], proker_lock: [] },
    });
  });

  it('dump fallback: data via jsonb_populate_recordset, trigger dimatikan, sequence disetel ulang, dollar-quote aman', () => {
    const sql = susunDumpSql(
      [
        tabel('proker', [{ id: 'p1', nama: 'Ada $hmif_ di sini' }]),
        tabel('audit_log', [{ id: 7 }]),
        tabel('kosong'),
      ],
      { versiSkema: '1', migrasiTerakhir: '047', dibuatPada: 't' },
    );
    expect(sql).toContain('SET LOCAL session_replication_role = replica;');
    expect(sql).toMatch(
      /INSERT INTO public\."proker" \("id", "nama"\)\n {2}SELECT "id", "nama" FROM jsonb_populate_recordset\(NULL::public\."proker", \$hmif_[0-9a-f]{12}\$/,
    );
    expect(sql).toContain(`pg_get_serial_sequence('public."audit_log"', 'id')`);
    expect(sql).not.toContain('INSERT INTO public."kosong"');
    expect(sql.trim().endsWith('COMMIT;')).toBe(true);
  });

  it('slug nama acara aman untuk nama berkas', () => {
    expect(slug('SYNCHRONIZE 2026: Satu/Langkah')).toBe('synchronize-2026-satu-langkah');
    expect(slug('***')).toBe('acara');
  });
});

describe('backup-service: prosesBackup', () => {
  it('bundel lengkap PRD F-16.1, setiap berkas ber-checksum yang cocok, manifest ditulis paling akhir', async () => {
    const st = storageMemori({ ...BERKAS_STORAGE });
    const urutan: string[] = [];
    const put = st.put;
    st.put = async (k, d) => {
      urutan.push(k);
      return put(k, d);
    };
    const { c, log } = catatanMemori();
    const h = await prosesBackup(ID, 'MANUAL', sumber(st), c);

    expect(h.ok).toBe(true);
    expect(log.gagal).toBeUndefined();
    const m = SkemaManifest.parse(
      JSON.parse(st.isi.get(`${awalan}${JALUR.manifest}`)!.toString('utf8')),
    );
    expect(log.sukses!.manifest).toEqual(m);
    expect(urutan.at(-1)).toBe(`${awalan}${JALUR.manifest}`);
    expect(berkasHilang(m, DAFTAR_MODUL)).toEqual([]);
    // Nama acara sama (beda huruf) → slug kedua diberi potongan id.
    expect(m.files.map((f) => f.path)).toEqual(
      expect.arrayContaining([
        'exports/rab-synchronize-2026.xlsx',
        'exports/rab-synchronize-2026-k2bbbbbb.xlsx',
      ]),
    );
    expect((await verifikasiBerkas(m, (p) => st.get(`${awalan}${p}`))).ok).toBe(true);
    expect(m.jumlahRecord).toMatchObject({ prokers: 2, 'audit-log': 1, rab: 0 });
    expect(log.sukses!.ukuran).toBe(
      m.files.reduce((n, f) => n + f.size, 0) + st.isi.get(`${awalan}${JALUR.manifest}`)!.length,
    );

    // Arsip: seluruh storage kecuali backup/, setiap berkas cocok dengan indeks.
    const zip = st.isi.get(`${awalan}${JALUR.arsip(1)}`)!;
    expect(periksaArsip(zip)).toEqual({ jumlah: 4, rusak: [] });
    expect(m.jumlahBerkasStorage).toBe(4);
    expect(m.volumeArsip).toBe(1);

    // Dump fallback tercatat sebagai keterbatasan dan tetap dapat di-gunzip.
    expect(m.dump.metode).toBe('sql_per_tabel');
    expect(m.keterbatasan.join(' ')).toMatch(/pg_dump tidak dipakai .*047_lpj_hapus_kaskade/);
    const sql = gunzipSync(st.isi.get(`${awalan}${JALUR.dump}`)!).toString('utf8');
    expect(sql).toContain(`O'Brien $$ test`);
    expect(log.progres.map((p) => p.tahap)).toEqual(
      expect.arrayContaining(['DUMP', 'MODUL', 'EKSPOR', 'ARSIP', 'VERIFIKASI', 'MANIFEST']),
    );
    expect(log.progres.every((p) => p.persen >= 0 && p.persen < 100)).toBe(true);
  });

  it('arsip melebihi batas unggah → dipecah per volume, setiap volume ZIP utuh ber-checksum', async () => {
    expect(
      bagiVolume([{ size: 4 }, { size: 4 }, { size: 4 }, { size: 20 }, { size: 1 }], 10).map(
        (v) => v.length,
      ),
    ).toEqual([2, 1, 1, 1]);
    expect(bagiVolume([], 10)).toEqual([[]]);
    const lama = process.env.BACKUP_BATAS_VOLUME_MB;
    process.env.BACKUP_BATAS_VOLUME_MB = String(12 / 1024 / 1024); // 12 byte
    try {
      const st = storageMemori({ ...BERKAS_STORAGE });
      const { c } = catatanMemori();
      const h = await prosesBackup(ID, 'MANUAL', sumber(st), c);
      expect(h.ok).toBe(true);
      if (!h.ok) return;
      // Urut key: docx 4 B | jpg 11 B | webp 5 B + png 3 B → tiga volume.
      expect(h.manifest.volumeArsip).toBe(3);
      expect(
        h.manifest.files.map((f) => f.path).filter((p) => p.startsWith(JALUR.awalanArsip)),
      ).toEqual([
        'files/storage-archive.zip',
        'files/storage-archive-2.zip',
        'files/storage-archive-3.zip',
      ]);
      let total = 0;
      for (let n = 1; n <= 3; n++) {
        const a = periksaArsip(st.isi.get(`${awalan}${JALUR.arsip(n)}`)!);
        expect(a.rusak).toEqual([]);
        total += a.jumlah;
      }
      expect(total).toBe(h.manifest.jumlahBerkasStorage);
    } finally {
      if (lama === undefined) delete process.env.BACKUP_BATAS_VOLUME_MB;
      else process.env.BACKUP_BATAS_VOLUME_MB = lama;
    }
  });

  it('pg_dump tersedia → dump-nya dipakai apa adanya', async () => {
    const st = storageMemori();
    const { c } = catatanMemori();
    const h = await prosesBackup(
      ID,
      'OTOMATIS',
      sumber(st, { pgDump: async () => ({ sql: Buffer.from('-- PostgreSQL database dump') }) }),
      c,
    );
    expect(h.ok && h.manifest.dump.metode).toBe('pg_dump');
    expect(gunzipSync(st.isi.get(`${awalan}${JALUR.dump}`)!).toString()).toBe(
      '-- PostgreSQL database dump',
    );
  });

  it('kegagalan di tengah → GAGAL dengan pesan, tanpa manifest, berkas terunggah dibersihkan', async () => {
    const st = storageMemori({ ...BERKAS_STORAGE });
    const { c, log } = catatanMemori();
    const h = await prosesBackup(
      ID,
      'MANUAL',
      sumber(st, { daftarSurat: async () => Promise.reject(new Error('koneksi putus')) }),
      c,
    );
    expect(h).toMatchObject({ ok: false, pesan: 'koneksi putus' });
    expect(log.sukses).toBeUndefined();
    expect(log.gagal).toBe('koneksi putus');
    expect([...st.isi.keys()].filter((k) => k.startsWith(awalan))).toEqual([]);
    expect(st.isi.has('nota/master/n1.jpg')).toBe(true);
  });

  it('berkas rusak di storage → verifikasi gagal, backup TIDAK sukses, pesan menyebut berkasnya', async () => {
    const st = storageMemori({}, 'modules/rab.json');
    const { c, log } = catatanMemori();
    const h = await prosesBackup(ID, 'MANUAL', sumber(st), c);
    expect(h.ok).toBe(false);
    expect(log.sukses).toBeUndefined();
    expect(log.gagal).toMatch(/Verifikasi gagal: modules\/rab\.json/);
    expect(st.isi.has(`${awalan}${JALUR.manifest}`)).toBe(false);
  });

  it('pencatatan SUKSES gagal (baris sudah ditandai terhenti) → bundel dibersihkan', async () => {
    const st = storageMemori();
    const { c, log } = catatanMemori();
    c.sukses = async () =>
      Promise.reject(new Error('Backup sudah tidak berstatus BERJALAN (ditandai terhenti).'));
    const h = await prosesBackup(ID, 'MANUAL', sumber(st), c);
    expect(h.ok).toBe(false);
    expect(log.gagal).toMatch(/terhenti/);
    expect([...st.isi.keys()].filter((k) => k.startsWith(awalan))).toEqual([]);
  });

  it('tabel baru tanpa modul tetap ikut dump dan tercatat di keterbatasan', async () => {
    const st = storageMemori();
    const { c } = catatanMemori();
    const h = await prosesBackup(
      ID,
      'MANUAL',
      sumber(st, { tabelTanpaModul: async () => ['tabel_baru'] }),
      c,
    );
    expect(h.ok).toBe(true);
    if (!h.ok) return;
    expect(h.manifest.keterbatasan[0]).toContain('tabel_baru');
    expect(h.manifest.dump.tabel).toContain('tabel_baru');
  });

  it('verifikasiBerkas melaporkan berkas hilang dan checksum salah', async () => {
    const isi = Buffer.from('abc');
    const r = await verifikasiBerkas(
      {
        files: [
          { path: 'a', size: 3, checksum: sha256(isi) },
          { path: 'b', size: 3, checksum: sha256(isi) },
          { path: 'c', size: 3, checksum: '0'.repeat(64) },
        ],
      },
      async (p) => (p === 'b' ? Promise.reject(new Error('404')) : isi),
    );
    expect(r.ok).toBe(false);
    expect(r.rusak.map((x) => x.path)).toEqual(['b', 'c']);
  });
});
