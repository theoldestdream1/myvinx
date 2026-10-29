import { toast as sonner } from "sonner";

type ToastInput = { title?: string; description?: string; variant?: "default" | "destructive" };

/** Compatibility wrapper: the old shadcn toast API, rendered with sonner. */
export function useToast() {
  const toast = ({ title, description, variant }: ToastInput) => {
    if (variant === "destructive") sonner.error(title ?? "Error", { description });
    else sonner(title ?? "", { description });
  };
  return { toast };
}
