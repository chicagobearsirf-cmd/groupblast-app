import type { ReactNode } from "react";
import { toast as sonnerToast, type ExternalToast } from "sonner";

/**
 * Thin wrapper around Sonner's `toast` that applies sensible per-type defaults so
 * notifications don't pile up or linger forever:
 *
 *  - success / info / plain  -> auto-dismiss after 4s
 *  - warning                 -> auto-dismiss after 8s, always shows a close (X)
 *  - error                   -> stays 12s, always shows a close (X)
 *
 * The global <Toaster> also enables `closeButton`, so every toast is dismissable.
 * Call sites use the same API as `sonner` (`toast.success(msg)`, `toast.error(msg)`),
 * so swapping the import is the only change needed.
 */

const DURATION = {
  short: 4000, // success / info / plain messages
  warning: 8000,
  error: 12000,
} as const;

type Message = ReactNode;

export const toast = Object.assign(
  (message: Message, data?: ExternalToast) =>
    sonnerToast(message, { duration: DURATION.short, ...data }),
  {
    success: (message: Message, data?: ExternalToast) =>
      sonnerToast.success(message, { duration: DURATION.short, ...data }),
    info: (message: Message, data?: ExternalToast) =>
      sonnerToast.info(message, { duration: DURATION.short, ...data }),
    message: (message: Message, data?: ExternalToast) =>
      sonnerToast.message(message, { duration: DURATION.short, ...data }),
    warning: (message: Message, data?: ExternalToast) =>
      sonnerToast.warning(message, {
        duration: DURATION.warning,
        closeButton: true,
        ...data,
      }),
    error: (message: Message, data?: ExternalToast) =>
      sonnerToast.error(message, {
        duration: DURATION.error,
        closeButton: true,
        ...data,
      }),
    loading: sonnerToast.loading,
    promise: sonnerToast.promise,
    dismiss: sonnerToast.dismiss,
    custom: sonnerToast.custom,
  },
);
