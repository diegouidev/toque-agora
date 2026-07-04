"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

interface ConfirmOpts {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOpts {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
}

interface DialogApi {
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  prompt: (opts: PromptOpts) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

type State =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | null;

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback(
    (opts: ConfirmOpts) =>
      new Promise<boolean>((resolve) => setState({ kind: "confirm", opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOpts) =>
      new Promise<string | null>((resolve) => {
        setValue(opts.defaultValue ?? "");
        setState({ kind: "prompt", opts, resolve });
      }),
    [],
  );

  const api = useRef<DialogApi>({ confirm, prompt });
  api.current = { confirm, prompt };

  const close = useCallback(
    (result: boolean | string | null) => {
      if (!state) return;
      if (state.kind === "confirm") state.resolve(result as boolean);
      else state.resolve(result as string | null);
      setState(null);
    },
    [state],
  );

  // Foco no input do prompt ao abrir.
  useEffect(() => {
    if (state?.kind === "prompt") {
      const t = setTimeout(() => inputRef.current?.select(), 30);
      return () => clearTimeout(t);
    }
  }, [state]);

  // Esc cancela; Enter confirma (no confirm).
  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(state!.kind === "confirm" ? false : null);
      else if (e.key === "Enter" && state!.kind === "confirm") close(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  return (
    <DialogContext.Provider value={api.current}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => close(state.kind === "confirm" ? false : null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={state.opts.title}
            className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h2 className="text-lg font-bold">{state.opts.title}</h2>
              {state.opts.message && (
                <p className="text-sm text-zinc-400">{state.opts.message}</p>
              )}
            </div>

            {state.kind === "prompt" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  close(value.trim() ? value.trim() : null);
                }}
              >
                <input
                  ref={inputRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={state.opts.placeholder}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </form>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => close(state.kind === "confirm" ? false : null)}
                className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
              >
                {state.kind === "confirm"
                  ? state.opts.cancelLabel ?? "Cancelar"
                  : "Cancelar"}
              </button>
              <button
                onClick={() =>
                  close(
                    state.kind === "confirm"
                      ? true
                      : value.trim()
                        ? value.trim()
                        : null,
                  )
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  state.kind === "confirm" && state.opts.danger
                    ? "bg-red-600 text-white hover:bg-red-500"
                    : "bg-accent text-black hover:brightness-105"
                }`}
              >
                {state.kind === "confirm"
                  ? state.opts.confirmLabel ?? "Confirmar"
                  : state.opts.confirmLabel ?? "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    return {
      confirm: async () => false,
      prompt: async () => null,
    };
  }
  return ctx;
}
