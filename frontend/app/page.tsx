"use client";

import { useCallback, useEffect, useState } from "react";
import AdminPanel from "./components/AdminPanel";
import AddToPlaylistModal from "./components/AddToPlaylistModal";
import BandGrid from "./components/BandGrid";
import LoginScreen from "./components/LoginScreen";
import PlayerBar from "./components/PlayerBar";
import PlaylistsBar from "./components/PlaylistsBar";
import QuotaBar from "./components/QuotaBar";
import TrackList from "./components/TrackList";
import UpgradeModal from "./components/UpgradeModal";
import Uploader from "./components/Uploader";
import { PlayIcon } from "./components/icons";
import {
  addToPlaylist,
  createPlaylist,
  deleteArchive,
  deletePlaylist,
  fetchBands,
  fetchBandTracks,
  fetchFavorites,
  fetchPlaylists,
  fetchPlaylistTracks,
  removeFromPlaylist,
  reorderPlaylist,
  toggleFavorite,
  type BandSummary,
  type PlaylistSummary,
  type QuotaExceeded,
  type Track,
  type UploadResult,
} from "./lib/api";
import { useAuth } from "./lib/auth-context";

// Identifica a "view" de faixas aberta: uma banda, uma playlist ou as curtidas.
type View =
  | { kind: "band"; band: BandSummary }
  | { kind: "playlist"; playlist: PlaylistSummary }
  | { kind: "favorites" }
  | null;

