import { describe, expect, it } from 'vitest';

import { SISI_MAKSIMUM_PX, luasSudut, skalakanSudut, sudutSah, ukuranHasil, type Sudut } from '@/lib/images/pemindai';

const kotak = (x: number, y: number, w: number, h: number): Sudut => ({
  topLeftCorner: { x, y },
  topRightCorner: { x: x + w, y },
  bottomRightCorner: { x: x + w, y: y + h },
  bottomLeftCorner: { x, y: y + h },
});

describe('sudutSah — deteksi yang meragukan jatuh ke foto apa adanya', () => {
  it('dokumen yang menutupi sebagian besar bingkai diterima', () => {
    expect(sudutSah(kotak(100, 80, 800, 1000), 1080, 1440)).toBe(true);
  });

  it('dokumen miring (trapesium cembung) diterima', () => {
    const s: Sudut = {
      topLeftCorner: { x: 180, y: 120 },
      topRightCorner: { x: 900, y: 160 },
      bottomRightCorner: { x: 980, y: 1300 },
      bottomLeftCorner: { x: 90, y: 1250 },
    };
    expect(sudutSah(s, 1080, 1440)).toBe(true);
  });

  it('sudut kosong (kuadran tanpa titik) ditolak', () => {
    const tanpaKiriAtas: Partial<Sudut> = { ...kotak(0, 0, 800, 800), topLeftCorner: undefined };
    expect(sudutSah(tanpaKiriAtas, 1000, 1000)).toBe(false);
    expect(sudutSah(null, 1000, 1000)).toBe(false);
  });

  it('kontur kecil (noda, tepi meja) ditolak', () => {
    expect(sudutSah(kotak(10, 10, 200, 200), 1000, 1000)).toBe(false);
  });

  it('poligon terpilin (tidak cembung) ditolak', () => {
    const s: Sudut = {
      topLeftCorner: { x: 0, y: 0 },
      topRightCorner: { x: 1000, y: 1000 },
      bottomRightCorner: { x: 1000, y: 0 },
      bottomLeftCorner: { x: 0, y: 1000 },
    };
    expect(sudutSah(s, 1000, 1000)).toBe(false);
  });
});

describe('ukuran & skala', () => {
  it('luas shoelace', () => {
    expect(luasSudut(kotak(0, 0, 300, 200))).toBe(60_000);
  });

  it('ukuran hasil = sisi terpanjang, tanpa upscale, dibatasi 3000', () => {
    expect(ukuranHasil(kotak(0, 0, 800, 1000))).toEqual({ lebar: 800, tinggi: 1000 });
    const besar = ukuranHasil(kotak(0, 0, 3000, 6000))!;
    expect(Math.max(besar.lebar, besar.tinggi)).toBe(SISI_MAKSIMUM_PX);
    expect(besar.lebar).toBe(1500);
    expect(ukuranHasil(kotak(0, 0, 100, 900))).toBeNull();
  });

  it('sudut dari bingkai deteksi kecil diskalakan ke bingkai asli', () => {
    expect(skalakanSudut(kotak(10, 20, 100, 50), 4)).toEqual(kotak(40, 80, 400, 200));
  });
});
