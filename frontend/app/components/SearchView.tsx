"use client";

import { useEffect, useRef, useState } from "react";
import { searchAll, type BandSummary, type SearchResult, type Track } from "../lib/api";
import BandGrid from "./BandGrid";
import TrackList from "./TrackList";
import { SearchIcon } from "./icons";

interface Props {
  onOpenBand: (band: BandSummary) => void;
  onPlayBand: (band: BandSummary) => void;
  onDeleteBand: (band: BandSummary) => void;
  /** Toca a lista de faixas-resultado a partir do índice clicado. */
  onPlayTracks: (tracks: Track[], index: number) => void;
  currentTrackId: number | null;
  isPlaying: boolean;
  onToggleFavorite?: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
}

export default function SearchView({
  onOpenBand,
  onPlayBand,
  onDeleteBand,
  onPlayTracks,
  currentTrackId,
  isPlaying,
  onToggleFavorite,
  onAddToPlaylist,
}: Props) {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);

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
        const r = await searchAll(term);
        if (gen === genRef.current) setResult(r);
      } catch {
        if (gen === genRef.current) setResult({ bands: [], tracks: [] });
      } finally {
        if (gen === genRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const hasResults =
    result != null && (result.bands.length > 0 || result.tracks.length > 0);

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

      {q.trim().length < 2 && (
        <p className="px-1 py-10 text-center text-sm text-zinc-500">
          Digite ao menos 2 letras para buscar.
        </p>
      )}

      {q.trim().length >= 2 && !loading && !hasResults && (
        <p className="px-1 py-10 text-center text-sm text-zinc-500">
          Nada encontrado para “{q.trim()}”.
        </p>
      )}

      {result && result.bands.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">Bandas</h2>
          <BandGrid
            bands={result.bands}
            selectedId={null}
            onOpen={onOpenBand}
            onPlay={onPlayBand}
            onDelete={onDeleteBand}
          />
        </section>
      )}

      {result && result.tracks.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold">Faixas</h2>
          <div className="overflow-hidden rounded-2xl border border-white/5 bg-surface/40 p-2">
            <TrackList
              tracks={result.tracks}
              currentTrackId={currentTrackId}
              isPlaying={isPlaying}
              onSelect={(i) => onPlayTracks(result.tracks, i)}
              onToggleFavorite={onToggleFavorite}
              onAddToPlaylist={onAddToPlaylist}
            />
          </div>
        </section>
      )}
    </div>
  );
}
