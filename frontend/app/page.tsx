"use client";

import { useCallback, useEffect, useState } from "react";
import AddToPlaylistModal from "./components/AddToPlaylistModal";
import AdminPanel from "./components/AdminPanel";
import ProfileModal from "./components/ProfileModal";
import BandCategories from "./components/BandCategories";
import BandGrid from "./components/BandGrid";
import LoginScreen from "./components/LoginScreen";
import MobileNav from "./components/MobileNav";
import PlayerBar from "./components/PlayerBar";
import PlaylistsBar from "./components/PlaylistsBar";
import QueuePanel from "./components/QueuePanel";
import SearchView from "./components/SearchView";
import ShareModal from "./components/ShareModal";
import Sidebar, { type Tab } from "./components/Sidebar";
import TrackList from "./components/TrackList";
import UploadModal from "./components/UploadModal";
import UpgradeModal from "./components/UpgradeModal";
import { EditIcon, MusicIcon, PlayIcon, UploadIcon } from "./components/icons";
import {
  addToPlaylist,
  avatarUrl,
  coverUrl,
  createPlaylist,
  deleteArchive,
  deletePlaylist,
  fetchBands,
  fetchBandTracks,
  fetchCategories,
  fetchFavorites,
  fetchPlaylists,
  fetchPlaylistTracks,
  fetchRecent,
  fetchSharedPlaylists,
  removeFromPlaylist,
  renameBand,
  renameTrack,
  reorderPlaylist,
  setBandCategories,
  toggleFavorite,
  type BandSummary,
  type Category,
  type PlaylistSummary,
  type QuotaExceeded,
  type Track,
  type UploadResult,
} from "./lib/api";
import { useAuth } from "./lib/auth-context";
import {
  clearPlayerState,
  loadPlayerState,
  savePlayerState,
} from "./lib/player-storage";

// Identifica a "view" de faixas aberta: uma banda, uma playlist ou as curtidas.
type View =
  | { kind: "band"; band: BandSummary }
  | { kind: "playlist"; playlist: PlaylistSummary; readOnly?: boolean }
  | { kind: "favorites" }
  | null;