export default function Home() {
  const { me, loading, logout, refresh } = useAuth();

  const [bands, setBands] = useState<BandSummary[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [favCount, setFavCount] = useState(0);
  const [view, setView] = useState<View>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<QuotaExceeded | null>(null);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");
  const [addTrack, setAddTrack] = useState<Track | null>(null);

  const loadBands = useCallback(async () => {
    try {
      setBands(await fetchBands());
    } catch {
      /* ignore */
    }
  }, []);
  const loadPlaylists = useCallback(async () => {
    try {
      setPlaylists(await fetchPlaylists());
    } catch {
      /* ignore */
    }
  }, []);
  const loadFavCount = useCallback(async () => {
    try {
      setFavCount((await fetchFavorites()).length);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (me) {
      loadBands();
      loadPlaylists();
      loadFavCount();
    }
  }, [me, loadBands, loadPlaylists, loadFavCount]);

  // ---- Abrir views (banda / playlist / favoritos) ----
  const openBand = useCallback(async (band: BandSummary): Promise<Track[]> => {
    setView({ kind: "band", band });
    try {
      const t = await fetchBandTracks(band.id);
      setTracks(t);
      return t;
    } catch {
      setTracks([]);
      return [];
    }
  }, []);

  const openPlaylist = useCallback(async (playlist: PlaylistSummary): Promise<Track[]> => {
    setView({ kind: "playlist", playlist });
    try {
      const t = await fetchPlaylistTracks(playlist.id);
      setTracks(t);
      return t;
    } catch {
      setTracks([]);
      return [];
    }
  }, []);

  const openFavorites = useCallback(async (): Promise<Track[]> => {
    setView({ kind: "favorites" });
    try {
      const t = await fetchFavorites();
      setTracks(t);
      return t;
    } catch {
      setTracks([]);
      return [];
    }
  }, []);

  function onUploaded(result: UploadResult) {
    loadBands();
    refresh();
    const first = result.bands[0];
    if (first) openBand(first);
  }

  async function playFrom(open: () => Promise<Track[]>) {
    const t = await open();
    if (t.length > 0) {
      setCurrentIndex(0);
      setIsPlaying(true);
    }
  }

  async function onDeleteBand(band: BandSummary) {
    if (
      !confirm(
        `Excluir o arquivo de "${band.name}" para sempre? Todas as bandas do mesmo arquivo serão removidas e o arquivo apagado do disco.`,
      )
    )
      return;
    try {
      await deleteArchive(band.archive_id);
    } catch {
      alert("Falha ao excluir.");
      return;
    }
    if (view?.kind === "band" && view.band.archive_id === band.archive_id) {
      setView(null);
      setTracks([]);
      setCurrentIndex(null);
      setIsPlaying(false);
    }
    loadBands();
    refresh();
  }

  function playIndex(index: number) {
    if (index === currentIndex) setIsPlaying((p) => !p);
    else {
      setCurrentIndex(index);
      setIsPlaying(true);
    }
  }

  function goNext(auto = false) {
    if (currentIndex == null || tracks.length === 0) return;
    if (auto && repeat === "one") {
      setIsPlaying(true);
      return;
    }
    let next: number;
    if (shuffle && tracks.length > 1) {
      do {
        next = Math.floor(Math.random() * tracks.length);
      } while (next === currentIndex);
    } else {
      next = currentIndex + 1;
      if (next >= tracks.length) {
        if (repeat === "all") next = 0;
        else {
          setIsPlaying(false);
          return;
        }
      }
    }
    setCurrentIndex(next);
    setIsPlaying(true);
  }

  function goPrev() {
    if (currentIndex == null) return;
    if (shuffle && tracks.length > 1) return goNext();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsPlaying(true);
    }
  }

  // ---- Curtir / playlist ----
  async function onToggleFav(track: Track) {
    const nowFav = !track.is_favorite;
    setTracks((ts) =>
      ts.map((t) => (t.id === track.id ? { ...t, is_favorite: nowFav } : t)),
    );
    try {
      await toggleFavorite(track.id, nowFav);
      loadFavCount();
      if (view?.kind === "favorites" && !nowFav) {
        // descurtiu dentro de Curtidas → some da lista
        setTracks((ts) => ts.filter((t) => t.id !== track.id));
      }
    } catch {
      // reverte em caso de erro
      setTracks((ts) =>
        ts.map((t) => (t.id === track.id ? { ...t, is_favorite: !nowFav } : t)),
      );
    }
  }

  async function onAddTrackToPlaylist(playlistId: number) {
    if (!addTrack) return;
    try {
      await addToPlaylist(playlistId, addTrack.id);
      loadPlaylists();
    } catch {
      alert("Falha ao adicionar.");
    }
    setAddTrack(null);
  }

  async function onRemoveFromPlaylist(track: Track) {
    if (view?.kind !== "playlist") return;
    await removeFromPlaylist(view.playlist.id, track.id);
    setTracks((ts) => ts.filter((t) => t.id !== track.id));
    loadPlaylists();
  }

  async function onReorderPlaylist(newOrder: Track[]) {
    if (view?.kind !== "playlist") return;
    // Mantém a faixa tocando apontando para o mesmo id após a reordenação.
    const playingId = currentTrack?.id ?? null;
    setTracks(newOrder);
    if (playingId != null) {
      const idx = newOrder.findIndex((t) => t.id === playingId);
      if (idx >= 0) setCurrentIndex(idx);
    }
    try {
      await reorderPlaylist(view.playlist.id, newOrder.map((t) => t.id));
    } catch {
      /* a ordem visual já mudou; recarrega em caso de erro */
      openPlaylist(view.playlist);
    }
  }

  async function onCreatePlaylist(name: string) {
    await createPlaylist(name);
    loadPlaylists();
  }
  async function onDeletePlaylist(pl: PlaylistSummary) {
    if (!confirm(`Excluir a playlist "${pl.name}"?`)) return;
    await deletePlaylist(pl.id);
    if (view?.kind === "playlist" && view.playlist.id === pl.id) {
      setView(null);
      setTracks([]);
    }
    loadPlaylists();
  }

  // ----- Guards -----
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-500">
        Carregando…
      </main>
    );
  }
  if (!me) return <LoginScreen />;

  const currentTrack = currentIndex != null ? tracks[currentIndex] ?? null : null;
  // Banda corrente da faixa tocando (para capa). Em playlist/favoritos, deriva do band_id.
  const currentBand =
    currentTrack != null
      ? bands.find((b) => b.id === currentTrack.band_id) ?? null
      : null;

  const viewTitle =
    view?.kind === "band"
      ? view.band.name
      : view?.kind === "playlist"
        ? view.playlist.name
        : view?.kind === "favorites"
          ? "Curtidas"
          : "";

  const activeKey =
    view?.kind === "favorites"
      ? "fav"
      : view?.kind === "playlist"
        ? `pl:${view.playlist.id}`
        : null;

  return (
    <main className="min-h-screen pb-36">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-base/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-lg font-black uppercase leading-none tracking-tight sm:text-xl">
              Toque <span className="text-accent">Agora</span>
            </h1>
            <p className="hidden text-xs text-zinc-500 sm:block">A sua Playlist preferida</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block">
              <QuotaBar me={me} />
            </div>
            {me.is_admin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
              >
                Admin
              </button>
            )}
            <button
              onClick={logout}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
              title={me.email}
            >
              Sair
            </button>
          </div>
        </div>
        <div className="mx-auto mt-2 flex max-w-5xl justify-center sm:hidden">
          <QuotaBar me={me} />
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-7 px-4 py-6 sm:px-6">
        <section>
          <Uploader onUploaded={onUploaded} onQuotaExceeded={setQuotaInfo} />
        </section>

        <PlaylistsBar
          playlists={playlists}
          favCount={favCount}
          activeKey={activeKey}
          onOpenFavorites={() => playFrom(openFavorites)}
          onOpenPlaylist={(pl) => playFrom(() => openPlaylist(pl))}
          onCreate={onCreatePlaylist}
          onDelete={onDeletePlaylist}
        />

        {bands.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Sua coleção</h2>
            <BandGrid
              bands={bands}
              selectedId={view?.kind === "band" ? view.band.id : null}
              onOpen={openBand}
              onPlay={(b) => playFrom(() => openBand(b))}
              onDelete={onDeleteBand}
            />
          </section>
        )}

        {view && (
          <section className="overflow-hidden rounded-2xl border border-white/5 bg-surface/40 shadow-xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h3 className="truncate font-bold">{viewTitle}</h3>
                <p className="text-xs text-zinc-400">{tracks.length} faixas</p>
              </div>
              <button
                onClick={() => {
                  if (tracks.length > 0) {
                    setCurrentIndex(0);
                    setIsPlaying(true);
                  }
                }}
                disabled={tracks.length === 0}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition-transform hover:scale-105 disabled:opacity-40"
              >
                <PlayIcon className="h-4 w-4" /> Tocar
              </button>
            </div>
            <div className="scroll-area max-h-[55vh] overflow-y-auto p-2">
              <TrackList
                tracks={tracks}
                currentTrackId={currentTrack?.id ?? null}
                isPlaying={isPlaying}
                onSelect={playIndex}
                onToggleFavorite={onToggleFav}
                onAddToPlaylist={(t) => setAddTrack(t)}
                onRemove={view.kind === "playlist" ? onRemoveFromPlaylist : undefined}
                onReorder={view.kind === "playlist" ? onReorderPlaylist : undefined}
              />
            </div>
          </section>
        )}
      </div>

      <PlayerBar
        track={currentTrack}
        bandName={currentBand?.name ?? viewTitle ?? null}
        bandId={currentBand?.id ?? null}
        hasCover={currentBand?.has_cover ?? false}
        isPlaying={isPlaying}
        shuffle={shuffle}
        repeat={repeat}
        onToggleShuffle={() => setShuffle((s) => !s)}
        onCycleRepeat={() =>
          setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"))
        }
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onNext={() => goNext(false)}
        onPrev={goPrev}
        onEnded={() => goNext(true)}
        hasNext={tracks.length > 0}
        hasPrev={tracks.length > 0}
      />

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {quotaInfo && (
        <UpgradeModal info={quotaInfo} email={me.email} onClose={() => setQuotaInfo(null)} />
      )}
      {addTrack && (
        <AddToPlaylistModal
          track={addTrack}
          playlists={playlists}
          onAdd={onAddTrackToPlaylist}
          onCreate={async (name) => {
            const pl = await createPlaylist(name);
            loadPlaylists();
            return pl.id;
          }}
          onClose={() => setAddTrack(null)}
        />
      )}
    </main>
  );
}
