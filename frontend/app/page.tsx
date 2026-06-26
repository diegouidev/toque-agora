"use client";

import { useCallback, useEffect, useState } from "react";
import AddToPlaylistModal from "./components/AddToPlaylistModal";
import AdminPanel from "./components/AdminPanel";
import BandGrid from "./components/BandGrid";
import LoginScreen from "./components/LoginScreen";
import MobileNav from "./components/MobileNav";
import PlayerBar from "./components/PlayerBar";
import PlaylistsBar from "./components/PlaylistsBar";
import QueuePanel from "./components/QueuePanel";
import SearchView from "./components/SearchView";
import Sidebar, { type Tab } from "./components/Sidebar";
import TrackList from "./components/TrackList";
import UploadModal from "./components/UploadModal";
import UpgradeModal from "./components/UpgradeModal";
import { MusicIcon, PlayIcon, UploadIcon } from "./components/icons";
import {
  addToPlaylist,
  coverUrl,
  createPlaylist,
  deleteArchive,
  deletePlaylist,
  fetchBands,
  fetchBandTracks,
  fetchFavorites,
  fetchPlaylists,
  fetchPlaylistTracks,
  fetchRecent,
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
  const [recent, setRecent] = useState<BandSummary[]>([]);

  const [tab, setTab] = useState<Tab>("home");
  const [view, setView] = useState<View>(null);
  const [viewTracks, setViewTracks] = useState<Track[]>([]);

  // Fila de reprodução (independente da lista exibida na view).
  const [queue, setQueue] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");

  const [showAdmin, setShowAdmin] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<QuotaExceeded | null>(null);
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
  const loadRecent = useCallback(async () => {
    try {
      setRecent(await fetchRecent());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (me) {
      loadBands();
      loadPlaylists();
      loadFavCount();
      loadRecent();
    }
  }, [me, loadBands, loadPlaylists, loadFavCount, loadRecent]);

  // ---- Abrir views (apenas navegação/browse; não mexe na fila) ----
  const openBand = useCallback(async (band: BandSummary): Promise<Track[]> => {
    setView({ kind: "band", band });
    try {
      const t = await fetchBandTracks(band.id);
      setViewTracks(t);
      return t;
    } catch {
      setViewTracks([]);
      return [];
    }
  }, []);

  const openPlaylist = useCallback(async (playlist: PlaylistSummary): Promise<Track[]> => {
    setView({ kind: "playlist", playlist });
    try {
      const t = await fetchPlaylistTracks(playlist.id);
      setViewTracks(t);
      return t;
    } catch {
      setViewTracks([]);
      return [];
    }
  }, []);

  const openFavorites = useCallback(async (): Promise<Track[]> => {
    setView({ kind: "favorites" });
    try {
      const t = await fetchFavorites();
      setViewTracks(t);
      return t;
    } catch {
      setViewTracks([]);
      return [];
    }
  }, []);

  // ---- Reprodução ----
  function startQueue(list: Track[], index: number) {
    setQueue(list);
    setCurrentIndex(index);
    setIsPlaying(true);
  }

  async function playFrom(open: () => Promise<Track[]>) {
    const t = await open();
    if (t.length > 0) startQueue(t, 0);
  }

  // Clique numa faixa da view em exibição.
  function playFromView(index: number) {
    const t = viewTracks[index];
    if (!t) return;
    if (currentTrack?.id === t.id) setIsPlaying((p) => !p);
    else startQueue(viewTracks, index);
  }

  function onUploaded(result: UploadResult) {
    loadBands();
    refresh();
    setShowUpload(false);
    const first = result.bands[0];
    if (first) {
      setTab("library");
      openBand(first);
    }
  }

  function onTab(next: Tab) {
    setTab(next);
    setView(null);
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
      setViewTracks([]);
    }
    if (currentBand?.archive_id === band.archive_id) {
      setQueue([]);
      setCurrentIndex(null);
      setIsPlaying(false);
    }
    loadBands();
    loadRecent();
    refresh();
  }

  // ---- Navegação na fila ----
  function goNext(auto = false) {
    if (currentIndex == null || queue.length === 0) return;
    if (auto && repeat === "one") {
      setIsPlaying(true);
      return;
    }
    let next: number;
    if (shuffle && queue.length > 1) {
      do {
        next = Math.floor(Math.random() * queue.length);
      } while (next === currentIndex);
    } else {
      next = currentIndex + 1;
      if (next >= queue.length) {
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
    if (shuffle && queue.length > 1) return goNext();
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsPlaying(true);
    }
  }

  // ---- Fila (queue) ----
  function onPlayNext(track: Track) {
    if (currentIndex == null || queue.length === 0) {
      startQueue([track], 0);
      return;
    }
    const next = [...queue];
    next.splice(currentIndex + 1, 0, track);
    setQueue(next);
  }

  function onReorderUpcoming(newUpcoming: Track[]) {
    if (currentIndex == null) return;
    setQueue([...queue.slice(0, currentIndex + 1), ...newUpcoming]);
  }

  function onRemoveFromQueue(track: Track) {
    if (currentIndex == null) return;
    const head = queue.slice(0, currentIndex + 1);
    const upcoming = queue.slice(currentIndex + 1).filter((t) => t.id !== track.id);
    setQueue([...head, ...upcoming]);
  }

  function onSelectUpcoming(track: Track) {
    if (currentIndex == null) return;
    const idx = queue.findIndex((t, i) => i > currentIndex && t.id === track.id);
    if (idx >= 0) {
      setCurrentIndex(idx);
      setIsPlaying(true);
    }
  }

  // ---- Curtir / playlist (operam na lista exibida) ----
  async function onToggleFav(track: Track) {
    const nowFav = !track.is_favorite;
    setViewTracks((ts) =>
      ts.map((t) => (t.id === track.id ? { ...t, is_favorite: nowFav } : t)),
    );
    try {
      await toggleFavorite(track.id, nowFav);
      loadFavCount();
      if (view?.kind === "favorites" && !nowFav) {
        setViewTracks((ts) => ts.filter((t) => t.id !== track.id));
      }
    } catch {
      setViewTracks((ts) =>
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
    setViewTracks((ts) => ts.filter((t) => t.id !== track.id));
    loadPlaylists();
  }

  async function onReorderPlaylist(newOrder: Track[]) {
    if (view?.kind !== "playlist") return;
    setViewTracks(newOrder);
    try {
      await reorderPlaylist(view.playlist.id, newOrder.map((t) => t.id));
    } catch {
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
      setViewTracks([]);
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

  const currentTrack = currentIndex != null ? queue[currentIndex] ?? null : null;
  const currentBand =
    currentTrack != null
      ? bands.find((b) => b.id === currentTrack.band_id) ?? null
      : null;
  const upcoming = currentIndex != null ? queue.slice(currentIndex + 1) : [];

  const viewTitle =
    view?.kind === "band"
      ? view.band.name
      : view?.kind === "playlist"
        ? view.playlist.name
        : view?.kind === "favorites"
          ? "Curtidas"
          : "";

  const activeKey = !view
    ? null
    : view.kind === "favorites"
      ? "fav"
      : view.kind === "playlist"
        ? `pl:${view.playlist.id}`
        : null;

  // Painel de detalhe (banda / playlist / curtidas).
  const detail = view && (
    <section className="overflow-hidden rounded-2xl border border-white/5 bg-surface/40 shadow-xl backdrop-blur">
      <div className="flex items-center gap-4 border-b border-white/5 px-4 py-4 sm:px-5">
        <button
          onClick={() => setView(null)}
          className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
        >
          ← Voltar
        </button>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/10">
          {view.kind === "band" && view.band.has_cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl(view.band.id)}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <MusicIcon className="h-6 w-6 text-white/80" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold">{viewTitle}</h3>
          <p className="text-xs text-zinc-400">{viewTracks.length} faixas</p>
        </div>
        <button
          onClick={() => viewTracks.length > 0 && startQueue(viewTracks, 0)}
          disabled={viewTracks.length === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition-transform hover:scale-105 disabled:opacity-40"
        >
          <PlayIcon className="h-4 w-4" /> Tocar
        </button>
      </div>
      <div className="scroll-area max-h-[60vh] overflow-y-auto p-2">
        <TrackList
          tracks={viewTracks}
          currentTrackId={currentTrack?.id ?? null}
          isPlaying={isPlaying}
          onSelect={playFromView}
          onToggleFavorite={onToggleFav}
          onAddToPlaylist={(t) => setAddTrack(t)}
          onPlayNext={onPlayNext}
          onRemove={view.kind === "playlist" ? onRemoveFromPlaylist : undefined}
          onReorder={view.kind === "playlist" ? onReorderPlaylist : undefined}
        />
      </div>
    </section>
  );

  // Conteúdo por aba (quando não há detalhe aberto).
  const collection = (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Sua coleção</h2>
      {bands.length > 0 ? (
        <BandGrid
          bands={bands}
          selectedId={null}
          onOpen={openBand}
          onPlay={(b) => playFrom(() => openBand(b))}
          onDelete={onDeleteBand}
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
          <p className="text-sm text-zinc-400">
            Sua coleção está vazia. Envie um <span className="font-mono">.rar</span>/
            <span className="font-mono">.zip</span> para começar.
          </p>
          <button
            onClick={() => setShowUpload(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black"
          >
            <UploadIcon className="h-4 w-4" /> Enviar coleção
          </button>
        </div>
      )}
    </section>
  );

  const tabContent =
    tab === "search" ? (
      <SearchView
        onOpenBand={openBand}
        onPlayBand={(b) => playFrom(() => openBand(b))}
        onDeleteBand={onDeleteBand}
        onPlayTracks={(list, i) => startQueue(list, i)}
        currentTrackId={currentTrack?.id ?? null}
        isPlaying={isPlaying}
        onToggleFavorite={onToggleFav}
        onAddToPlaylist={(t) => setAddTrack(t)}
      />
    ) : tab === "library" ? (
      collection
    ) : (
      // home
      <div className="space-y-7">
        {recent.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Tocadas recentemente</h2>
            <BandGrid
              bands={recent}
              selectedId={null}
              onOpen={openBand}
              onPlay={(b) => playFrom(() => openBand(b))}
              onDelete={onDeleteBand}
            />
          </section>
        )}
        <PlaylistsBar
          playlists={playlists}
          favCount={favCount}
          activeKey={activeKey}
          onOpenFavorites={() => playFrom(openFavorites)}
          onOpenPlaylist={(pl) => playFrom(() => openPlaylist(pl))}
          onCreate={onCreatePlaylist}
          onDelete={onDeletePlaylist}
        />
        {recent.length === 0 && collection}
      </div>
    );

  return (
    <div className="flex min-h-screen">
      <Sidebar
        me={me}
        tab={tab}
        onTab={onTab}
        playlists={playlists}
        favCount={favCount}
        activeKey={activeKey}
        onOpenFavorites={() => playFrom(openFavorites)}
        onOpenPlaylist={(pl) => playFrom(() => openPlaylist(pl))}
        onCreate={onCreatePlaylist}
        onDelete={onDeletePlaylist}
        onUpload={() => setShowUpload(true)}
        onAdmin={() => setShowAdmin(true)}
        onLogout={logout}
      />

      <main className="min-w-0 flex-1 pb-44 lg:pb-28">
        {/* Header mobile (a sidebar cobre o desktop). */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/5 bg-base/80 px-4 py-3 backdrop-blur lg:hidden">
          <h1 className="font-display text-lg font-black uppercase leading-none tracking-tight">
            Toque <span className="text-accent">Agora</span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
            >
              <UploadIcon className="h-3.5 w-3.5" /> Enviar
            </button>
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
        </header>

        <div className="mx-auto max-w-5xl space-y-7 px-4 py-6 sm:px-6">
          {view ? detail : tabContent}
        </div>
      </main>

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
        onOpenQueue={() => setShowQueue(true)}
        hasNext={queue.length > 0}
        hasPrev={queue.length > 0}
      />

      <MobileNav tab={tab} onTab={onTab} />

      {showUpload && (
        <UploadModal
          onUploaded={onUploaded}
          onQuotaExceeded={(info) => {
            setShowUpload(false);
            setQuotaInfo(info);
          }}
          onClose={() => setShowUpload(false)}
        />
      )}
      {showQueue && (
        <QueuePanel
          current={currentTrack}
          bandName={currentBand?.name ?? null}
          isPlaying={isPlaying}
          upcoming={upcoming}
          onSelectUpcoming={onSelectUpcoming}
          onReorderUpcoming={onReorderUpcoming}
          onRemoveFromQueue={onRemoveFromQueue}
          onClose={() => setShowQueue(false)}
        />
      )}
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
    </div>
  );
}
