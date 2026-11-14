import { Download } from 'lucide-react';
import { useDesignFileUrl } from '@/lib/data/staffDesignFiles';
import type { DesignFile } from '@/types/staffOrders';

function DesignFileLink({ file }: { file: DesignFile }) {
  const { data: url, isLoading, error } = useDesignFileUrl(file.path);
  // A link that downloads, never an inline render: an SVG from our storage origin could run script.
  if (url) {
    return (
      <a href={url} download={file.name} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">
        <Download className="h-3.5 w-3.5" aria-hidden /> {file.name}
      </a>
    );
  }
  return <span className="text-xs text-muted-foreground">{file.name}: {isLoading ? 'loading…' : error ? 'unavailable' : ''}</span>;
}

/** Download links for the design files staff attached to a custom line (job card and order detail). */
export function DesignFileLinks({ files }: { files?: readonly DesignFile[] }) {
  if (!files?.length) return null;
  return (
    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1" aria-label="Design files">
      {files.map(f => <li key={f.path}><DesignFileLink file={f} /></li>)}
    </ul>
  );
}
