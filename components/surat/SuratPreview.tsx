'use client';

/**
 * SuratPreview — replika HTML surat pada kertas A4 (T-059).
 *
 * Dihitung sepenuhnya di klien dari isian form: tidak ada panggilan server per
 * ketikan. Pembaruan ditunda 200 ms setelah isian terakhir berubah, sehingga
 * dari berhenti mengetik sampai pratinjau berubah < 300 ms (kontrak butir 2).
 *
 * Kertas digambar pada ukuran sebenarnya (794 × 1123 px = A4 pada 96 dpi) lalu
 * diskala ke lebar panel, supaya pemenggalan halaman terlihat kira-kira sama
 * dengan hasil cetak. Garis putus-putus menandai batas tiap halaman.
 *
 * Sumber: docs/ai/tasks/P2-persuratan.md T-059 · DESIGN_SYSTEM §9.5
 */

import Image from 'next/image';
import * as React from 'react';

import { NomorSuratBadge } from '@/components/surat/NomorSuratBadge';
import type { KonfigSurat } from '@/lib/surat/field-schemas';
import {
  susunPratinjau,
  type Baris,
  type Blok,
  type KetuaHimpunan,
  type ModelPratinjau,
  type Penanda,
} from '@/lib/surat/render-preview';

/**
 * 200 ms, bukan 250 ms yang disebut kontrak T-059. Targetnya < 300 ms dari
 * berhenti mengetik; render kertas sendiri memakan ±45–75 ms di dev server
 * (terukur e2e `surat-preview`), sehingga 250 ms hanya menyisakan ruang 50 ms
 * dan gagal di viewport mobile. 200 ms memberi selisih aman.
 */
export const DEBOUNCE_PRATINJAU_MS = 200;
const LEBAR_A4 = 794;
const TINGGI_A4 = 1123;

function useTertunda<T>(nilai: T, ms: number): T {
  const [tertunda, setTertunda] = React.useState(nilai);
  React.useEffect(() => {
    const t = setTimeout(() => setTertunda(nilai), ms);
    return () => clearTimeout(t);
  }, [nilai, ms]);
  return tertunda;
}

function Teks({ baris }: { baris: Baris }) {
  return (
    <>
      {baris.map((s, i) =>
        s.t === 'teks' ? (
          <React.Fragment key={i}>{s.v}</React.Fragment>
        ) : (
          <span key={i} className="pratinjau-kosong" data-kosong={s.label} title="Belum diisi">
            {s.label}
          </span>
        ),
      )}
    </>
  );
}

function Kosong({ label }: { label: string }) {
  return (
    <span className="pratinjau-kosong" data-kosong={label} title="Belum diisi">
      {label}
    </span>
  );
}

