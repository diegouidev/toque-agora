"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const STYLES: Record<ToastKind, string> = {
  success: "border-accent/40 bg-accent/15 text-accent",
  error: "border-red-500/40 bg-red-500/15 text-red-300",
  info: "border-white/15 bg-white/10 text-zinc-100",
};

const ICON: Record<ToastKind, string> = {
  success: "✓",
  error: "!",
  info: "i",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts, { id, kind, message }]);
      // Erros ficam um pouco mais na tela que sucessos.
      setTimeout(() => remove(id), kind === "error" ? 5000 : 3000);
    },
    [remove],
  );

  const api = useRef<ToastApi>({
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  });
  // Mantém as closures atualizadas (push é estável, mas por segurança).
  api.current = {
    success: (m) => push("success", m),
    error: (m) => push("error", m),
    info: (m) => push("info", m),
  };

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      {/* Pilha de toasts (acima do player e da nav) */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map((t) => (
          <button
            key={t.id}
            onClick={() => remove(t.id)}
            className={`pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm font-medium shadow-2xl backdrop-blur-xl animate-fade-up ${STYLES[t.kind]}`}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-current/20 text-xs font-black">
              {ICON[t.kind]}
            </span>
            <span className="text-left text-zinc-100">{t.message}</span>
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback seguro se usado fora do provider (não deve acontecer).
    return { success: () => {}, error: () => {}, info: () => {} };
  }
  return ctx;
}
