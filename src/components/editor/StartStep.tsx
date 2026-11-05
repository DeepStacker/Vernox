import { useState } from 'react';
import { History, Square, Trash2, Upload } from 'lucide-react';
import { deleteProject, listProjects, readAutosave } from '@/lib/projectStorage';
import type { StudioDocument } from '@/lib/studio/schema';
import { t } from '@/lib/studio/i18n';
import { useStudio } from '@/lib/studio/store';
import { TemplatesGrid } from './panels/TemplatesPanel';
import { startBlank } from './actions';
import { useStudioUi } from './uiStore';

/** Step 1: template, blank plate or upload — plus "continue" when an autosave exists. */
export function StartStep() {
  const [saved] = useState(readAutosave);
  const [projects, setProjects] = useState(listProjects);
  const open = (doc: StudioDocument) => {
    useStudio.getState().loadDocument(doc);
    useStudioUi.getState().setStep('design');
    useStudioUi.getState().requestFit();
  };
  const resume = () => saved && open(saved.doc);
  const upload = () => {
    startBlank();
    useStudioUi.getState().openTrace();
  };
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 overflow-y-auto px-4 py-6 sm:py-10">
      <h1 className="font-brand text-2xl text-foreground sm:text-3xl">{t('start.title')}</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        {saved && saved.doc.objects.length > 0 && (
          <button type="button" onClick={resume} className="flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-left hover:bg-primary/10 sm:col-span-3">
            <History className="h-5 w-5 text-primary" />
            <span className="text-sm text-foreground">{t('start.resume')}</span>
          </button>
        )}
        <button type="button" onClick={() => startBlank()} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:shadow-md">
          <Square className="h-5 w-5 text-foreground" />
          <span className="text-sm text-foreground">{t('start.blank')}</span>
        </button>
        <button type="button" onClick={upload} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:shadow-md sm:col-span-2">
          <Upload className="h-5 w-5 text-foreground" />
          <span className="text-sm text-foreground">{t('start.upload')}</span>
        </button>
      </div>
      {projects.length > 0 && (
        <>
          <h2 className="text-sm font-medium text-muted-foreground">{t('start.saved')}</h2>
          <ul className="flex flex-wrap gap-2">
            {projects.map(p => (
              <li key={p.id} className="flex items-center rounded-full border border-border bg-card text-sm">
                <button type="button" className="px-3 py-1.5 text-foreground" onClick={() => open(p.doc)}>{p.name}</button>
                <button type="button" aria-label={`Delete ${p.name}`} className="pr-2 text-muted-foreground hover:text-destructive" onClick={() => { deleteProject(p.id); setProjects(listProjects()); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <h2 className="text-sm font-medium text-muted-foreground">{t('start.templates')}</h2>
      <TemplatesGrid columns={3} />
    </div>
  );
}
