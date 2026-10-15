import { describe, expect, it } from 'vitest';

import { cariBentrok, draftSuratDariBooking, labelWaktu, rentangBulan, type JadwalBooking } from '@/lib/ruangan/bentrok';
import { SkemaBooking, SkemaRuangan } from '@/lib/ruangan/skema';

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';

const jadwal = (id: string, o: Partial<JadwalBooking> = {}): JadwalBooking => ({
  id,
  ruangan_id: R1,
  tanggal: '2026-10-09',
  waktu_mulai: '14:00',
  waktu_selesai: '16:00',
  ...o,
});

describe('cariBentrok — peringatan, bukan blokir (PRD F-14.2)', () => {
  const ada = [
    jadwal('seminar'),
    jadwal('ruangan-lain', { ruangan_id: R2 }),
    jadwal('hari-lain', { tanggal: '2026-10-10' }),
    jadwal('pagi', { waktu_mulai: '08:00', waktu_selesai: '10:00' }),
  ];

  it('ruangan & tanggal sama dianggap bentrok walau jamnya bersambung (USER_FLOW §9.3)', () => {
    const b = cariBentrok({ ruangan_id: R1, tanggal: '2026-10-09', waktu_mulai: '16:00', waktu_selesai: null }, ada);
    expect(b.map((x) => x.booking.id).sort()).toEqual(['pagi', 'seminar']);
    expect(b.every((x) => !x.tumpangJam)).toBe(true);
  });

  it('jam beririsan ditandai dan diurutkan lebih dulu', () => {
    const b = cariBentrok({ ruangan_id: R1, tanggal: '2026-10-09', waktu_mulai: '15:00', waktu_selesai: '17:00' }, ada);
    expect(b[0]).toMatchObject({ booking: { id: 'seminar' }, tumpangJam: true });
    expect(b[1]).toMatchObject({ booking: { id: 'pagi' }, tumpangJam: false });
  });

  it('jam selesai kosong berarti sampai akhir hari', () => {
    const b = cariBentrok({ ruangan_id: R1, tanggal: '2026-10-09', waktu_mulai: '07:00', waktu_selesai: null }, ada);
    expect(b.filter((x) => x.tumpangJam)).toHaveLength(2);
  });

  it('ruangan atau tanggal lain tidak bentrok, dan booking tidak bentrok dengan dirinya', () => {
    expect(cariBentrok({ ruangan_id: R2, tanggal: '2026-10-11', waktu_mulai: '14:00', waktu_selesai: null }, ada)).toEqual([]);
    expect(cariBentrok({ ...jadwal('seminar') }, [jadwal('seminar')])).toEqual([]);
  });
});

describe('label & isi surat', () => {
  it('labelWaktu memakai titik dan "s.d. selesai"', () => {
    expect(labelWaktu('16:00', '18:30')).toBe('16.00 – 18.30 WIB');
    expect(labelWaktu('16:00', null)).toBe('16.00 WIB s.d. selesai');
    expect(labelWaktu(null, null)).toBe('Sepanjang hari');
  });

  it('draft surat 05 terisi dari booking tanpa menebak field yang tidak ada', () => {
    const d = draftSuratDariBooking({
      kegiatan: 'MUSMAIF',
      tanggal: '2026-10-08',
      waktu_mulai: '16:00',
      waktu_selesai: null,
      keperluan: 'Musyawarah Mahasiswa',
      ruangan: { nama: 'Auditorium FT', lokasi: 'Gedung FT Lt.1', pengelola: 'Kepala Bagian Sekretariat FT' },
    });
    expect(d.jenis).toBe('PEMINJAMAN_RUANGAN');
    expect(d.tujuan_nama).toBe('Kepala Bagian Sekretariat FT');
    expect(d.data_dinamis).toEqual({
      nama_kegiatan: 'MUSMAIF',
      ruangan: 'Auditorium FT',
      tujuan_jabatan: 'Kepala Bagian Sekretariat FT',
      hari_tanggal: 'Kamis, 08 Oktober 2026',
      waktu: '16.00 WIB s.d. selesai',
      tempat: 'Auditorium FT, Gedung FT Lt.1',
    });
    expect(d.data_dinamis).not.toHaveProperty('tema_kegiatan');
  });
});

describe('rentangBulan', () => {
  it('rentang setengah terbuka, termasuk pergantian tahun', () => {
    const r = rentangBulan('2026-12');
    expect(r.awal.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(r.akhir.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('bulan tak sah jatuh ke bulan berjalan', () => {
    expect(rentangBulan('2026-13', new Date('2026-10-15T00:00:00Z')).bulan).toBe('2026-10');
    expect(rentangBulan(undefined, new Date('2026-10-15T00:00:00Z')).bulan).toBe('2026-10');
  });
});

describe('skema', () => {
  const sah = { ruangan_id: R1, kegiatan: 'MUSMAIF', tanggal: '2026-10-08', waktu_mulai: '16:00' };

  it('booking minimal sah; jam selesai & keperluan kosong menjadi null', () => {
    const p = SkemaBooking.parse({ ...sah, waktu_selesai: '', keperluan: '' });
    expect(p.waktu_selesai).toBeNull();
    expect(p.keperluan).toBeNull();
    expect(p.jumlah_peserta).toBeNull();
  });

  it('jam selesai harus sesudah jam mulai (cermin CHECK booking_waktu_urut)', () => {
    const p = SkemaBooking.safeParse({ ...sah, waktu_selesai: '15:00' });
    expect(p.success).toBe(false);
    expect(p.error?.issues[0]?.message).toBe('Jam selesai harus sesudah jam mulai.');
  });

  it('menolak ruangan kosong, tanggal & jam tak sah', () => {
    expect(SkemaBooking.safeParse({ ...sah, ruangan_id: '' }).success).toBe(false);
    expect(SkemaBooking.safeParse({ ...sah, tanggal: '9 Okt' }).success).toBe(false);
    expect(SkemaBooking.safeParse({ ...sah, waktu_mulai: '25:00' }).success).toBe(false);
  });

  it('ruangan: kapasitas positif, teks opsional kosong → null', () => {
    expect(SkemaRuangan.parse({ nama: 'Auditorium FT', lokasi: '', kapasitas: 200 })).toEqual({
      nama: 'Auditorium FT',
      lokasi: null,
      kapasitas: 200,
      pengelola: null,
      catatan: null,
    });
    expect(SkemaRuangan.safeParse({ nama: 'X', kapasitas: 0 }).success).toBe(false);
    expect(SkemaRuangan.safeParse({ nama: '  ' }).success).toBe(false);
  });
});
