import { useCallback, useMemo } from "react";
import { useToastStore, ToastType } from "@/store/useToastStore";

let toastCount = 0;
const generateId = () => `toast-${Date.now()}-${toastCount++}`;

// Every field below is memoized so the returned object keeps a stable
// reference across renders. Without this, components that put `toast` in a
// useCallback/useEffect dependency array (the Placement pages do, for their
// data-loading effect) got a brand new object every render — which made the
// effect re-run every render, which called setLoading(true) every render,
// which caused the page to flash between loaded content and the loading
// skeleton in a loop instead of settling.
export function useToast() {
    const addToast = useToastStore((s) => s.addToast);
    const removeToast = useToastStore((s) => s.removeToast);

    const show = useCallback(
        (opts: { type?: ToastType; title: string; description?: string; duration?: number }) => {
            const id = generateId();
            const duration = opts.duration ?? 4000;
            addToast({
                id,
                type: opts.type ?? "info",
                title: opts.title,
                description: opts.description,
                duration,
            });
            if (duration > 0) {
                setTimeout(() => removeToast(id), duration);
            }
        },
        [addToast, removeToast]
    );

    return useMemo(
        () => ({
            toast: (title: string, opts: { type?: ToastType; description?: string; duration?: number } = {}) =>
                show({ ...opts, title }),
            success: (title: string, opts: { description?: string; duration?: number } = {}) =>
                show({ type: "success", title, ...opts }),
            error: (title: string, opts: { description?: string; duration?: number } = {}) =>
                show({ type: "error", title, ...opts }),
            warning: (title: string, opts: { description?: string; duration?: number } = {}) =>
                show({ type: "warning", title, ...opts }),
            info: (title: string, opts: { description?: string; duration?: number } = {}) =>
                show({ type: "info", title, ...opts }),
            dismiss: (id: string) => removeToast(id),
        }),
        [show, removeToast]
    );
}
