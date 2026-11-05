import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { t } from '@/lib/studio/i18n';
import { STUDIO_SHORTCUTS } from './shortcuts';
import { useStudioUi } from './uiStore';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function ShortcutsDialog() {
  const open = useStudioUi(s => s.shortcutsOpen);
  const setOpen = useStudioUi(s => s.setShortcutsOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogTitle>{t('shortcuts.title')}</DialogTitle>
        <DialogDescription className="sr-only">Keyboard shortcuts available in the design studio.</DialogDescription>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          {STUDIO_SHORTCUTS.map(s => (
            <div key={s.keys} className="contents">
              <dt><kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{isMac ? s.keys.replace(/Ctrl/g, '⌘') : s.keys}</kbd></dt>
              <dd className="text-muted-foreground">{s.label}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
