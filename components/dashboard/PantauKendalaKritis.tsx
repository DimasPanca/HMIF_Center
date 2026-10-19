'use client';

/**
 * Pemantau kendala Kritis (T-082 #4) — dipasang di dashboard Ketua, Wakil,
 * BPH, dan Admin. Setiap perubahan kendala berprioritas KRITIS di periode
 * berjalan memicu `router.refresh()`, sehingga kartu "Kendala kritis" diisi
 * ulang dari server tanpa menunggu muat ulang manual (< 3 detik).
 *
 * Kanal diotorisasi dengan JWT sesi (lihat use-master-gantt-realtime):
 * tanpa itu Realtime menilai RLS sebagai anon dan tidak mengirim apa pun.
 * Refresh di-debounce supaya ledakan perubahan tidak memicu banyak render.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { kanalKendalaKritis } from '@/lib/realtime/channels';
import { muatKlienRealtime } from '@/lib/realtime/klien-browser';

export function PantauKendalaKritis({
  periodeId,
  supabaseUrl,
  supabaseKey,
}: {
  periodeId: string;
  supabaseUrl: string | null;
  supabaseKey: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!supabaseUrl || !supabaseKey) return;
    let klien: SupabaseClient | null = null;
    let dibuang = false;
    let channel: RealtimeChannel | null = null;
    let tunda: ReturnType<typeof setTimeout> | null = null;
    let berhentiDengar: (() => void) | null = null;

    const segarkan = () => {
      if (tunda) clearTimeout(tunda);
      tunda = setTimeout(() => router.refresh(), 250);
    };

    const pasang = async () => {
      // Klien dimuat malas (T-114): tidak ikut bundle awal beranda.
      const k = await muatKlienRealtime(supabaseUrl, supabaseKey);
      if (dibuang) return;
      klien = k;
      const { data: langganan } = k.auth.onAuthStateChange((_e, sesi) => {
        void k.realtime.setAuth(sesi?.access_token ?? null);
      });
      berhentiDengar = () => langganan.subscription.unsubscribe();
      const { data } = await k.auth.getSession();
      if (dibuang) return;
      void k.realtime.setAuth(data.session?.access_token ?? null);
      channel = k
        .channel(kanalKendalaKritis(periodeId))
        // INSERT/UPDATE yang (kini) Kritis: filter pada baris baru.
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kendala', filter: 'prioritas=eq.KRITIS' }, segarkan)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'kendala', filter: `periode_id=eq.${periodeId}` }, (p) => {
          const baru = p.new as { prioritas?: string };
          const lama = p.old as { prioritas?: string };
          // Tanpa REPLICA IDENTITY FULL `old` hanya memuat PK; refresh bila ragu.
          if (baru.prioritas === 'KRITIS' || lama.prioritas === undefined || lama.prioritas === 'KRITIS') segarkan();
        })
        .subscribe();
    };

    // Gagal memuat klien = tanpa pembaruan langsung; kartu tetap dari server.
    pasang().catch(() => {});

    return () => {
      dibuang = true;
      if (tunda) clearTimeout(tunda);
      berhentiDengar?.();
      if (channel && klien) void klien.removeChannel(channel);
    };
  }, [periodeId, supabaseUrl, supabaseKey, router]);

  return null;
}
