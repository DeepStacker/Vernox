import { useState } from 'react';
import { Clock } from 'lucide-react';
import { ContentPage } from '@/components/shop/ContentPage';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useCatalog, type Topic } from '@/lib/catalogContext';
import { useSeo } from '@/lib/seo';

/** Journal of design guides stored in Firestore `topics`. Not linked from the main navigation; kept noindex. */
export default function Notebook() {
  useSeo({ title: 'Notebook', noindex: true });
  const { topics } = useCatalog();
  const [open, setOpen] = useState<Topic | null>(null);

  return (
    <ContentPage title="Notebook" intro="Design guides and notes on shaping metal." wide>
      {topics.length === 0 ? (
        <p className="text-muted-foreground">No articles yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map(t => (
            <li key={t.id}>
              <button type="button" onClick={() => setOpen(t)} className="h-full w-full rounded-lg border border-border bg-card p-4 text-left hover:border-burgundy">
                <span className="eyebrow">{t.category}</span>
                <span className="mt-1 block font-display text-xl">{t.title}</span>
                <span className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{t.readTime} · {t.date}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!open} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogTitle className="font-display text-2xl">{open?.title}</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-foreground">{open?.content}</DialogDescription>
        </DialogContent>
      </Dialog>
    </ContentPage>
  );
}
