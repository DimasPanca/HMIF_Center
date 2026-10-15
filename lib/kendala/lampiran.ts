/**
 * Lampiran kendala (T-082). Server-only.
 *
 * Bucket PRIVAT `kendala/{kendala}/{lampiran}.{ext}`; diunduh lewat route yang
 * memeriksa hak baca, tidak pernah lewat URL publik. Hanya jenis berkas yang
 * lazim untuk bukti kendala, dan isinya dicocokkan dengan tanda tangan berkas
 * (magic bytes) — ekstensi dan `Content-Type` dari klien saja mudah dipalsukan.
 *
 * Unggah dulu, baru baris DB; baris gagal ditulis → berkas dihapus lagi.
 *
 * Sumber: T-082 · PRD F-7.3 · SYSTEM_DESIGN §12.2
 */

import { randomUUID } from 'node:crypto';

import type { Konteks } from '@/lib/auth/guard';
import { db } from '@/lib/db/client';
import { withAuditContext } from '@/lib/db/with-audit-context';
import { MAKS_LAMPIRAN_PER_KENDALA, MAKS_UKURAN_LAMPIRAN, kenaliBerkas, namaAman } from '@/lib/kendala/berkas';
import { boleh, type Hasil } from '@/lib/kendala/service';
import { keys, storage } from '@/lib/storage';

if (typeof window !== 'undefined') {
  throw new Error('lib/kendala/lampiran.ts adalah modul server-only dan tidak boleh diimpor dari sisi klien.');
}

async function kendalaUntuk(id: string) {
  return db.kendala.findUnique({ where: { id }, select: { id: true, departemen_id: true, periode_id: true } });
}

export async function unggahLampiran(request: Request, konteks: Konteks, kendalaId: string, berkas: File): Promise<Hasil<{ id: string }>> {
  const k = await kendalaUntuk(kendalaId);
  if (!k || !boleh(konteks, 'kendala.read', k.departemen_id)) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Kendala tidak ditemukan.' };
  if (k.periode_id !== konteks.periodeId || !boleh(konteks, 'kendala.create', k.departemen_id)) {
    return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'Anda tidak dapat menambah lampiran pada kendala ini.' };
  }
  if (berkas.size === 0 || berkas.size > MAKS_UKURAN_LAMPIRAN) {
    return { ok: false, kode: 'BERKAS_DITOLAK', pesan: 'Ukuran lampiran harus lebih dari 0 dan maksimal 5 MB.' };
  }
  const jumlah = await db.kendala_lampiran.count({ where: { kendala_id: kendalaId } });
  if (jumlah >= MAKS_LAMPIRAN_PER_KENDALA) {
    return { ok: false, kode: 'BERKAS_DITOLAK', pesan: `Paling banyak ${MAKS_LAMPIRAN_PER_KENDALA} lampiran per kendala.` };
  }
  const isi = Buffer.from(await berkas.arrayBuffer());
  const jenis = kenaliBerkas(berkas.name, isi);
  if (!jenis) return { ok: false, kode: 'BERKAS_DITOLAK', pesan: 'Jenis berkas tidak diterima. Gunakan PNG, JPG, WEBP, PDF, DOCX, atau XLSX.' };

  const id = randomUUID();
  const key = keys.kendalaLampiran(kendalaId, id, jenis.ext);
  await storage.put(key, isi, jenis.mime);
  try {
    await withAuditContext(request, konteks, (tx) =>
      tx.kendala_lampiran.create({
        data: { id, kendala_id: kendalaId, storage_key: key, nama_berkas: namaAman(berkas.name), mime_type: jenis.mime, ukuran: BigInt(isi.length), diunggah_oleh: konteks.sesi.userId },
      }),
    );
  } catch (e) {
    console.error(`[kendala] lampiran ${key} gagal dicatat`, e);
    await storage.delete(key).catch(() => undefined);
    return { ok: false, kode: 'BERKAS_DITOLAK', pesan: 'Lampiran gagal disimpan. Coba lagi.' };
  }
  return { ok: true, nilai: { id } };
}

export async function ambilLampiran(konteks: Konteks, lampiranId: string) {
  const l = await db.kendala_lampiran.findUnique({
    where: { id: lampiranId },
    select: { storage_key: true, nama_berkas: true, mime_type: true, kendala: { select: { departemen_id: true } } },
  });
  if (!l || !boleh(konteks, 'kendala.read', l.kendala.departemen_id)) return null;
  return { isi: await storage.get(l.storage_key), nama: l.nama_berkas, mime: l.mime_type };
}

export async function hapusLampiran(request: Request, konteks: Konteks, lampiranId: string): Promise<Hasil<{ id: string }>> {
  const l = await db.kendala_lampiran.findUnique({
    where: { id: lampiranId },
    select: { storage_key: true, diunggah_oleh: true, kendala: { select: { departemen_id: true, periode_id: true } } },
  });
  if (!l || !boleh(konteks, 'kendala.read', l.kendala.departemen_id)) return { ok: false, kode: 'TIDAK_DITEMUKAN', pesan: 'Lampiran tidak ditemukan.' };
  const pemilik = l.diunggah_oleh === konteks.sesi.userId;
  if (l.kendala.periode_id !== konteks.periodeId || !(pemilik || boleh(konteks, 'kendala.delete', l.kendala.departemen_id))) {
    return { ok: false, kode: 'TIDAK_BERWENANG', pesan: 'Hanya pengunggah atau pengelola departemen yang dapat menghapus lampiran ini.' };
  }
  await withAuditContext(request, konteks, (tx) => tx.kendala_lampiran.delete({ where: { id: lampiranId } }));
  await storage.delete(l.storage_key).catch(() => undefined);
  return { ok: true, nilai: { id: lampiranId } };
}
