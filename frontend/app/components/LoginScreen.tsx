"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth-context";

export default function LoginScreen({
  initialMode = "login",
  onBack,
}: {
  initialMode?: "login" | "register";
  onBack?: () => void;
} = {}) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password, name.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha");
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-surface/60 p-7 shadow-2xl backdrop-blur"
      >
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-indigo-600 text-3xl shadow-lg">
            🎧
          </div>
          <h1 className="font-display text-2xl font-black uppercase tracking-tight">
            Toque <span className="text-accent">Agora</span>
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            {isRegister ? "Crie sua conta e assine um plano" : "A sua Playlist preferida"}
          </p>
        </div>

        <div className="space-y-3">
          {isRegister && (
            <input
              type="text"
              autoComplete="name"
              placeholder="Seu nome (opcional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-accent"
            />
          )}
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder={isRegister ? "Senha (mín. 8)" : "Senha"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isRegister ? 8 : undefined}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none focus:border-accent"
          />
        </div>

        {error && <p className="text-center text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-accent py-3 text-sm font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-50"
        >
          {busy ? "Aguarde…" : isRegister ? "Criar conta" : "Entrar"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(isRegister ? "login" : "register");
            setError(null);
          }}
          className="w-full text-center text-xs text-zinc-400 hover:text-white"
        >
          {isRegister ? "Já tenho conta — entrar" : "Não tem conta? Criar agora"}
        </button>

        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="w-full text-center text-xs text-zinc-500 hover:text-white"
          >
            ← Voltar
          </button>
        )}
      </form>
    </main>
  );
}
