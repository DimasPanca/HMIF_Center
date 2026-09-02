const BULAN_ROMAWI = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
] as const;

export function bulanRomawi(bulan: number): string {
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > BULAN_ROMAWI.length) {
    throw new RangeError('Bulan harus berupa bilangan bulat antara 1 dan 12.');
  }

  return BULAN_ROMAWI[bulan - 1]!;
}
