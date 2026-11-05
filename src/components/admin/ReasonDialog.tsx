import { useState, type ReactNode } from 'react';
import type { OpsResult } from '@/lib/data/orderOps';
import { ActionDialog } from './ActionDialog';
import { Field } from './AdminUi';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Label of the text box, for example "Reason (shown to the customer)". */
  label: string;
  hint?: string;
  submitLabel: string;
  destructive?: boolean;
  /** Reason is required (3 to 300 characters, like the server) unless false; an optional note may be empty. */
  required?: boolean;
  busy: boolean;
  onConfirm: (text: string) => Promise<OpsResult<unknown>>;
  /** Extra fields rendered above the reason box. */
  children?: ReactNode;
}

/** Confirmation dialog with one text box; closes on success and shows the server's error otherwise. */
export function ReasonDialog({ open, onClose, title, description, label, hint, submitLabel, destructive, required = true, busy, onConfirm, children }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();
  const valid = required ? trimmed.length >= 3 && trimmed.length <= 300 : trimmed.length <= 300;

  const close = () => { setText(''); setError(null); onClose(); };
  const submit = async () => {
    const result = await onConfirm(trimmed);
    if (result.ok) close();
    else setError(result.error);
  };

  return (
    <ActionDialog open={open} onClose={close} title={title} description={description} submitLabel={submitLabel} destructive={destructive}
      busy={busy} canSubmit={valid} error={error} onSubmit={submit}>
      {children}
      <Field label={label} hint={hint ?? (required ? 'At least 3 characters.' : undefined)}>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={300} className="field" />
      </Field>
    </ActionDialog>
  );
}
