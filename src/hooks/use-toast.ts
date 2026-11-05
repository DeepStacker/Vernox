import { toast as sonnerToast } from "sonner";
import type { ReactNode } from "react";

/**
 * Compatibility adapter: the CAD studio calls the shadcn-style
 * `toast({ title, description, variant })` API. Sonner is the single toast
 * system mounted in App.tsx, so route those calls through it.
 */
interface ToastOptions {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive";
}

export function toast({ title, description, variant }: ToastOptions) {
  const show = variant === "destructive" ? sonnerToast.error : sonnerToast;
  const id = show(title ?? "", { description });
  return { id, dismiss: () => sonnerToast.dismiss(id) };
}

export function useToast() {
  return { toast, dismiss: (id?: string | number) => sonnerToast.dismiss(id) };
}