function RenderBlok({ blok }: { blok: Blok }) {
  switch (blok.jenis) {
    case 'paragraf':
      return (
        <p style={{ textAlign: blok.rata === 'tengah' ? 'center' : blok.rata === 'kanan' ? 'right' : undefined, fontWeight: blok.tebal ? 600 : undefined }}>
          <Teks baris={blok.isi} />
        </p>
      );
    case 'html':
      return blok.kosong ? (
        <p>
          <Kosong label={blok.kosong} />
        </p>
      ) : (
        // HTML sudah melewati allowlist `sanitasiIsiHtml` di render-preview.
        <div dangerouslySetInnerHTML={{ __html: blok.html }} />
      );
    case 'rincian':
      return (
        <table style={{ margin: '0 0 0.6em 2.5em' }}>
          <tbody>
            {blok.baris.map((b) => (
              <tr key={b.label}>
                <td style={{ paddingRight: 12, whiteSpace: 'nowrap', verticalAlign: 'top' }}>{b.label}</td>
                <td style={{ paddingRight: 6, verticalAlign: 'top' }}>:</td>
                <td>
                  <Teks baris={b.nilai} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'tabel':
      return (
        <table className="tabel-surat">
          <thead>
            <tr>
              {blok.kepala.map((k) => (
                <th key={k}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {blok.baris.length === 0 ? (
              <tr>
                <td colSpan={blok.kepala.length} style={{ textAlign: 'center' }}>
                  <Kosong label={blok.kosong} />
                </td>
              </tr>
            ) : (
              blok.baris.map((sel, i) => (
                <tr key={i}>
                  {sel.map((b, j) => (
                    <td key={j}>
                      <Teks baris={b} />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      );
    case 'poin':
      return (
        <div style={{ marginBottom: '0.6em' }}>
          <p style={{ fontWeight: 600, marginBottom: '0.2em' }}>
            {blok.nomor}. <Teks baris={blok.judul} />
          </p>
          {blok.paragraf.map((p, i) => (
            <p key={i} style={{ paddingLeft: '1.2em' }}>
              <Teks baris={p} />
            </p>
          ))}
        </div>
      );
  }
}

function KolomTtd({ p }: { p: Penanda }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 0 }}>
      {p.label ? <div>{p.label}</div> : null}
      <div>
        <Teks baris={p.jabatan} />
      </div>
      <div style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }} aria-hidden="true">
        {p.ttd ? <span className="pratinjau-kosong">TTD{p.stempel ? ' + stempel' : ''}</span> : null}
      </div>
      <div style={{ fontWeight: 600, textDecoration: 'underline' }}>
        <Teks baris={p.nama} />
      </div>
      <div>
        {p.awalanNim}
        <Teks baris={p.nim} />
      </div>
    </div>
  );
}

function Kop() {
  return (
    <div className="kop" style={{ display: 'grid', gridTemplateColumns: '84px 1fr 84px', alignItems: 'center', gap: 12 }}>
      <Image src="/kop/logo-untirta.png" alt="Logo Universitas Sultan Ageng Tirtayasa" width={78} height={78} />
      <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>HIMPUNAN MAHASISWA INFORMATIKA</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>FAKULTAS TEKNIK</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>UNIVERSITAS SULTAN AGENG TIRTAYASA</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Jl. Jendral Sudirman KM. 3, Kotabumi, Kec. Purwakarta, Cilegon, Banten</div>
        <div style={{ fontSize: 12 }}>surel: hmif.untirta@gmail.com</div>
      </div>
      <Image src="/kop/logo-hmif.png" alt="Logo HMIF" width={78} height={78} />
    </div>
  );
}

/**
 * Isi kertas — dipisah dan di-memo karena form di-render ulang di SETIAP
 * ketikan. Tanpa memo, seluruh pohon kertas ikut direkonsiliasi tiap huruf,
 * dan beban itu yang membuat pembaruan sesudah debounce melewati 300 ms.
 */
const IsiKertas = React.memo(function IsiKertas({ model }: { model: ModelPratinjau }) {
  const kotaTanggalKepala = !model.ttd.kotaTanggalDiAtas;
  return (
    <>
      <Kop />

      {model.judul ? (
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, textDecoration: 'underline' }}>{model.judul}</div>
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            Nomor : <NomorSuratBadge nomor={model.nomor} sementara />
          </div>
        </div>
      ) : (
        <table style={{ width: '100%', marginBottom: 12 }}>
          <tbody>
            <tr>
              <td style={{ width: 90, verticalAlign: 'top' }}>Nomor</td>
              <td style={{ width: 12, verticalAlign: 'top' }}>:</td>
              <td style={{ verticalAlign: 'top' }}>
                <span data-testid="surat-pratinjau-nomor">
                  <NomorSuratBadge nomor={model.nomor} sementara />
                </span>
              </td>
              <td style={{ textAlign: 'right', verticalAlign: 'top', whiteSpace: 'nowrap' }} data-testid="surat-pratinjau-tanggal">
                {kotaTanggalKepala ? <Teks baris={model.kotaTanggal} /> : null}
              </td>
            </tr>
            {model.lampiran ? (
              <tr>
                <td>Lampiran</td>
                <td>:</td>
                <td colSpan={2}>
                  <Teks baris={model.lampiran} />
                </td>
              </tr>
            ) : null}
            {model.perihal ? (
              <tr>
                <td>Perihal</td>
                <td>:</td>
                <td colSpan={2} data-testid="surat-pratinjau-perihal">
                  <Teks baris={model.perihal} />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}

      {model.tujuan ? (
        <div style={{ marginBottom: 12 }} data-testid="surat-pratinjau-tujuan">
          <div>Kepada Yth.</div>
          {model.tujuan.map((b, i) => (
            <div key={i}>
              <Teks baris={b} />
            </div>
          ))}
        </div>
      ) : null}

      {model.salam ? <p>{model.salam}</p> : null}

      <div data-testid="surat-pratinjau-isi">
        {model.isi.map((b, i) => (
          <RenderBlok key={i} blok={b} />
        ))}
      </div>

      <div style={{ marginTop: 24 }} data-testid="surat-pratinjau-ttd">
        {model.ttd.labelAtas ? (
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <Teks baris={model.ttd.labelAtas} />
          </div>
        ) : null}
        {model.ttd.kotaTanggalDiAtas ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <div />
            <div style={{ textAlign: 'center' }} data-testid="surat-pratinjau-tanggal">
              <Teks baris={model.kotaTanggal} />
            </div>
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>{model.ttd.kiri ? <KolomTtd p={model.ttd.kiri} /> : null}</div>
          <KolomTtd p={model.ttd.kanan} />
        </div>
      </div>

      {model.lampiranHalaman ? (
        <div style={{ marginTop: 48 }} data-testid="surat-pratinjau-lampiran">
          {model.lampiranHalaman.judul.map((j) => (
            <p key={j} style={{ fontWeight: 700, textAlign: j.startsWith('Lampiran') ? 'left' : 'center' }}>
              {j}
            </p>
          ))}
          {model.lampiranHalaman.isi.map((b, i) => (
            <RenderBlok key={i} blok={b} />
          ))}
        </div>
      ) : null}
    </>
  );
});

export interface SuratPreviewProps {
  nilai: unknown;
  konfig: KonfigSurat;
  ketua: KetuaHimpunan | null;
}

export function SuratPreview({ nilai, konfig, ketua }: SuratPreviewProps) {
  const tertunda = useTertunda(nilai, DEBOUNCE_PRATINJAU_MS);
  const model = React.useMemo(() => susunPratinjau(tertunda, konfig, ketua), [tertunda, konfig, ketua]);

  const wadah = React.useRef<HTMLDivElement>(null);
  const kertas = React.useRef<HTMLDivElement>(null);
  const [skala, setSkala] = React.useState<number | null>(null);
  const [tinggi, setTinggi] = React.useState(TINGGI_A4);

  React.useLayoutEffect(() => {
    const w = wadah.current;
    const k = kertas.current;
    if (!w || !k) return;
    const ukur = () => {
      setSkala(Math.min(1, w.clientWidth / LEBAR_A4));
      setTinggi(Math.max(TINGGI_A4, k.scrollHeight));
    };
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(w);
    ro.observe(k);
    return () => ro.disconnect();
  }, []);

  const jumlahHalaman = Math.max(1, Math.ceil(tinggi / TINGGI_A4));
  // Sebelum hidrasi skalanya belum diketahui: kertas disembunyikan, bukan
  // ditampilkan meluap lalu meloncat.
  const s = skala ?? 0;
  return (
    <div ref={wadah} data-testid="surat-pratinjau" className="w-full overflow-hidden rounded-sm border border-default bg-muted">
      <div style={{ height: skala === null ? TINGGI_A4 * 0.4 : tinggi * s, position: 'relative' }}>
        <div
          ref={kertas}
          className="kertas-surat"
          data-testid="surat-pratinjau-kertas"
          data-jenis={model.jenis}
          data-terukur={skala === null ? undefined : 'ya'}
          style={{
            transform: `scale(${s})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            visibility: skala === null ? 'hidden' : undefined,
          }}
        >
          <IsiKertas model={model} />

          {Array.from({ length: jumlahHalaman - 1 }, (_, i) => (
            <div key={i} className="batas-halaman" style={{ top: TINGGI_A4 * (i + 1) }} aria-hidden="true" />
          ))}
        </div>
      </div>
      <p className="border-t border-default bg-panel px-3 py-1.5 text-[12px] text-tertiary">
        Pratinjau perkiraan · {jumlahHalaman} halaman A4 · bagian abu-abu belum diisi
      </p>
    </div>
  );
}
