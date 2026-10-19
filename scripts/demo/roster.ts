/**
 * Roster demo: 30 pengurus berakun (8 peran, 6 departemen) + pengurus tanpa
 * akun untuk halaman Data Pengurus. Kunci (`kunci`) dipakai seluruh modul demo
 * untuk merujuk orang; emailnya `<kunci>@demo.hmif.test`.
 */

export type RoleDemo = 'ADMIN' | 'KETUA' | 'WAKIL' | 'SEKUM' | 'BENDUM' | 'KADEPT' | 'ANGGOTA' | 'BPH';
export type KodeDept = 'KAD' | 'MIKAT' | 'INT' | 'EKS' | 'KOMINFO' | 'RND';

export interface OrangDemo {
  kunci: string;
  nama: string;
  nim: string;
  angkatan: number;
  role: RoleDemo;
  dept?: KodeDept;
  jabatan: string;
}

const NAMA_DEPT: Record<KodeDept, string> = {
  KAD: 'Kaderisasi',
  MIKAT: 'Minat dan Bakat',
  INT: 'Internal',
  EKS: 'Eksternal',
  KOMINFO: 'Komunikasi dan Informasi',
  RND: 'Riset dan Development',
};

let nim = 7737220100;
const berikutnya = (): string => String(nim++);

const pimpinan: OrangDemo[] = [
  { kunci: 'admin', nama: 'Admin Sistem HMIF', nim: '7737200001', angkatan: 2020, role: 'ADMIN', jabatan: 'Administrator Sistem' },
  { kunci: 'ketua', nama: 'Muhammad Rizky Pratama', nim: '7737220001', angkatan: 2022, role: 'KETUA', jabatan: 'Ketua Himpunan' },
  { kunci: 'wakil', nama: 'Aulia Rahmawati', nim: '7737220002', angkatan: 2022, role: 'WAKIL', jabatan: 'Wakil Ketua Himpunan' },
  { kunci: 'sekum', nama: 'Nabila Putri Salsabila', nim: '7737220003', angkatan: 2022, role: 'SEKUM', jabatan: 'Sekretaris Umum' },
  { kunci: 'bendum', nama: 'Farhan Maulana Yusuf', nim: '7737220004', angkatan: 2022, role: 'BENDUM', jabatan: 'Bendahara Umum' },
  { kunci: 'bph', nama: 'Siti Nurhaliza Rahmadani', nim: '7737210005', angkatan: 2021, role: 'BPH', jabatan: 'Badan Pengurus Harian' },
];

const kadept: Array<[KodeDept, string]> = [
  ['KAD', 'Dimas Anggara Putra'],
  ['MIKAT', 'Salsabila Azzahra'],
  ['INT', 'Raka Aditya Nugroho'],
  ['EKS', 'Putri Ayu Lestari'],
  ['KOMINFO', 'Bagas Setiawan'],
  ['RND', 'Citra Dewi Anjani'],
];

const anggota: Record<KodeDept, string[]> = {
  KAD: ['Ahmad Fauzan Hakim', 'Intan Permata Sari', 'Rendi Kurniawan'],
  MIKAT: ['Zahra Amalia Putri', 'Gilang Ramadhan', 'Mega Wulandari'],
  INT: ['Yusuf Abdurrahman', 'Nadia Safitri', 'Bima Prakoso'],
  EKS: ['Dwi Cahyo Saputra', 'Laila Nur Hidayah', 'Arif Budiman'],
  KOMINFO: ['Tiara Anggraini', 'Kevin Alexander', 'Putri Maharani'],
  RND: ['Fikri Haikal', 'Anisa Fitriani', 'Rafi Ardiansyah'],
};

export const ROSTER: OrangDemo[] = [
  ...pimpinan,
  ...kadept.map(
    ([d, nama]): OrangDemo => ({
      kunci: `kadept.${d.toLowerCase()}`,
      nama,
      nim: berikutnya(),
      angkatan: 2022,
      role: 'KADEPT',
      dept: d,
      jabatan: `Kepala Departemen ${NAMA_DEPT[d]}`,
    }),
  ),
  ...(Object.entries(anggota) as Array<[KodeDept, string[]]>).flatMap(([d, daftar]) =>
    daftar.map(
      (nama, i): OrangDemo => ({
        kunci: `${d.toLowerCase()}${i + 1}`,
        nama,
        nim: berikutnya(),
        angkatan: 2023 + (i % 2),
        role: 'ANGGOTA',
        dept: d,
        jabatan: `Staff Departemen ${NAMA_DEPT[d]}`,
      }),
    ),
  ),
];

/** Pengurus yang belum punya akun (halaman Data Pengurus, daftar hadir notulensi). */
export const PENGURUS_TANPA_AKUN: Array<{ nama: string; dept: KodeDept; angkatan: number }> = [
  { nama: 'Aditya Wiratama', dept: 'KAD', angkatan: 2024 },
  { nama: 'Bunga Citra Lestari', dept: 'KAD', angkatan: 2024 },
  { nama: 'Cahya Kusuma', dept: 'MIKAT', angkatan: 2024 },
  { nama: 'Dinda Aulia Rahma', dept: 'MIKAT', angkatan: 2024 },
  { nama: 'Eko Prasetyo', dept: 'INT', angkatan: 2023 },
  { nama: 'Fitri Handayani', dept: 'INT', angkatan: 2024 },
  { nama: 'Galih Pangestu', dept: 'EKS', angkatan: 2023 },
  { nama: 'Hana Pertiwi', dept: 'EKS', angkatan: 2024 },
  { nama: 'Ilham Syahputra', dept: 'KOMINFO', angkatan: 2023 },
  { nama: 'Jasmine Nuraini', dept: 'KOMINFO', angkatan: 2024 },
  { nama: 'Krisna Adi Wijaya', dept: 'RND', angkatan: 2023 },
  { nama: 'Livia Anggun Safira', dept: 'RND', angkatan: 2024 },
];

export const orang = (kunci: string): OrangDemo => {
  const o = ROSTER.find((x) => x.kunci === kunci);
  if (!o) throw new Error(`Orang demo "${kunci}" tidak ada di roster.`);
  return o;
};
export const emailDemo = (kunci: string, domain: string): string => `${kunci}@${domain}`;
export const NAMA_DEPARTEMEN = NAMA_DEPT;
