"use client";

import { coverUrl, type BandSummary } from "../lib/api";
import { PlayIcon } from "./icons";

interface Props {
  bands: BandSummary[];
  selectedId: number | null;
  onOpen: (band: BandSummary) => void;
  onPlay: (band: BandSummary) => void;
  onDelete: (band: BandSummary) => void;
}

// Gradiente determinístico a partir do nome (capa "fake" de cada banda).
const GRADIENTS = [
  "from-rose-500 to-orange-500",
  "from-accent to-emerald-700",
  "from-indigo-500 to-purple-600",
  "from-sky-500 to-blue-700",
  "from-fuchsia-500 to-pink-600",
  "from-amber-400 to-red-500",
  "from-teal-400 to-cyan-600",
];
function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "♪").concat(words[1]?.[0] ?? "").toUpperCase();
}

export default function BandGrid({
  bands,
  selectedId,
  onOpen,
  onPlay,
  onDelete,
}: Props) {
  if (bands.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {bands.map((b) => {
        const active = b.id === selectedId;
        return (
          <div
            key={b.id}
            onClick={() => onOpen(b)}
            className={`group relative cursor-pointer rounded-xl border p-3 transition-colors ${
              active
                ? "border-accent/60 bg-white/10"
                : "border-white/5 bg-surface/60 hover:bg-white/5"
            }`}
          >
            {/* Botão excluir */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(b);
              }}
              className="absolute right-2 top-2 z-10 hidden h-7 w-7 items-center justify-center rounded-full bg-black/70 text-zinc-300 transition-colors hover:bg-red-600 hover:text-white group-hover:flex"
              aria-label={`Excluir ${b.name}`}
              title="Excluir o arquivo inteiro"
            >
              🗑
            </button>

            {/* Capa */}
            <div
              className={`relative mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${gradientFor(
                b.name,
              )} text-2xl font-black text-white shadow-lg`}
            >
              {b.has_cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl(b.id)}
                  alt={b.name}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => {
                    // Se falhar, esconde a imagem e deixa o gradiente/iniciais.
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : null}
              {!b.has_cover && initials(b.name)}
              {/* Badge do tipo */}
              <span className="absolute left-2 top-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {b.kind}
              </span>
              {/* Botão tocar flutuante */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPlay(b);
                }}
                className="absolute bottom-2 right-2 flex h-11 w-11 translate-y-2 items-center justify-center rounded-full bg-accent text-black opacity-0 shadow-xl transition-all hover:scale-105 group-hover:translate-y-0 group-hover:opacity-100"
                aria-label={`Tocar ${b.name}`}
                title="Tocar banda"
              >
                <PlayIcon className="ml-0.5 h-5 w-5" />
              </button>
            </div>

            <p className="truncate font-semibold" title={b.name}>
              {b.name}
            </p>
            <p className="text-xs text-zinc-400">{b.track_count} faixas</p>
          </div>
        );
      })}
    </div>
  );
}
