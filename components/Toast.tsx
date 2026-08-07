"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

type ToastType = "success" | "error";

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextIdRef = useRef(0);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = ++nextIdRef.current;
    setToasts((current) => [...current, { id, message, type }]);

    const timer = setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, type === "error" ? 4000 : 2000);
    timersRef.current.set(id, timer);
  }, []);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: "fixed",
          right: "16px",
          bottom: "16px",
          zIndex: 10000,
          display: "flex",
          maxWidth: "calc(100vw - 32px)",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "8px",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.type === "error" ? "alert" : "status"}
            style={{
              display: "flex",
              maxWidth: "100%",
              alignItems: "center",
              gap: "12px",
              borderRadius: "8px",
              background: toast.type === "error" ? "#b91c1c" : "#166534",
              padding: "10px 14px",
              color: "white",
              boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
              fontSize: "14px",
              lineHeight: 1.5,
              overflowWrap: "anywhere",
              pointerEvents: "auto",
            }}
          >
            <span>{toast.message}</span>
            {toast.type === "error" && (
              <button
                type="button"
                aria-label="通知を閉じる"
                onClick={() => removeToast(toast.id)}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  color: "inherit",
                  fontSize: "18px",
                  lineHeight: 1,
                  cursor: "pointer",
                }}
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

export function useToast(): {
  showToast: (message: string, type?: ToastType) => void;
} {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
