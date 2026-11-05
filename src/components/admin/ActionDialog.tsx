import type { FormEvent, ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AdminError, dangerButton } from './AdminUi';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  submitLabel: string;
  busy?: boolean;
  /** Disables submit until the form is valid. */
  canSubmit?: boolean;
  destructive?: boolean;
  /** Error text from the last attempt, kept inside the dialog next to the form. */
  error?: ReactNode;
  onSubmit: () => void | Promise<void>;
  children: ReactNode;
}

/** The one dialog shape for staff actions: title, fields, inline error, cancel and confirm buttons. */
export function ActionDialog({ open, onClose, title, description, submitLabel, busy, canSubmit = true, destructive, error, onSubmit, children }: Props) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy && canSubmit) void onSubmit();
  };
  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          {error && <AdminError>{error}</AdminError>}
          <DialogFooter className="gap-2 sm:gap-0">
            <button type="button" onClick={onClose} disabled={busy} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={busy || !canSubmit} className={destructive ? dangerButton : 'btn-primary'}>
              {busy ? 'Working…' : submitLabel}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
