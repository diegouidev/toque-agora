"use client";

import { useEffect, useState } from "react";
import { fetchMyStats, type MeStats, type StatItem } from "../lib/api";
import { useEscClose } from "../lib/useEscClose";
import { CloseIcon } from "./icons";

function fmtSince(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function Rank({ title, items }: { title: string; items: StatItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">{title}</h3>
      <ol className="space-y-1">
        {items.map((it, i) => (
          <li
            key={`${it.label}-${i}`}
            className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
          >
            <span className="w-5 shrink-0 text-center text-sm font-black text-accent">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{it.label}</p>
              {it.sublabel && (
                <p className="truncate text-xs text-zinc-400">{it.sublabel}</p>
              )}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-zinc-400">
              {it.plays}×
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function StatsModal({ onClose }: { onClose: () => void }) {
  useEscClose(onClose);
  const [stats, setStats] = useState<MeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchMyStats()
      .then(setStats)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const empty = stats && stats.total_plays === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Minha retrospectiva"
        className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-black">Minha retrospectiva</h2>
            {stats?.since && (
              <p className="text-xs text-zinc-400">desde {fmtSince(stats.since)}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-zinc-500">Calculando…</p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-red-400">
            Não foi possível carregar a retrospectiva.
          </p>
        ) : empty ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            Você ainda não tem histórico. Toque algumas faixas e volte aqui!
          </p>
        ) : (
          stats && (
            <>
              {/* Números do topo */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-white/5 py-3">
                  <p className="text-2xl font-black text-accent">{stats.total_minutes}</p>
                  <p className="text-[11px] text-zinc-400">minutos</p>
                </div>
                <div className="rounded-xl bg-white/5 py-3">
                  <p className="text-2xl font-black text-accent">{stats.total_plays}</p>
                  <p className="text-[11px] text-zinc-400">reproduções</p>
                </div>
                <div className="rounded-xl bg-white/5 py-3">
                  <p className="text-2xl font-black text-accent">{stats.unique_tracks}</p>
                  <p className="text-[11px] text-zinc-400">faixas</p>
                </div>
              </div>

              <Rank title="Faixas mais tocadas" items={stats.top_tracks} />
              <Rank title="CDs mais tocados" items={stats.top_bands} />
              <Rank title="Gêneros favoritos" items={stats.top_categories} />
            </>
          )
        )}
      </div>
    </div>
  );
}
