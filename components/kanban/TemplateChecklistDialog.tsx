'use client';

import { useEffect, useState, type FormEvent } from 'react';

import type { ItemChecklistKanban, TemplateChecklistKanban } from '@/components/kanban/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ResponsApi<T> {
  ok: boolean;
  data?: T;
  error?: { message?: string };
}

export function TemplateChecklistDialog({
  cardId,
  mode,
  onClose,
  onApplied,
}: {
  cardId: string;
  mode: 'simpan' | 'terapkan';
  onClose: () => void;
  onApplied: (items: ItemChecklistKanban[]) => void;
}) {
  const [nama, setNama] = useState('');
  const [templates, setTemplates] = useState<TemplateChecklistKanban[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [memuat, setMemuat] = useState(mode === 'terapkan');
  const [menyimpan, setMenyimpan] = useState(false);
  const [pesan, setPesan] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'terapkan') return;
    let aktif = true;
    void fetch(`/api/kanban/${cardId}/checklist/template`, { cache: 'no-store' })
      .then(async (response) => {
        const body = (await response.json()) as ResponsApi<TemplateChecklistKanban[]>;
        if (!response.ok || !body.ok || !body.data) {
          throw new Error(body.error?.message ?? 'Template belum dapat dimuat.');
        }
        if (aktif) setTemplates(body.data);
      })
      .catch((error: unknown) => {
        if (aktif) setPesan(error instanceof Error ? error.message : 'Template belum dapat dimuat.');
      })
      .finally(() => {
        if (aktif) setMemuat(false);
      });
    return () => {
      aktif = false;
    };
  }, [cardId, mode]);

  async function simpan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPesan(null);
    setMenyimpan(true);
    try {
      const response = await fetch(`/api/kanban/${cardId}/checklist/template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nama }),
      });
      const body = (await response.json()) as ResponsApi<TemplateChecklistKanban>;
      if (!response.ok || !body.ok) throw new Error(body.error?.message ?? 'Template gagal disimpan.');
      onClose();
    } catch (error) {
      setPesan(error instanceof Error ? error.message : 'Template gagal disimpan.');
    } finally {
      setMenyimpan(false);
    }
  }

  async function terapkan() {
    if (!templateId) {
      setPesan('Pilih template yang akan diterapkan.');
      return;
    }
    setPesan(null);
    setMenyimpan(true);
    try {
      const response = await fetch(`/api/kanban/${cardId}/checklist/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId }),
      });
      const body = (await response.json()) as ResponsApi<ItemChecklistKanban[]>;
      if (!response.ok || !body.ok || !body.data) {
        throw new Error(body.error?.message ?? 'Template gagal diterapkan.');
      }
      onApplied(body.data);
      onClose();
    } catch (error) {
      setPesan(error instanceof Error ? error.message : 'Template gagal diterapkan.');
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'simpan' ? 'Simpan template checklist' : 'Gunakan template checklist'}</DialogTitle>
          <DialogDescription>
            {mode === 'simpan'
              ? 'Simpan susunan item saat ini agar dapat dipakai pada kartu lain di departemen yang sama.'
              : 'Pilih template departemen untuk menambahkan seluruh itemnya ke kartu ini.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'simpan' ? (
          <form onSubmit={(event) => void simpan(event)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="checklist-template-nama">Nama template</Label>
              <Input
                id="checklist-template-nama"
                data-testid="checklist-template-nama"
                value={nama}
                maxLength={120}
                required
                onChange={(event) => setNama(event.target.value)}
              />
            </div>
            {pesan ? <p role="alert" className="text-[12px] text-danger">{pesan}</p> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>Batal</Button>
              <Button type="submit" loading={menyimpan}>Simpan template</Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4">
            {memuat ? <p role="status" className="text-[13px] text-secondary">Memuat template…</p> : null}
            {!memuat && templates.length === 0 ? (
              <p className="rounded-sm border border-default bg-subtle p-3 text-[13px] text-secondary">
                Belum ada template checklist untuk departemen ini.
              </p>
            ) : null}
            <div className="space-y-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  data-testid={`checklist-template-opsi-${template.id}`}
                  aria-pressed={templateId === template.id}
                  onClick={() => setTemplateId(template.id)}
                  className={`flex min-h-[42px] w-full items-center justify-between rounded-sm border px-3 text-left text-[13px] outline-none focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] ${templateId === template.id ? 'border-[var(--primary)] bg-[var(--primary-subtle)] text-primary' : 'border-default bg-panel text-secondary'}`}
                >
                  <span className="font-medium">{template.nama}</span>
                  <span className="tabular-nums">{template.jumlah_item} item</span>
                </button>
              ))}
            </div>
            {pesan ? <p role="alert" className="text-[12px] text-danger">{pesan}</p> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>Batal</Button>
              <Button
                type="button"
                data-testid="checklist-template-terapkan"
                disabled={!templateId}
                loading={menyimpan}
                onClick={() => void terapkan()}
              >
                Terapkan template
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
