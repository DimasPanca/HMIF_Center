const formatAngka = new Intl.NumberFormat('id-ID', {
  useGrouping: true,
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatRupiah(nilai: number): string {
  if (!Number.isFinite(nilai)) {
    throw new TypeError('Nilai rupiah harus berupa angka terbatas.');
  }

  const negatif = nilai < 0;
  const angka = formatAngka.format(Math.abs(nilai));

  return `${negatif ? '-' : ''}Rp${angka}`;
}

export function parseRupiah(input: string): number {
  let nilai = input.trim().replace(/\s+/g, '');
  let negatif = false;

  if (nilai.startsWith('-')) {
    negatif = true;
    nilai = nilai.slice(1);
  }

  if (/^Rp/i.test(nilai)) {
    nilai = nilai.slice(2);
  }

  if (nilai.startsWith('-')) {
    if (negatif) {
      throw new TypeError('Format rupiah tidak valid.');
    }

    negatif = true;
    nilai = nilai.slice(1);
  }

  const polaAngka = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/;
  if (!polaAngka.test(nilai)) {
    throw new TypeError('Format rupiah tidak valid.');
  }

  const hasil = Number(nilai.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(hasil)) {
    throw new TypeError('Format rupiah tidak valid.');
  }

  return negatif ? -hasil : hasil;
}
