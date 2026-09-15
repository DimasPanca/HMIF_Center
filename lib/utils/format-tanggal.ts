export type TanggalInput = Date | string | number;

const ZONA_WAKTU = 'Asia/Jakarta';

const formatPanjang = new Intl.DateTimeFormat('id-ID', {
  timeZone: ZONA_WAKTU,
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const formatPendek = new Intl.DateTimeFormat('id-ID', {
  timeZone: ZONA_WAKTU,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const formatTanggalDanWaktu = new Intl.DateTimeFormat('id-ID', {
  timeZone: ZONA_WAKTU,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

const formatBagianTanggal = new Intl.DateTimeFormat('id-ID', {
  timeZone: ZONA_WAKTU,
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

const formatNamaBulan = new Intl.DateTimeFormat('id-ID', {
  timeZone: ZONA_WAKTU,
  month: 'long',
});

const formatNamaBulanPendek = new Intl.DateTimeFormat('id-ID', {
  timeZone: ZONA_WAKTU,
  month: 'short',
});

function validasiTanggalKalender(nilai: string): void {
  const bagianTanggal = /^(\d{4})-(\d{2})-(\d{2})/.exec(nilai);
  if (!bagianTanggal) return;

  const tahun = Number(bagianTanggal[1]);
  const bulan = Number(bagianTanggal[2]);
  const hari = Number(bagianTanggal[3]);
  const tahunKabisat = tahun % 4 === 0 && (tahun % 100 !== 0 || tahun % 400 === 0);
  const jumlahHari = [31, tahunKabisat ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  if (bulan < 1 || bulan > 12 || hari < 1 || hari > jumlahHari[bulan - 1]!) {
    throw new TypeError('Tanggal tidak valid.');
  }
}

function buatTanggal(input: TanggalInput): Date {
  let tanggal: Date;

  if (input instanceof Date) {
    tanggal = new Date(input.getTime());
  } else if (typeof input === 'number') {
    tanggal = new Date(input);
  } else {
    const nilai = input.trim();
    validasiTanggalKalender(nilai);

    if (/^\d{4}-\d{2}-\d{2}$/.test(nilai)) {
      tanggal = new Date(`${nilai}T00:00:00+07:00`);
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(nilai)) {
      tanggal = new Date(`${nilai}+07:00`);
    } else if (/Z$|[+-]\d{2}:?\d{2}$/.test(nilai)) {
      tanggal = new Date(nilai);
    } else {
      throw new TypeError('Tanggal harus memakai format ISO dengan zona waktu.');
    }
  }

  if (Number.isNaN(tanggal.getTime())) {
    throw new TypeError('Tanggal tidak valid.');
  }

  return tanggal;
}

function ambilBagian(tanggal: Date) {
  const bagian = Object.fromEntries(
    formatBagianTanggal
      .formatToParts(tanggal)
      .filter(({ type }) => type === 'day' || type === 'month' || type === 'year')
      .map(({ type, value }) => [type, Number(value)]),
  ) as Record<'day' | 'month' | 'year', number>;

  return bagian;
}

/** Tanggal kalender hari ini dalam zona aplikasi, untuk membandingkan deadline DATE. */
export function tanggalHariIniJakarta(): string {
  const { year, month, day } = ambilBagian(new Date());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatTanggalPanjang(input: TanggalInput): string {
  return formatPanjang.format(buatTanggal(input));
}

export function formatTanggalPendek(input: TanggalInput): string {
  return formatPendek.format(buatTanggal(input));
}

export function formatTanggalWaktu(input: TanggalInput): string {
  return formatTanggalDanWaktu.format(buatTanggal(input));
}

export function formatRentangTanggal(mulai: TanggalInput, selesai: TanggalInput): string {
  const tanggalMulai = buatTanggal(mulai);
  const tanggalSelesai = buatTanggal(selesai);
  const awal = ambilBagian(tanggalMulai);
  const akhir = ambilBagian(tanggalSelesai);
  const bulanAwal = formatNamaBulan.format(tanggalMulai);
  const bulanAkhir = formatNamaBulan.format(tanggalSelesai);
  const bulanAwalPendek = formatNamaBulanPendek.format(tanggalMulai);
  const bulanAkhirPendek = formatNamaBulanPendek.format(tanggalSelesai);
  const urutanAwal = awal.year * 10_000 + awal.month * 100 + awal.day;
  const urutanAkhir = akhir.year * 10_000 + akhir.month * 100 + akhir.day;

  if (urutanAwal > urutanAkhir) {
    throw new RangeError('Tanggal mulai tidak boleh setelah tanggal selesai.');
  }

  if (awal.year === akhir.year && awal.month === akhir.month && awal.day === akhir.day) {
    return `${awal.day} ${bulanAwal} ${awal.year}`;
  }

  if (awal.year === akhir.year && awal.month === akhir.month) {
    return `${awal.day} – ${akhir.day} ${bulanAkhir} ${akhir.year}`;
  }

  if (awal.year === akhir.year) {
    return `${awal.day} ${bulanAwalPendek} – ${akhir.day} ${bulanAkhirPendek} ${akhir.year}`;
  }

  return `${awal.day} ${bulanAwalPendek} ${awal.year} – ${akhir.day} ${bulanAkhirPendek} ${akhir.year}`;
}
