"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  searchAll,
  type BandSummary,
  type Category,
  type SearchResult,
  type Track,
} from "../lib/api";
import BandGrid from "./BandGrid";
import TrackList from "./TrackList";
import { BandGridSkeleton, TrackListSkeleton } from "./Skeleton";
import { SearchIcon } from "./icons";

interface Props {
  onOpenBand: (band: BandSummary) => void;
  onPlayBand: (band: BandSummary) => void;
  onDeleteBand: (band: BandSummary) => void;
  /** Toca a lista de faixas-resultado a partir do índice clicado. */
  onPlayTracks: (tracks: Track[], index: number) => void;
  currentTrackId: number | null;
  isPlaying: boolean;
  categories?: Category[];
  onToggleFavorite?: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
}

type SortMode = "relevance" | "az";

export default function SearchView({
  onOpenBand,
  onPlayBand,
  onDeleteBand,
  onPlayTracks,
  currentTrackId,
  isPlaying,
  categories = [],
  onToggleFavorite,
  onAddToPlaylist,
}: Props) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<number | null>(null);
  const [sort, setSort] = useState<SortMode>("relevance");

  // Debounce de ~250ms; cancela buscas obsoletas com um id de geração.
  const genRef = useRef(0);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResult(null);
      setLoading(false);
      return;
    }
    const gen = ++genRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchAll(term, category);
        if (gen === genRef.current) setResult(r);
      } catch {
        if (gen === genRef.current) setResult({ bands: [], tracks: [] });
      } finally {
        if (gen === genRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, category]);

  // Ordenação client-side dos resultados já filtrados pelo backend.
  const view = useMemo(() => {
    if (!result) return null;
    if (sort === "az") {
      return {
        bands: [...result.bands].sort((a, b) => a.name.localeCompare(b.name)),
        tracks: [...result.tracks].sort((a, b) =>
          a.display_name.localeCompare(b.display_name),
        ),
      };
    }
    return result;
  }, [result, sort]);

  const hasResults =
    view != null && (view.bands.length > 0 || view.tracks.length > 0);

  return (
    <div className="space-y-6">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar bandas e faixas…"
          className="w-full rounded-full border border-white/10 bg-surface px-12 py-3 text-sm outline-none focus:border-accent"
        />
      </div>

      {/* Filtros: gênero + ordenação */}
      {(categories.length > 0 || hasResults) && (
        <div className="flex flex-wrap items-center gap-2">
          {categories.length > 0 && (
            <>
              <button
                onClick={() => setCategory(null)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  category === null ? "bg-accent text-black" : "bg-white/10 hover:bg-white/20"
                }`}
              >
                Todos
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setCategory(c.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === c.id ? "bg-accent text-black" : "bg-white/10 hover:bg-white/20"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </>
          )}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="ml-auto rounded-full border border-white/10 bg-surface px-3 py-1.5 text-xs outline-none focus:border-accent"
            aria-label="Ordenar resultados"
          >
            <option value="relevance">Relevância</option>
            <option value="az">A–Z</option>
          </select>
        </div>
      )}

      {q.trim().length < 2 && (
        <p className="px-1 py-10 text-center text-sm text-zinc-500">
          Digite ao menos 2 letras para buscar.
        </p>
      )}

      {q.trim().length >= 2 && loading && (
        <div className="space-y-6">
          <BandGridSkeleton count={4} />
          <TrackListSkeleton count={5} />
        </div>
      )}

      {q.trim().length >= 2 && !loading && !hasResults && (
        <p className="px-1 py-10 text-center text-sm text-zinc-500">
          Nada encontrado para “{q.trim()}”.
        </p>
      )}

      {view && view.bands.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Bandas</h2>
          <BandGrid
            bands={view.bands}
            selectedId={null}
            onOpen={onOpenBand}
            onPlay={onPlayBand}
            onDelete={onDeleteBand}
          />
        </section>
      )}

      {view && view.tracks.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Faixas</h2>
          <div className="overflow-hidden rounded-2xl border border-white/5 bg-surface/40 p-2">
            <TrackList
              tracks={view.tracks}
              currentTrackId={currentTrackId}
              isPlaying={isPlaying}
              onSelect={(i) => onPlayTracks(view.tracks, i)}
              onToggleFavorite={onToggleFavorite}
              onAddToPlaylist={onAddToPlaylist}
            />
          </div>
        </section>
      )}
    </div>
  );
}
