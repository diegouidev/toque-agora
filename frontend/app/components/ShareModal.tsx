"use client";

import { useEffect, useState } from "react";
import {
  fetchPlaylistShares,
  sharePlaylist,
  unsharePlaylist,
  type PlaylistShareOut,
  type PlaylistSummary,
} from "../lib/api";
import { useEscClose } from "../lib/useEscClose";
import { CloseIcon } from "./icons";

interface Props {
  playlist: PlaylistSummary;
  onClose: () => void;
  /** Avisa o pai para recarregar contagens etc. após mudança. */
  onChanged?: () => void;
}

export default function ShareModal({ playlist, onClose, onChanged }: Props) {
  useEscClose(onClose);
  const [shares, setShares] = useState<PlaylistShareOut[]>([]);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setShares(await fetchPlaylistShares(playlist.id));
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist.id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = email.trim();
    if (!value) return;
    setBusy(true);
    try {
      await sharePlaylist(playlist.id, value);
      setEmail("");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao compartilhar");
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: number) {
    try {
      await unsharePlaylist(playlist.id, userId);
      await load();
      onChanged?.();
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compartilhar playlist"
        className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-bold">Compartilhar playlist</h2>
            <p className="truncate text-sm text-zinc-400">{playlist.name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={add} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@do.usuario"
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            disabled={busy}
            className="rounded-lg bg-accent px-4 text-sm font-semibold text-black disabled:opacity-50"
          >
            Compartilhar
          </button>
        </form>
        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Com acesso ({shares.length})
          </p>
          {shares.length === 0 ? (
            <p className="py-2 text-sm text-zinc-500">Ainda não compartilhada.</p>
          ) : (
            shares.map((s) => (
              <div
                key={s.user_id}
                className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm"
              >
                <span className="truncate">{s.email}</span>
                <button
                  onClick={() => remove(s.user_id)}
                  className="shrink-0 text-zinc-400 hover:text-red-400"
                  aria-label={`Remover ${s.email}`}
                  title="Remover acesso"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
