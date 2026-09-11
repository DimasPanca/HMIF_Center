# Kontrak Realtime Master Gantt — T-076

Batas lane `data` ↔ `ui` untuk update langsung Master Gantt (SYSTEM_DESIGN §13).
Lane data memiliki publication, nama kanal, dan hook langganan; lane ui merakit
banner, indikator header, dan menyambungkannya ke `MasterGantt`.

| | |
|---|---|
| **Ditulis oleh** | lane `data` — `T-076` (`lib/realtime/**`, `supabase/migrations/020_realtime.sql`) |
| **Dibaca oleh** | lane `ui` — `T-076-UI` (`components/shared/KoneksiBanner.tsx`, `components/gantt/MasterGantt.tsx`, indikator header T-051) |
| **Gate** | `npm run test:e2e -- realtime-gantt` (milik lane ui; skip hingga wiring ada) |
| **Sumber** | SYSTEM_DESIGN §13, §13.1 · PRD F-3.1, §8.3 · DESIGN_SYSTEM §10.7 |

---

## 1. Platform (sudah disediakan lane data)

- **Publication** `supabase_realtime` memuat `proker` dan `proker_lock`
  (migrasi `020_realtime.sql`, REPLICA IDENTITY FULL). Terverifikasi lewat
  `pg_publication_tables`. Tanpa ini tak ada perubahan yang terkirim.
- **Kanal** `proker:{periode_id}` (`kanalProker(periodeId)` di
  `lib/realtime/channels.ts`) — INSERT/UPDATE/DELETE kedua tabel.
- **Kunci query** `['master-gantt', periodeId]` (`kunciMasterGantt(periodeId)`).

## 2. Hook (sudah disediakan lane data)

`lib/realtime/use-master-gantt-realtime.ts`:

```ts
useMasterGanttRealtime({ klien, periodeId, onPerubahan, onStatus });
```

- **`klien` WAJIB terikat sesi.** Realtime menghormati RLS proker; klien anon
  (publishable key tanpa sesi) tak menerima perubahan. Pakai
  `createBrowserClient` dari `@supabase/ssr` (membaca cookie auth), bukan
  `createClient` anon.
- `onPerubahan` dipanggil tiap perubahan → lane ui me-refetch Master Gantt
  (invalidate `['master-gantt', periodeId]` bila memakai React Query, atau
  memicu ulang fetch `useState`-nya).
- `onStatus('menghubungkan'|'terhubung'|'terputus')` → banner & indikator.
- Langganan dibersihkan saat unmount (tak ada kebocoran kanal).

## 3. Yang dibangun lane ui (T-076-UI)

1. **`MasterGantt` memakai data yang dapat di-refetch.** Saat ini
   (`T-075`) memakai `useState` + `fetch('/api/gantt/master')` tanpa periodeId
   dan tanpa React Query. Pilih salah satu:
   - adopsi React Query dengan kunci `kunciMasterGantt(periodeId)` +
     `QueryClientProvider` (belum ada di app), lalu `onPerubahan` melakukan
     `queryClient.invalidateQueries`; atau
   - simpan fungsi refetch dan panggil dari `onPerubahan`.
   `periodeId` perlu tersedia di klien (dari sesi/props).
2. **Flash 400 ms** pada bar yang baru muncul (DESIGN_SYSTEM §10.7) — bukan
   animasi lain. Chart TETAP menampilkan data terakhir saat koneksi putus
   (PRD §8.3); jangan mengosongkannya.
3. **`components/shared/KoneksiBanner.tsx`** — banner kuning tipis di atas Gantt
   saat `terputus`: "Pembaruan langsung terputus. Muat ulang untuk data
   terbaru." Muncul hanya saat terputus.
4. **Indikator koneksi di header** (T-051).

## 4. Verifikasi lane data

```
db:migrate → 020_realtime diterapkan
query pg_publication_tables → proker & proker_lock ANGGOTA supabase_realtime,
  keduanya relreplident = 'f' (FULL)
typecheck + lint hijau; guard data OK
```

Gate `realtime-gantt` (dua tab, live update < 3 detik + banner saat offline)
milik lane ui — aktif setelah wiring di atas ada.
