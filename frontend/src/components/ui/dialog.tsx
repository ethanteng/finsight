"use client";

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

export type DialogTone = 'info' | 'success' | 'danger';

export interface DialogOptions {
  /** Heading shown above the message. Defaults to a tone-appropriate title. */
  title?: string;
  tone?: DialogTone;
  confirmLabel?: string;
}

export interface ConfirmOptions extends DialogOptions {
  message: string;
  cancelLabel?: string;
}

interface DialogRequest {
  kind: 'alert' | 'confirm';
  message: string;
  title: string;
  tone: DialogTone;
  confirmLabel: string;
  cancelLabel: string;
}

const DEFAULT_TITLES: Record<DialogTone, string> = {
  info: 'Heads up',
  success: 'All set',
  danger: 'Something went wrong',
};

const TONE_ICONS: Record<DialogTone, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  danger: AlertTriangle,
};

const TONE_ICON_CLASSES: Record<DialogTone, string> = {
  info: 'bg-blue-500/10 text-blue-500',
  success: 'bg-green-500/10 text-green-600',
  danger: 'bg-red-500/10 text-red-500',
};

/**
 * Modal shell shared by every in-app dialog. It is rendered inline rather than
 * through a portal so the `.authenticated-site` palette in globals.css still
 * applies on the product screens.
 */
export function Dialog({ request, onResolve }: { request: DialogRequest; onResolve: (confirmed: boolean) => void }) {
  const titleId = useId();
  const messageId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const Icon = TONE_ICONS[request.tone];

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    confirmRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onResolve(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onResolve]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => onResolve(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="ui-dialog-panel w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', TONE_ICON_CLASSES[request.tone])}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="ui-dialog-title text-lg font-semibold leading-snug">
              {request.title}
            </h2>
            <p id={messageId} className="ui-dialog-message mt-2 text-sm leading-relaxed text-muted-foreground">
              {request.message}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {request.kind === 'confirm' && (
            <Button
              variant="outline"
              className="ui-dialog-cancel sm:min-w-[7rem]"
              onClick={() => onResolve(false)}
            >
              {request.cancelLabel}
            </Button>
          )}
          <Button
            ref={confirmRef}
            variant={request.tone === 'danger' && request.kind === 'confirm' ? 'destructive' : 'default'}
            className={cn(
              'sm:min-w-[7rem]',
              request.tone === 'danger' && request.kind === 'confirm' ? 'ui-dialog-confirm-danger' : 'ui-dialog-confirm',
            )}
            onClick={() => onResolve(true)}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Promise-based replacement for `window.alert` / `window.confirm`.
 *
 * ```tsx
 * const { showError, showConfirm, dialog } = useDialog();
 * ...
 * if (!(await showConfirm({ message: 'Delete this account?' }))) return;
 * ...
 * return (<div>...{dialog}</div>);
 * ```
 */
export function useDialog() {
  const [request, setRequest] = useState<DialogRequest | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const open = useCallback((next: DialogRequest) => {
    // A dialog that replaces an unanswered one settles it as dismissed.
    resolveRef.current?.(false);
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setRequest(next);
    });
  }, []);

  const resolve = useCallback((confirmed: boolean) => {
    const pending = resolveRef.current;
    resolveRef.current = null;
    setRequest(null);
    pending?.(confirmed);
  }, []);

  useEffect(() => () => resolveRef.current?.(false), []);

  const showAlert = useCallback(
    (message: string, options: DialogOptions = {}) => {
      const tone = options.tone ?? 'info';
      return open({
        kind: 'alert',
        message,
        tone,
        title: options.title ?? DEFAULT_TITLES[tone],
        confirmLabel: options.confirmLabel ?? 'OK',
        cancelLabel: 'Cancel',
      }).then(() => undefined);
    },
    [open],
  );

  const showError = useCallback(
    (message: string, options: DialogOptions = {}) => showAlert(message, { tone: 'danger', ...options }),
    [showAlert],
  );

  const showConfirm = useCallback(
    (options: ConfirmOptions) => {
      const tone = options.tone ?? 'danger';
      return open({
        kind: 'confirm',
        message: options.message,
        tone,
        title: options.title ?? 'Are you sure?',
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
      });
    },
    [open],
  );

  const dialog = request ? <Dialog request={request} onResolve={resolve} /> : null;

  return { showAlert, showError, showConfirm, dialog };
}
