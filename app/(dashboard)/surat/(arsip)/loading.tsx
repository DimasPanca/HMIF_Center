import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const KOLOM = ['Nomor', 'Jenis', 'Perihal', 'Tujuan', 'Tanggal', 'Pembuat', 'Approver', 'Status', 'Aksi'];

/**
 * Skeleton Arsip Surat (kontrak T-063 butir 6) — tampil saat filter, pencarian,
 * atau halaman berikutnya dimuat. Di route group `(arsip)` supaya tidak ikut
 * menutupi `/surat/baru` dan `/surat/approval`.
 */
export default function MemuatArsip() {
  return (
    <main className="min-h-dvh bg-app p-4 text-primary sm:p-6" data-testid="arsip-memuat" aria-busy="true">
      <div className="mx-auto max-w-[92rem] space-y-5">
        <div className="space-y-2">
          <Skeleton variant="text" className="w-24" />
          <Skeleton variant="text" className="h-7 w-48" />
          <Skeleton variant="text" className="w-20" />
        </div>
        <Skeleton variant="text" className="h-[34px] w-full" />
        <Card className="overflow-hidden p-0">
          <Table aria-label="Memuat arsip surat" rowCount={0} emptyState={null} loading loadingColumnCount={KOLOM.length} loadingRowCount={8}>
            <TableHeader>
              <TableRow>
                {KOLOM.map((k) => (
                  <TableHead key={k}>{k}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
          </Table>
        </Card>
      </div>
    </main>
  );
}
