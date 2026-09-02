'use client';

import * as React from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type ConfirmationLevel = 'simple' | 'reason' | 'typed';

type SimpleConfirmation = {
  level: 'simple';
};

type ReasonConfirmation = {
  level: 'reason';
  reasonLabel?: string;
  reasonPlaceholder?: string;
};

type TypedConfirmation = {
  level: 'typed';
  confirmationText: string;
};

type ConfirmationRequirement = SimpleConfirmation | ReasonConfirmation | TypedConfirmation;

type ConfirmationValues = {
  reason: string;
  typedText: string;
};

type ConfirmationPayload =
  { level: 'simple' } | { level: 'reason'; reason: string } | { level: 'typed'; typedText: string };

type ConfirmDialogCommonProps = {
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: NonNullable<ButtonProps['variant']>;
  defaultOpen?: boolean;
  description: string;
  disabled?: boolean;
  loading?: boolean;
  onConfirm: (payload: ConfirmationPayload) => void;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  title: string;
  trigger?: React.ReactElement;
};

type ConfirmDialogProps = ConfirmDialogCommonProps & ConfirmationRequirement;

const EMPTY_VALUES: ConfirmationValues = { reason: '', typedText: '' };

function getConfirmationError(
  requirement: ConfirmationRequirement,
  values: ConfirmationValues,
): string | null {
  switch (requirement.level) {
    case 'simple':
      return null;
    case 'reason':
      return values.reason.trim().length > 0 ? null : 'Alasan wajib diisi.';
    case 'typed':
      if (requirement.confirmationText.trim().length === 0) {
        return 'Teks konfirmasi belum dikonfigurasi.';
      }

      return values.typedText === requirement.confirmationText
        ? null
        : 'Teks konfirmasi belum sesuai.';
  }
}

function createConfirmationPayload(
  requirement: ConfirmationRequirement,
  values: ConfirmationValues,
): ConfirmationPayload | null {
  if (getConfirmationError(requirement, values)) return null;

  switch (requirement.level) {
    case 'simple':
      return { level: 'simple' };
    case 'reason':
      return { level: 'reason', reason: values.reason.trim() };
    case 'typed':
      return { level: 'typed', typedText: values.typedText };
  }
}

function ConfirmDialog(props: ConfirmDialogProps) {
  const {
    cancelLabel = 'Batal',
    confirmLabel = 'Lanjutkan',
    confirmVariant = 'danger',
    defaultOpen = false,
    description,
    disabled = false,
    loading = false,
    onConfirm,
    onOpenChange,
    open,
    title,
    trigger,
  } = props;
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const [reason, setReason] = React.useState('');
  const [typedText, setTypedText] = React.useState('');
  const generatedId = React.useId();
  const reasonId = `confirm-reason-${generatedId}`;
  const typedId = `confirm-text-${generatedId}`;
  const resolvedOpen = open ?? internalOpen;
  const values = { reason, typedText };
  const validationError = getConfirmationError(props, values);
  const canConfirm = !disabled && !loading && validationError === null;

  function resetValues() {
    setReason(EMPTY_VALUES.reason);
    setTypedText(EMPTY_VALUES.typedText);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (loading && !nextOpen) return;

    if (open === undefined) setInternalOpen(nextOpen);
    if (!nextOpen) resetValues();
    onOpenChange?.(nextOpen);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = createConfirmationPayload(props, values);
    if (!payload || disabled || loading) return;

    onConfirm(payload);
    handleOpenChange(false);
  }

  return (
    <Dialog open={resolvedOpen} onOpenChange={handleOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        showCloseButton={!loading}
        onCloseAutoFocus={resetValues}
        onEscapeKeyDown={(event) => {
          if (loading) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (loading) event.preventDefault();
        }}
      >
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {props.level === 'reason' ? (
            <div className="grid gap-1.5">
              <Label htmlFor={reasonId} required>
                {props.reasonLabel ?? 'Alasan'}
              </Label>
              <Textarea
                id={reasonId}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={props.reasonPlaceholder ?? 'Tuliskan alasan tindakan ini'}
                helperText="Alasan akan dicatat pada riwayat aktivitas."
                disabled={loading}
                required
              />
            </div>
          ) : null}

          {props.level === 'typed' ? (
            <div className="grid gap-2">
              <p className="text-[13px] leading-[18px] text-secondary">
                Ketik{' '}
                <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-[12px] text-primary">
                  {props.confirmationText}
                </code>{' '}
                untuk melanjutkan.
              </p>
              <Label htmlFor={typedId} required>
                Teks konfirmasi
              </Label>
              <Input
                id={typedId}
                value={typedText}
                onChange={(event) => setTypedText(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                helperText={
                  typedText.length > 0 && validationError
                    ? validationError
                    : 'Teks harus sama persis, termasuk huruf besar dan spasi.'
                }
                disabled={loading}
                required
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleOpenChange(false)}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button type="submit" variant={confirmVariant} loading={loading} disabled={!canConfirm}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmDialog, createConfirmationPayload, getConfirmationError };
export type {
  ConfirmationLevel,
  ConfirmationPayload,
  ConfirmationRequirement,
  ConfirmationValues,
  ConfirmDialogProps,
};
