'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const MAX_VISIBLE_TOASTS = 3;
const TOAST_EXIT_DURATION = 150;

const TOAST_DURATIONS = {
  success: 3_000,
  error: 6_000,
  warning: 4_000,
  info: 4_000,
} as const;

type ToastType = keyof typeof TOAST_DURATIONS;

type ToastContent = {
  title?: string;
  description?: string;
};

type ErrorToastContent = {
  title?: string;
  description: string;
  suggestion: string;
};

type StandardToastOptions = ToastContent & {
  type: Exclude<ToastType, 'error'>;
  suggestion?: never;
};

type ErrorToastOptions = ErrorToastContent & {
  type: 'error';
};

type ToastOptions = StandardToastOptions | ErrorToastOptions;

type ToastCommonProps = {
  className?: string;
  onDismiss?: () => void;
  open?: boolean;
  title?: string;
};

type StandardToastProps = ToastCommonProps &
  ToastContent & {
    type: Exclude<ToastType, 'error'>;
    suggestion?: never;
  };

type ErrorToastProps = ToastCommonProps &
  ErrorToastContent & {
    type: 'error';
  };

type ToastProps = StandardToastProps | ErrorToastProps;

type StoredToast = ToastOptions & {
  duration: (typeof TOAST_DURATIONS)[ToastType];
  exiting: boolean;
  id: string;
};

type ToastContextValue = {
  dismiss: (id: string) => void;
  dismissAll: () => void;
  error: (content: ErrorToastContent) => string;
  info: (content?: ToastContent) => string;
  success: (content?: ToastContent) => string;
  toast: (options: ToastOptions) => string;
  warning: (content?: ToastContent) => string;
};

type ToastVisual = {
  accentClassName: string;
  iconClassName: string;
  icon: LucideIcon;
  label: string;
};

const TOAST_VISUALS: Record<ToastType, ToastVisual> = {
  success: {
    accentClassName: 'border-l-[var(--success)]',
    iconClassName: 'text-[var(--success)]',
    icon: CheckCircle2,
    label: 'Sukses',
  },
  error: {
    accentClassName: 'border-l-[var(--danger)]',
    iconClassName: 'text-[var(--danger)]',
    icon: XCircle,
    label: 'Gagal',
  },
  warning: {
    accentClassName: 'border-l-[var(--warning)]',
    iconClassName: 'text-[var(--warning)]',
    icon: AlertTriangle,
    label: 'Peringatan',
  },
  info: {
    accentClassName: 'border-l-[var(--info)]',
    iconClassName: 'text-[var(--info)]',
    icon: Info,
    label: 'Informasi',
  },
};

