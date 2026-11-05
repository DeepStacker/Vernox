import { useEffect, useState } from 'react';
import { imageObjectUrl } from './photoStorage';

export interface PhotoUrl {
  url: string | null;
  loading: boolean;
  error: boolean;
}

/** Same-origin blob: URL of a Storage image (see imageObjectUrl); revoked when the path changes or the component unmounts. */
export function usePhotoUrl(path: string | null | undefined, enabled = true): PhotoUrl {
  const [state, setState] = useState<PhotoUrl>({ url: null, loading: !!path && enabled, error: false });

  useEffect(() => {
    if (!path || !enabled) {
      setState({ url: null, loading: false, error: false });
      return;
    }
    let cancelled = false;
    let created: string | null = null;
    setState({ url: null, loading: true, error: false });
    imageObjectUrl(path)
      .then(url => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        created = url;
        setState({ url, loading: false, error: false });
      })
      .catch(() => !cancelled && setState({ url: null, loading: false, error: true }));
    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path, enabled]);

  return state;
}
