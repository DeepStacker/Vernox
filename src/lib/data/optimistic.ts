/**
 * Shared mutation helper: optimistic cache update, rollback and a visible error on failure,
 * so the UI never shows data as saved when the write was rejected.
 */
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';

/** Firestore rejects `undefined` field values; drop them before writing. */
export function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

interface OptimisticOptions<TCache, TVars> {
  queryKey: QueryKey;
  mutationFn: (vars: TVars) => Promise<unknown>;
  /** Produces the next cached value; omit to skip the optimistic update. */
  apply?: (cache: TCache | undefined, vars: TVars) => TCache | undefined;
  failureMessage: string;
  successMessage?: string;
}

export function useOptimisticMutation<TCache, TVars>(opts: OptimisticOptions<TCache, TVars>) {
  const qc = useQueryClient();
  const mutation = useMutation<unknown, Error, TVars, { previous: TCache | undefined }>({
    mutationFn: opts.mutationFn,
    onMutate: async vars => {
      await qc.cancelQueries({ queryKey: opts.queryKey });
      const previous = qc.getQueryData<TCache>(opts.queryKey);
      if (opts.apply) qc.setQueryData<TCache | undefined>(opts.queryKey, cur => opts.apply!(cur, vars));
      return { previous };
    },
    onError: (err, _vars, ctx) => {
      if (opts.apply) qc.setQueryData(opts.queryKey, ctx?.previous);
      toast.error(`${opts.failureMessage}: ${errorMessage(err, 'please try again')}`);
    },
    onSuccess: () => {
      if (opts.successMessage) toast.success(opts.successMessage);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: opts.queryKey });
    },
  });
  /** Resolves true on success, false on failure (the failure toast has already been shown). */
  const run = async (vars: TVars): Promise<boolean> => {
    try {
      await mutation.mutateAsync(vars);
      return true;
    } catch {
      return false;
    }
  };
  return { mutation, run };
}