export default function Home() {
  const { me, loading, logout, refresh } = useAuth();

  const [bands, setBands] = useState<BandSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategory, setFilterCategory] = useState<number | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [sharedPlaylists, setSharedPlaylists] = useState<PlaylistSummary[]>([]);
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
  // Tempo a retomar na faixa restaurada do localStorage (consumido 1x).
  const [resumeTime, setResumeTime] = useState(0);
  const restoredRef = useState(() => ({ done: false }))[0];
  // Posição atual reportada pelo player (para persistir).
  const currentTimeRef = useState(() => ({ t: 0 }))[0];

  const [showAdmin, setShowAdmin] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<QuotaExceeded | null>(null);
  const [addTrack, setAddTrack] = useState<Track | null>(null);
  const [shareTarget, setShareTarget] = useState<PlaylistSummary | null>(null);

  const loadBands = useCallback(async () => {
    try {
      setBands(await fetchBands(filterCategory));
    } catch {
      /* ignore */
    }
  }, [filterCategory]);
  const loadCategories = useCallback(async () => {
    try {
      setCategories(await fetchCategories());
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
  const loadShared = useCallback(async () => {
    try {
      setSharedPlaylists(await fetchSharedPlaylists());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (me) {
      loadBands();
      loadCategories();
      loadPlaylists();
      loadFavCount();
      loadRecent();
      loadShared();
    }
  }, [me, loadBands, loadCategories, loadPlaylists, loadFavCount, loadRecent, loadShared]);

  // Restaura a fila/posição salva ao abrir (uma vez, com play PAUSADO).
  useEffect(() => {
    if (!me || restoredRef.done) return;
    restoredRef.done = true;
    const saved = loadPlayerState();
    if (saved && saved.queue.length > 0 && saved.currentIndex != null) {
      setQueue(saved.queue);
      setCurrentIndex(saved.currentIndex);
      setShuffle(saved.shuffle);
      setRepeat(saved.repeat);
      setResumeTime(saved.currentTime || 0);
      setIsPlaying(false); // browsers bloqueiam autoplay; usuário dá play
    }
  }, [me, restoredRef]);

  // Persiste o estado do player sempre que a fila/índice/modo mudam.
  useEffect(() => {
    if (!me) return;
    if (queue.length === 0 || currentIndex == null) {
      clearPlayerState();
      return;
    }
    savePlayerState({
      queue,
      currentIndex,
      shuffle,
      repeat,
      currentTime: currentTimeRef.t,
    });
  }, [me, queue, currentIndex, shuffle, repeat, currentTimeRef]);

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

  // Playlist compartilhada comigo (somente leitura).
  const openShared = useCallback(async (playlist: PlaylistSummary): Promise<Track[]> => {
    setView({ kind: "playlist", playlist, readOnly: true });
    try {
      const t = await fetchPlaylistTracks(playlist.id);
      setViewTracks(t);
      return t;
    } catch {
      setViewTracks([]);
      return [];
    }
  }, []);

  // ---- Renomear (dono/admin) ----
  async function onRenameTrack(track: Track) {
    const name = prompt("Novo nome da faixa:", track.display_name);
    if (name == null || !name.trim()) return;
    try {
      const updated = await renameTrack(track.id, name.trim());
      setViewTracks((ts) =>
        ts.map((t) =>
          t.id === track.id ? { ...t, display_name: updated.display_name } : t,
        ),
      );
    } catch {
      alert("Falha ao renomear.");
    }
  }

  async function onRenameBand(band: BandSummary) {
    const name = prompt("Novo nome da banda:", band.name);
    if (name == null || !name.trim()) return;
    try {
      await renameBand(band.id, name.trim());
      loadBands();
      loadRecent();
      setView((v) =>
        v && v.kind === "band" && v.band.id === band.id
          ? { kind: "band", band: { ...v.band, name: name.trim() } }
          : v,
      );
    } catch {
      alert("Falha ao renomear.");
    }
  }

  // ---- Reprodução ----
  function startQueue(list: Track[], index: number) {
    setQueue(list);
    setCurrentIndex(index);
    setIsPlaying(true);
  }

  // Atualiza as categorias de um CD no estado local (após editar no hero).
  function onBandCategoriesChange(bandId: number, cats: Category[]) {
    setView((v) =>
      v && v.kind === "band" && v.band.id === bandId
        ? { ...v, band: { ...v.band, categories: cats } }
        : v,
    );
    setBands((bs) =>
      bs.map((b) => (b.id === bandId ? { ...b, categories: cats } : b)),
    );
  }

  // Limpa a fila e o estado persistido (botão vassoura).
  function clearQueue() {
    setQueue([]);
    setCurrentIndex(null);
    setIsPlaying(false);
    clearPlayerState();
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

  // Playlist compartilhada comigo é somente leitura (não sou o dono).
  const readOnly = view?.kind === "playlist" && view.readOnly === true;
  const sharedOwner =
    view?.kind === "playlist" && view.readOnly ? view.playlist.owner_email : null;

  // Painel de detalhe (banda / playlist / curtidas).
  const detail = view && (
    <section className="overflow-hidden rounded-2xl border border-white/5 bg-surface/40 shadow-xl backdrop-blur">
      {view.kind === "band" ? (
        /* ----- Hero do CD (capa grande + perfil de quem postou) ----- */
        <div className="relative border-b border-white/5">
          {/* fundo desfocado com a própria capa */}
          {view.band.has_cover && (
            <div
              className="absolute inset-0 -z-0 bg-cover bg-center opacity-30 blur-2xl"
              style={{ backgroundImage: `url(${coverUrl(view.band.id)})` }}
            />
          )}
          <div className="relative z-10 flex flex-col gap-4 p-5 sm:flex-row sm:items-end">
            <button
              onClick={() => setView(null)}
              className="absolute left-4 top-4 rounded-full bg-black/40 px-3 py-1.5 text-xs font-medium backdrop-blur hover:bg-black/60"
            >
              ← Voltar
            </button>
            {/* Capa grande */}
            <div className="mx-auto mt-8 flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10 shadow-2xl shadow-black/50 sm:mx-0 sm:mt-0 sm:h-48 sm:w-48">
              {view.band.has_cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverUrl(view.band.id)} alt="" className="h-full w-full object-cover" />
              ) : (
                <MusicIcon className="h-16 w-16 text-white/80" />
              )}
            </div>
            {/* Infos */}
            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-300">CD</p>
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <h3 className="truncate text-2xl font-black sm:text-4xl">{viewTitle}</h3>
                <button
                  onClick={() => onRenameBand(view.band)}
                  className="shrink-0 text-zinc-400 hover:text-white"
                  aria-label="Renomear banda"
                  title="Renomear banda"
                >
                  <EditIcon className="h-4 w-4" />
                </button>
              </div>
              {/* Perfil de quem postou */}
              {view.band.owner_name && (
                <div className="mt-2 flex items-center justify-center gap-2 sm:justify-start">
                  <span className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-indigo-600 text-[9px] font-black">
                    {view.band.owner_has_avatar && view.band.owner_id ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl(view.band.owner_id)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      view.band.owner_name.slice(0, 2).toUpperCase()
                    )}
                  </span>
                  <span className="truncate text-sm font-medium text-zinc-200">
                    {view.band.owner_name}
                  </span>
                </div>
              )}
              <p className="mt-1 text-xs text-zinc-400">{viewTracks.length} faixas</p>
              <BandCategories
                bandId={view.band.id}
                current={view.band.categories}
                all={categories}
                isAdmin={me.is_admin}
                onChange={(cats) => onBandCategoriesChange(view.band.id, cats)}
              />
              <button
                onClick={() => viewTracks.length > 0 && startQueue(viewTracks, 0)}
                disabled={viewTracks.length === 0}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-black transition-transform hover:scale-105 disabled:opacity-40"
              >
                <PlayIcon className="h-4 w-4" /> Tocar
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ----- Header compacto (playlist / curtidas) ----- */
        <div className="flex items-center gap-4 border-b border-white/5 px-4 py-4 sm:px-5">
          <button
            onClick={() => setView(null)}
            className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
          >
            ← Voltar
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold">{viewTitle}</h3>
            <p className="text-xs text-zinc-400">
              {viewTracks.length} faixas
              {sharedOwner && <span> · compartilhada por {sharedOwner}</span>}
            </p>
          </div>
          <button
            onClick={() => viewTracks.length > 0 && startQueue(viewTracks, 0)}
            disabled={viewTracks.length === 0}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition-transform hover:scale-105 disabled:opacity-40"
          >
            <PlayIcon className="h-4 w-4" /> Tocar
          </button>
        </div>
      )}
      <div className="scroll-area max-h-[60vh] overflow-y-auto p-2">
        <TrackList
          tracks={viewTracks}
          currentTrackId={currentTrack?.id ?? null}
          isPlaying={isPlaying}
          onSelect={playFromView}
          onToggleFavorite={readOnly ? undefined : onToggleFav}
          onAddToPlaylist={readOnly ? undefined : (t) => setAddTrack(t)}
          onPlayNext={onPlayNext}
          onRename={readOnly ? undefined : onRenameTrack}
          onRemove={
            view.kind === "playlist" && !readOnly ? onRemoveFromPlaylist : undefined
          }
          onReorder={
            view.kind === "playlist" && !readOnly ? onReorderPlaylist : undefined
          }
        />
      </div>
    </section>
  );

  // Conteúdo por aba (quando não há detalhe aberto).
  const collection = (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Sua coleção</h2>
      {/* Chips de filtro por categoria */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCategory(null)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filterCategory === null ? "bg-accent text-black" : "bg-white/10 hover:bg-white/20"
            }`}
          >
            Todos
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilterCategory(c.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                filterCategory === c.id ? "bg-accent text-black" : "bg-white/10 hover:bg-white/20"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {bands.length > 0 ? (
        <BandGrid
          bands={bands}
          selectedId={null}
          onOpen={openBand}
          onPlay={(b) => playFrom(() => openBand(b))}
          onDelete={onDeleteBand}
        />
      ) : me.can_upload ? (
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
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
          <p className="text-sm text-zinc-300">
            {me.plan_name
              ? "Seu plano ainda não tem CDs liberados."
              : "Você ainda não tem um plano."}
          </p>
          <p className="mt-1 text-xs text-zinc-500">Fale com o administrador para liberar músicas.</p>
          {me.admin_whatsapp && (
            <a
              href={`https://wa.me/${me.admin_whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-5 py-2 text-sm font-semibold text-black"
            >
              💬 Falar no WhatsApp
            </a>
          )}
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
          sharedPlaylists={sharedPlaylists}
          favCount={favCount}
          activeKey={activeKey}
          onOpenFavorites={() => playFrom(openFavorites)}
          onOpenPlaylist={(pl) => playFrom(() => openPlaylist(pl))}
          onOpenShared={(pl) => playFrom(() => openShared(pl))}
          onShare={(pl) => setShareTarget(pl)}
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
        sharedPlaylists={sharedPlaylists}
        favCount={favCount}
        activeKey={activeKey}
        onOpenFavorites={() => playFrom(openFavorites)}
        onOpenPlaylist={(pl) => playFrom(() => openPlaylist(pl))}
        onOpenShared={(pl) => playFrom(() => openShared(pl))}
        onShare={(pl) => setShareTarget(pl)}
        onCreate={onCreatePlaylist}
        onDelete={onDeletePlaylist}
        onUpload={() => setShowUpload(true)}
        onAdmin={() => setShowAdmin(true)}
        onProfile={() => setShowProfile(true)}
        onLogout={logout}
      />

      <main className="min-w-0 flex-1 pb-44 lg:pb-28">
        {/* Header mobile (a sidebar cobre o desktop). */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/5 bg-base/80 px-4 py-3 backdrop-blur lg:hidden">
          <h1 className="font-display text-lg font-black uppercase leading-none tracking-tight">
            Toque <span className="text-accent">Agora</span>
          </h1>
          <div className="flex items-center gap-2">
            {me.can_upload && (
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
              >
                <UploadIcon className="h-3.5 w-3.5" /> Enviar
              </button>
            )}
            {me.is_admin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
              >
                Admin
              </button>
            )}
            <button
              onClick={() => setShowProfile(true)}
              className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-indigo-600 text-[10px] font-black"
              title="Meu perfil"
              aria-label="Meu perfil"
            >
              {me.has_avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl(me.id)} alt="" className="h-full w-full object-cover" />
              ) : (
                (me.display_name || me.email).slice(0, 2).toUpperCase()
              )}
            </button>
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
        onClearQueue={clearQueue}
        hasNext={queue.length > 0}
        hasPrev={queue.length > 0}
        resumeTime={resumeTime}
        onTime={(t) => {
          currentTimeRef.t = t;
          // Atualiza o currentTime salvo sem recriar todo o estado.
          if (queue.length > 0 && currentIndex != null) {
            savePlayerState({ queue, currentIndex, shuffle, repeat, currentTime: t });
          }
        }}
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
      {shareTarget && (
        <ShareModal
          playlist={shareTarget}
          onClose={() => setShareTarget(null)}
          onChanged={() => {
            loadPlaylists();
            loadShared();
          }}
        />
      )}
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
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
