'use client';

/**
 * useMasterGanttRealtime — berlangganan kanal `proker:{periode_id}` dan memberi
 * tahu pemanggil setiap proker/proker_lock atau progres kartu berubah, plus
 * status koneksinya.
 *
 * ===========================================================================
 * INJEKSI KLIEN, BUKAN MEMBUATNYA SENDIRI
 * ===========================================================================
 * Realtime Supabase MENGHORMATI RLS: baris hanya dikirim bila lolos policy,
 * dan itu dinilai dengan token sesi pelanggan. Klien anon (publishable key
 * tanpa sesi) tak akan menerima perubahan proker yang dijaga RLS. Karena itu
 * hook ini MENERIMA klien terikat-sesi dari lapisan UI (createBrowserClient
 * @supabase/ssr yang membaca cookie auth), bukan membuat klien anon sendiri.
 *
 * `onPerubahan`/`onStatus` disimpan di ref sehingga langganan hanya dibuat
 * ulang ketika klien atau periode berganti — bukan tiap render walau pemanggil
 * memberi callback baru. Langganan dibersihkan saat unmount (T-076 #6: tak ada
 * kebocoran kanal).
 *
 * Sumber: docs/ai/tasks/P3-proker-gantt.md T-076 · SYSTEM_DESIGN §13 ·
 *         docs/ai/REALTIME_CONTRACT.md
 */

import { useEffect, useRef } from 'react';

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

import { TABEL_KANAL_PROKER, TABEL_SINYAL_PROGRES, kanalProker } from './channels';

export type StatusKoneksiRealtime = 'menghubungkan' | 'terhubung' | 'terputus';

export interface OpsiMasterGanttRealtime {
  /** Klien Supabase TERIKAT SESI dari lapisan UI (lihat catatan modul). */
  klien: SupabaseClient;
  /** Periode aktif; `null` menunda langganan hingga tersedia. */
  periodeId: string | null;
  /** Dipanggil saat proker/lock/progres kartu berubah — pemanggil me-refetch. */
  onPerubahan: () => void;
  /** Perubahan status koneksi (untuk banner & indikator header). */
  onStatus?: (status: StatusKoneksiRealtime) => void;
}

export function useMasterGanttRealtime({
  klien,
  periodeId,
  onPerubahan,
  onStatus,
}: OpsiMasterGanttRealtime): void {
  const perubahanRef = useRef(onPerubahan);
  const statusRef = useRef(onStatus);

  useEffect(() => {
    perubahanRef.current = onPerubahan;
    statusRef.current = onStatus;
  });

  useEffect(() => {
    if (!periodeId) return;

    statusRef.current?.('menghubungkan');
    const channel: RealtimeChannel = klien.channel(kanalProker(periodeId));

    for (const tabel of TABEL_KANAL_PROKER) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table: tabel }, () =>
        perubahanRef.current(),
      );
    }

    // UPDATE signal dikirim hanya kepada sesi yang lolos RLS. Filter periode
    // membatasi trafik sebelum callback; payload tak pernah memuat isi kartu.
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: TABEL_SINYAL_PROGRES,
        filter: `periode_id=eq.${periodeId}`,
      },
      () => perubahanRef.current(),
    );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') statusRef.current?.('terhubung');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        statusRef.current?.('terputus');
      }
    });

    return () => {
      void klien.removeChannel(channel);
    };
  }, [klien, periodeId]);
}
