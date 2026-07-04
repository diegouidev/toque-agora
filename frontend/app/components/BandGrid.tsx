"use client";

import { coverUrl, type BandSummary } from "../lib/api";
import { gradientFor, initials } from "../lib/covers";
import { PlayIcon } from "./icons";

interface Props {
  bands: BandSummary[];
  selectedId: number | null;
  onOpen: (band: BandSummary) => void;
  onPlay: (band: BandSummary) => void;
  onDelete: (band: BandSummary) => void;
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
            {b.categories && b.categories.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {b.categories.slice(0, 2).map((c) => (
                  <span
                    key={c.id}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-300"
                  >
                    {c.name}
                  </span>
                ))}
                {b.categories.length > 2 && (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                    +{b.categories.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
