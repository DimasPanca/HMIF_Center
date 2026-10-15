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

import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { kanalKendalaKritis } from '@/lib/realtime/channels';

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
    const klien = createBrowserClient(supabaseUrl, supabaseKey);
    let dibuang = false;
    let channel: RealtimeChannel | null = null;
    let tunda: ReturnType<typeof setTimeout> | null = null;

    const segarkan = () => {
      if (tunda) clearTimeout(tunda);
      tunda = setTimeout(() => router.refresh(), 250);
    };

    const pasang = async () => {
      const { data } = await klien.auth.getSession();
      if (dibuang) return;
      void klien.realtime.setAuth(data.session?.access_token ?? null);
      channel = klien
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

    const { data: langganan } = klien.auth.onAuthStateChange((_e, sesi) => {
      void klien.realtime.setAuth(sesi?.access_token ?? null);
    });
    void pasang();

    return () => {
      dibuang = true;
      if (tunda) clearTimeout(tunda);
      langganan.subscription.unsubscribe();
      if (channel) void klien.removeChannel(channel);
    };
  }, [periodeId, supabaseUrl, supabaseKey, router]);

  return null;
}
