// @vitest-environment jsdom

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConfirmDialog,
  createConfirmationPayload,
  getConfirmationError,
  type ConfirmationRequirement,
  type ConfirmDialogProps,
} from '@/components/ui/confirm-dialog';
import {
  MAX_VISIBLE_TOASTS,
  TOAST_DURATIONS,
  Toast,
  type ErrorToastProps,
} from '@/components/ui/toast';

const emptyValues = { reason: '', typedText: '' };
const testEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};

beforeAll(() => {
  testEnvironment.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  testEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
});

describe('aturan konfirmasi berdasarkan tingkat risiko', () => {
  it('mengizinkan dialog sederhana tanpa isian tambahan', () => {
    const requirement = { level: 'simple' } satisfies ConfirmationRequirement;

    expect(getConfirmationError(requirement, emptyValues)).toBeNull();
    expect(createConfirmationPayload(requirement, emptyValues)).toEqual({ level: 'simple' });
  });

  it('mewajibkan alasan dan merapikan spasi sebelum dikirim', () => {
    const requirement = { level: 'reason' } satisfies ConfirmationRequirement;

    expect(getConfirmationError(requirement, emptyValues)).toBe('Alasan wajib diisi.');
    expect(createConfirmationPayload(requirement, { ...emptyValues, reason: '   ' })).toBeNull();
    expect(
      createConfirmationPayload(requirement, {
        ...emptyValues,
        reason: '  Anggaran perlu diperbaiki.  ',
      }),
    ).toEqual({ level: 'reason', reason: 'Anggaran perlu diperbaiki.' });
  });

  it('mewajibkan teks konfirmasi kritis yang sama persis', () => {
    const requirement = {
      level: 'typed',
      confirmationText: 'RESTORE PENUH',
    } satisfies ConfirmationRequirement;

    expect(getConfirmationError(requirement, { ...emptyValues, typedText: 'restore penuh' })).toBe(
      'Teks konfirmasi belum sesuai.',
    );
    expect(
      createConfirmationPayload(requirement, {
        ...emptyValues,
        typedText: 'RESTORE PENUH ',
      }),
    ).toBeNull();
    expect(
      createConfirmationPayload(requirement, {
        ...emptyValues,
        typedText: 'RESTORE PENUH',
      }),
    ).toEqual({ level: 'typed', typedText: 'RESTORE PENUH' });
  });

  it('menolak konfigurasi teks konfirmasi kosong', () => {
    const requirement = {
      level: 'typed',
      confirmationText: '   ',
    } satisfies ConfirmationRequirement;

    expect(getConfirmationError(requirement, emptyValues)).toBe(
      'Teks konfirmasi belum dikonfigurasi.',
    );
    expect(createConfirmationPayload(requirement, emptyValues)).toBeNull();
  });
});