const DEFAULT_TITLES: Record<ToastType, string> = {
  success: 'Berhasil',
  error: 'Terjadi kesalahan',
  warning: 'Perhatian',
  info: 'Informasi',
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

let toastSequence = 0;

function createToastId() {
  toastSequence += 1;
  return `toast-${toastSequence}`;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertValidToast(options: ToastOptions): void {
  if (options.type !== 'error') return;

  if (!hasText(options.description) || !hasText(options.suggestion)) {
    throw new Error('Toast gagal wajib memuat penjelasan dan saran tindakan.');
  }
}

function Toast(props: ToastProps) {
  assertValidToast(props);

  const { className, description, onDismiss, open = true, suggestion, type } = props;
  const title = hasText(props.title) ? props.title : DEFAULT_TITLES[type];
  const visual = TOAST_VISUALS[type];
  const Icon = visual.icon;
  const liveRole = type === 'error' || type === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={liveRole}
      aria-atomic="true"
      data-slot="toast"
      data-state={open ? 'open' : 'closed'}
      data-type={type}
      className={cn(
        'pointer-events-auto w-full rounded-sm border border-l-4 border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 text-[var(--text-primary)] shadow-lg',
        'transition-[opacity,transform] duration-[150ms] ease-out motion-reduce:transform-none motion-reduce:transition-none',
        open ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0',
        visual.accentClassName,
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <Icon
          aria-hidden="true"
          className={cn('mt-0.5 size-5 shrink-0', visual.iconClassName)}
          strokeWidth={2}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-5 font-semibold">
            <span className="sr-only">{visual.label}: </span>
            {title}
          </p>
          {hasText(description) ? (
            <p className="mt-1 text-[13px] leading-[18px] text-[var(--text-secondary)]">
              {description}
            </p>
          ) : null}
          {type === 'error' ? (
            <p className="mt-2 text-[13px] leading-[18px] text-[var(--text-primary)]">
              <span className="font-medium">Saran: </span>
              {suggestion}
            </p>
          ) : null}
        </div>
        {onDismiss ? (
          <button
            type="button"
            aria-label={`Tutup notifikasi: ${title}`}
            className={cn(
              '-m-1 inline-flex size-[34px] shrink-0 items-center justify-center rounded-sm text-[var(--text-secondary)] outline-none',
              'transition-[background-color,color,box-shadow] duration-fast ease-out hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]',
              'focus-visible:ring-3 focus-visible:ring-[var(--border-focus)] motion-reduce:transition-none',
            )}
            onClick={onDismiss}
          >
            <X aria-hidden="true" className="size-4" strokeWidth={2} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

type ManagedToastProps = {
  onDismiss: (id: string) => void;
  onRemove: (id: string) => void;
  toast: StoredToast;
};

function ManagedToast({ onDismiss, onRemove, toast }: ManagedToastProps) {
  const [entered, setEntered] = React.useState(false);

  React.useEffect(() => {
    const enterTimer = window.setTimeout(() => setEntered(true), 0);
    return () => window.clearTimeout(enterTimer);
  }, []);

  React.useEffect(() => {
    if (toast.exiting) return;

    const dismissTimer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(dismissTimer);
  }, [onDismiss, toast.duration, toast.exiting, toast.id]);

  React.useEffect(() => {
    if (!toast.exiting) return;

    const removeTimer = window.setTimeout(() => onRemove(toast.id), TOAST_EXIT_DURATION);
    return () => window.clearTimeout(removeTimer);
  }, [onRemove, toast.exiting, toast.id]);

  const open = entered && !toast.exiting;
  const dismiss = () => onDismiss(toast.id);

  if (toast.type === 'error') {
    return (
      <Toast
        type="error"
        title={toast.title}
        description={toast.description}
        suggestion={toast.suggestion}
        open={open}
        onDismiss={dismiss}
      />
    );
  }

  return (
    <Toast
      type={toast.type}
      title={toast.title}
      description={toast.description}
      open={open}
      onDismiss={dismiss}
    />
  );
}

type ToastProviderProps = {
  children: React.ReactNode;
};

function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<StoredToast[]>([]);

  const remove = React.useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => {
      const visibleIds = new Set(current.slice(0, MAX_VISIBLE_TOASTS).map((toast) => toast.id));

      if (!visibleIds.has(id)) {
        return current.filter((toast) => toast.id !== id);
      }

      return current.map((toast) => (toast.id === id ? { ...toast, exiting: true } : toast));
    });
  }, []);

  const dismissAll = React.useCallback(() => {
    setToasts((current) =>
      current.slice(0, MAX_VISIBLE_TOASTS).map((toast) => ({ ...toast, exiting: true })),
    );
  }, []);

  const showToast = React.useCallback((options: ToastOptions) => {
    assertValidToast(options);

    const id = createToastId();
    const storedToast: StoredToast = {
      ...options,
      duration: TOAST_DURATIONS[options.type],
      exiting: false,
      id,
    };

    setToasts((current) => [...current, storedToast]);
    return id;
  }, []);

  const success = React.useCallback(
    (content: ToastContent = {}) => showToast({ ...content, type: 'success' }),
    [showToast],
  );
  const error = React.useCallback(
    (content: ErrorToastContent) => showToast({ ...content, type: 'error' }),
    [showToast],
  );
  const warning = React.useCallback(
    (content: ToastContent = {}) => showToast({ ...content, type: 'warning' }),
    [showToast],
  );
  const info = React.useCallback(
    (content: ToastContent = {}) => showToast({ ...content, type: 'info' }),
    [showToast],
  );

  const contextValue = React.useMemo<ToastContextValue>(
    () => ({ dismiss, dismissAll, error, info, success, toast: showToast, warning }),
    [dismiss, dismissAll, error, info, showToast, success, warning],
  );
  const visibleToasts = toasts.slice(0, MAX_VISIBLE_TOASTS);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div
        data-slot="toast-viewport"
        aria-label="Notifikasi"
        className="pointer-events-none fixed top-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-[360px] flex-col gap-2"
      >
        {visibleToasts.map((toast) => (
          <ManagedToast key={toast.id} toast={toast} onDismiss={dismiss} onRemove={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  const context = React.useContext(ToastContext);

  if (!context) {
    throw new Error('useToast harus digunakan di dalam ToastProvider.');
  }

  return context;
}

export { MAX_VISIBLE_TOASTS, TOAST_DURATIONS, TOAST_EXIT_DURATION, Toast, ToastProvider, useToast };
export type {
  ErrorToastContent,
  ErrorToastOptions,
  ErrorToastProps,
  StandardToastOptions,
  StandardToastProps,
  ToastContent,
  ToastContextValue,
  ToastOptions,
  ToastProps,
  ToastProviderProps,
  ToastType,
};
