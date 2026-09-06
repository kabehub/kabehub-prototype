"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastKind = "success" | "error";

type Toast = {
  id: number;
  message: string;
  kind: ToastKind;
};

export interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const removeToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = ++nextIdRef.current;
      setToasts((current) => [...current, { id, message, kind }]);

      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, kind === "error" ? 4000 : 2000);
      timersRef.current.set(id, timer);
    },
    []
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="chat-toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={"chat-toast chat-toast-" + toast.kind}
            role={toast.kind === "error" ? "alert" : "status"}
          >
            <span>{toast.message}</span>
            {toast.kind === "error" && (
              <button
                type="button"
                className="chat-toast-close"
                aria-label="通知を閉じる"
                onClick={() => removeToast(toast.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return value;
}