describe('integrasi antarmuka ConfirmDialog', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function renderDialog(props: ConfirmDialogProps) {
    await act(async () => {
      root.render(React.createElement(ConfirmDialog, { ...props, open: true }));
    });
  }

  function buttonNamed(name: string) {
    const button = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === name,
    );

    if (!button) throw new Error(`Tombol “${name}” tidak ditemukan.`);
    return button;
  }

  async function fill(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (!valueSetter) throw new Error('Setter nilai kontrol tidak tersedia.');

    await act(async () => {
      valueSetter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('merender dan mengirim tingkat sederhana tanpa field tambahan', async () => {
    const onConfirm = vi.fn();

    await renderDialog({
      level: 'simple',
      title: 'Hapus item?',
      description: 'Item akan dihapus.',
      confirmLabel: 'Hapus',
      onConfirm,
    });

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector('textarea, input')).toBeNull();
    expect(buttonNamed('Hapus').disabled).toBe(false);

    await act(async () => buttonNamed('Hapus').click());
    expect(onConfirm).toHaveBeenCalledWith({ level: 'simple' });
  });

  it('menahan tingkat alasan sampai textarea terisi', async () => {
    const onConfirm = vi.fn();

    await renderDialog({
      level: 'reason',
      title: 'Tolak program kerja?',
      description: 'Alasan penolakan akan dicatat.',
      confirmLabel: 'Tolak',
      onConfirm,
    });

    const textarea = document.querySelector('textarea');
    if (!textarea) throw new Error('Textarea alasan tidak dirender.');

    expect(buttonNamed('Tolak').disabled).toBe(true);
    await fill(textarea, '  Jadwal perlu diperbaiki.  ');
    expect(buttonNamed('Tolak').disabled).toBe(false);

    await act(async () => buttonNamed('Tolak').click());
    expect(onConfirm).toHaveBeenCalledWith({
      level: 'reason',
      reason: 'Jadwal perlu diperbaiki.',
    });
  });

  it('menahan tingkat kritis sampai teks sama persis', async () => {
    const onConfirm = vi.fn();

    await renderDialog({
      level: 'typed',
      confirmationText: 'RESTORE PENUH',
      title: 'Pulihkan data?',
      description: 'Seluruh data saat ini akan diganti.',
      confirmLabel: 'Pulihkan',
      onConfirm,
    });

    const input = document.querySelector('input');
    if (!input) throw new Error('Input teks konfirmasi tidak dirender.');

    expect(buttonNamed('Pulihkan').disabled).toBe(true);
    await fill(input, 'restore penuh');
    expect(buttonNamed('Pulihkan').disabled).toBe(true);
    await fill(input, 'RESTORE PENUH');
    expect(buttonNamed('Pulihkan').disabled).toBe(false);

    await act(async () => buttonNamed('Pulihkan').click());
    expect(onConfirm).toHaveBeenCalledWith({
      level: 'typed',
      typedText: 'RESTORE PENUH',
    });
  });

  it('membersihkan teks sensitif saat parent menutup dialog controlled', async () => {
    function ControlledHarness() {
      const [open, setOpen] = React.useState(false);

      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'button',
          { type: 'button', onClick: () => setOpen(true) },
          'Buka dari induk',
        ),
        React.createElement(
          'button',
          { type: 'button', onClick: () => setOpen(false) },
          'Tutup dari induk',
        ),
        React.createElement(ConfirmDialog, {
          level: 'typed',
          confirmationText: 'HAPUS PERIODE',
          title: 'Hapus periode?',
          description: 'Seluruh data periode akan dihapus.',
          confirmLabel: 'Hapus',
          onConfirm: vi.fn(),
          open,
          onOpenChange: setOpen,
        }),
      );
    }

    await act(async () => root.render(React.createElement(ControlledHarness)));
    await act(async () => buttonNamed('Buka dari induk').click());

    const firstInput = document.querySelector('input');
    if (!firstInput) throw new Error('Input controlled tidak dirender.');
    await fill(firstInput, 'HAPUS PERIODE');
    expect(buttonNamed('Hapus').disabled).toBe(false);

    await act(async () => buttonNamed('Tutup dari induk').click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    await act(async () => buttonNamed('Buka dari induk').click());
    const reopenedInput = document.querySelector('input');
    if (!reopenedInput) throw new Error('Input controlled tidak dirender ulang.');

    expect(reopenedInput.value).toBe('');
    expect(buttonNamed('Hapus').disabled).toBe(true);
  });
});

describe('jaminan Toast', () => {
  it('mengunci durasi dan batas tumpukan sesuai kontrak', () => {
    expect(TOAST_DURATIONS.success).toBe(3_000);
    expect(TOAST_DURATIONS.error).toBe(6_000);
    expect(MAX_VISIBLE_TOASTS).toBe(3);
  });

  it('selalu merender penjelasan dan saran pada toast gagal', () => {
    const markup = renderToStaticMarkup(
      React.createElement(Toast, {
        type: 'error',
        description: 'Data gagal disimpan.',
        suggestion: 'Periksa koneksi lalu coba lagi.',
      }),
    );

    expect(markup).toContain('Data gagal disimpan.');
    expect(markup).toContain('Saran:');
    expect(markup).toContain('Periksa koneksi lalu coba lagi.');
  });

  it('menolak saran kosong saat runtime walau tipe dilewati', () => {
    const invalidToast = {
      type: 'error',
      description: 'Data gagal disimpan.',
      suggestion: '   ',
    } as ErrorToastProps;

    expect(() => renderToStaticMarkup(React.createElement(Toast, invalidToast))).toThrow(
      'Toast gagal wajib memuat penjelasan dan saran tindakan.',
    );
  });
});
