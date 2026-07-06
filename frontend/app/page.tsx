"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AddToPlaylistModal from "./components/AddToPlaylistModal";
import ProfileModal from "./components/ProfileModal";
import SubscribeView from "./components/SubscribeView";
import BandCategories from "./components/BandCategories";
import BandGrid from "./components/BandGrid";
import { BandGridSkeleton } from "./components/Skeleton";
import LandingView from "./components/LandingView";
import MobileNav from "./components/MobileNav";
import PlayerBar from "./components/PlayerBar";
import PlaylistsBar from "./components/PlaylistsBar";
import QueuePanel from "./components/QueuePanel";
import SearchView from "./components/SearchView";
import ShareModal from "./components/ShareModal";
import StatsModal from "./components/StatsModal";
import DownloadsView from "./components/DownloadsView";
import Sidebar, { type Tab } from "./components/Sidebar";
import TrackList from "./components/TrackList";
import UploadModal from "./components/UploadModal";
import UpgradeModal from "./components/UpgradeModal";
import {
  EditIcon,
  HeartIcon,
  MenuIcon,
  MusicIcon,
  PlayIcon,
  ShareIcon,
  UploadIcon,
} from "./components/icons";
import {
  addToPlaylist,
  avatarUrl,
  coverUrl,
  createPlaylist,
  deleteArchive,
  deletePlaylist,
  downloadUrl,
  fetchBands,
  fetchFavoriteCds,
  fetchNews,
  fetchRadio,
  fetchRecommendations,
  markNewsSeen,
  toggleCdFavorite,
  fetchBandTracks,
  fetchCategories,
  fetchFavorites,
  fetchPlaylists,
  fetchPlaylistTracks,
  fetchRecent,
  fetchSharedPlaylists,
  removeFromPlaylist,
  renameBand,
  renamePlaylist,
  renameTrack,
  setBandHidden,
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
import { useDownloads } from "./lib/downloads";
import { shareOrCopy } from "./lib/share";
import { useToast } from "./components/Toast";
import { useDialog } from "./components/Dialog";
import { totalDurationLabel } from "./lib/format";
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
  const { me, loading, logout, refresh, offline } = useAuth();
  const downloads = useDownloads();
  const toast = useToast();
  const dialog = useDialog();

  const [bands, setBands] = useState<BandSummary[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filterCategory, setFilterCategory] = useState<number | null>(null);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [sharedPlaylists, setSharedPlaylists] = useState<PlaylistSummary[]>([]);
  const [favCount, setFavCount] = useState(0);
  const [favCds, setFavCds] = useState<BandSummary[]>([]);
  const [recent, setRecent] = useState<BandSummary[]>([]);
  const [newsBands, setNewsBands] = useState<BandSummary[]>([]);
  const [newsSeen, setNewsSeen] = useState(false);
  const [recommended, setRecommended] = useState<BandSummary[]>([]);

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

  const router = useRouter();
  const [showProfile, setShowProfile] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showDownloads, setShowDownloads] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  // Categoria a pré-marcar no upload (null = upload genérico).
  const [uploadCategory, setUploadCategory] = useState<number | null>(null);
  const [showQueue, setShowQueue] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState<QuotaExceeded | null>(null);
  const [addTrack, setAddTrack] = useState<Track | null>(null);
  const [shareTarget, setShareTarget] = useState<PlaylistSummary | null>(null);

  const [bandsLoading, setBandsLoading] = useState(true);
  const [bandsError, setBandsError] = useState(false);
  const loadBands = useCallback(async () => {
    setBandsError(false);
    try {
      setBands(await fetchBands(filterCategory));
    } catch {
      setBandsError(true);
    } finally {
      setBandsLoading(false);
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
  const loadFavCds = useCallback(async () => {
    try {
      setFavCds(await fetchFavoriteCds());
    } catch {
      /* ignore */
    }
  }, []);
  const loadNews = useCallback(async () => {
    try {
      setNewsBands(await fetchNews());
    } catch {
      /* ignore */
    }
  }, []);
  const loadRecommended = useCallback(async () => {
    try {
      setRecommended(await fetchRecommendations());
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
      loadFavCds();
      loadNews();
      loadRecommended();
    }
  }, [
    me,
    loadBands,
    loadCategories,
    loadPlaylists,
    loadFavCount,
    loadRecent,
    loadShared,
    loadFavCds,
    loadNews,
    loadRecommended,
  ]);

  // Ao entrar na home com novidades, marca como vistas (limpa o badge na próxima).
  useEffect(() => {
    if (tab === "home" && newsBands.length > 0 && !newsSeen) {
      setNewsSeen(true);
      markNewsSeen();
    }
  }, [tab, newsBands, newsSeen]);

  // Sem internet: abre direto a tela de Baixados (é o que dá pra ouvir offline).
  useEffect(() => {
    if (offline) setShowDownloads(true);
  }, [offline]);

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
    const name = await dialog.prompt({
      title: "Renomear faixa",
      defaultValue: track.display_name,
      confirmLabel: "Salvar",
    });
    if (name == null) return;
    try {
      const updated = await renameTrack(track.id, name);
      setViewTracks((ts) =>
        ts.map((t) =>
          t.id === track.id ? { ...t, display_name: updated.display_name } : t,
        ),
      );
      toast.success("Faixa renomeada.");
    } catch {
      toast.error("Falha ao renomear a faixa.");
    }
  }

  async function onRenameBand(band: BandSummary) {
    const name = await dialog.prompt({
      title: "Renomear banda",
      defaultValue: band.name,
      confirmLabel: "Salvar",
    });
    if (name == null) return;
    try {
      await renameBand(band.id, name);
      loadBands();
      loadRecent();
      setView((v) =>
        v && v.kind === "band" && v.band.id === band.id
          ? { kind: "band", band: { ...v.band, name } }
          : v,
      );
      toast.success("Banda renomeada.");
    } catch {
      toast.error("Falha ao renomear a banda.");
    }
  }

  // Compartilhar o link público do CD (marketing orgânico). Faixa → link do CD.
  async function shareCd(bandId: number, title: string) {
    const url = `${window.location.origin}/cd/${bandId}`;
    const r = await shareOrCopy(url, title);
    if (r === "copied") toast.success("Link copiado!");
    else if (r === "failed") toast.error("Não foi possível compartilhar.");
  }

  async function onToggleBandFav(band: BandSummary) {
    const nowFav = !band.is_favorite;
    // Otimista: atualiza grade, recentes, novidades e a view aberta.
    const patch = (b: BandSummary) =>
      b.id === band.id ? { ...b, is_favorite: nowFav } : b;
    setBands((bs) => bs.map(patch));
    setRecent((bs) => bs.map(patch));
    setNewsBands((bs) => bs.map(patch));
    setView((v) =>
      v && v.kind === "band" && v.band.id === band.id
        ? { kind: "band", band: { ...v.band, is_favorite: nowFav } }
        : v,
    );
    try {
      await toggleCdFavorite(band.id, nowFav);
      loadFavCds();
      toast.success(nowFav ? "CD adicionado aos curtidos." : "CD removido dos curtidos.");
    } catch {
      // Reverte.
      const undo = (b: BandSummary) =>
        b.id === band.id ? { ...b, is_favorite: !nowFav } : b;
      setBands((bs) => bs.map(undo));
      setRecent((bs) => bs.map(undo));
      setNewsBands((bs) => bs.map(undo));
      toast.error("Não foi possível atualizar os CDs curtidos.");
    }
  }

  async function onToggleHidden(band: BandSummary) {
    const hidden = !band.is_hidden;
    try {
      await setBandHidden(band.id, hidden);
      setBands((bs) =>
        bs.map((b) => (b.id === band.id ? { ...b, is_hidden: hidden } : b)),
      );
      setView((v) =>
        v && v.kind === "band" && v.band.id === band.id
          ? { kind: "band", band: { ...v.band, is_hidden: hidden } }
          : v,
      );
      toast.success(hidden ? "CD ocultado da vitrine." : "CD visível na vitrine.");
    } catch {
      toast.error("Falha ao alterar a visibilidade.");
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

  // Rádio: fila embaralhada de um gênero (fecha a view de detalhe).
  async function startRadio(categoryId: number) {
    try {
      const tracks = await fetchRadio(categoryId);
      if (tracks.length === 0) {
        toast.info("Nenhuma faixa disponível nesse gênero ainda.");
        return;
      }
      setView(null);
      setShuffle(true);
      startQueue(tracks, 0);
      const catName = categories.find((c) => c.id === categoryId)?.name;
      toast.success(catName ? `Rádio ${catName} no ar 📻` : "Rádio no ar 📻");
    } catch {
      toast.error("Não foi possível iniciar o rádio.");
    }
  }

  // Download (só faixas do próprio acervo / admin — o backend também valida).
  function onDownloadTrack(track: Track) {
    const a = document.createElement("a");
    a.href = downloadUrl(track.id);
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
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

  // Abre o modal de upload; catId != null já marca os CDs naquela categoria.
  function openUpload(catId: number | null = null) {
    setUploadCategory(catId);
    setShowUpload(true);
  }

  async function onDeleteBand(band: BandSummary) {
    const ok = await dialog.confirm({
      title: `Excluir "${band.name}"?`,
      message:
        "O arquivo inteiro será apagado do disco e todas as bandas dele serão removidas. Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteArchive(band.archive_id);
    } catch {
      toast.error("Falha ao excluir.");
      return;
    }
    toast.success("Arquivo excluído.");
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
  // Aplica o estado de favorito a uma faixa em todas as listas em memória
  // (lista exibida e fila) — assim o coração fica igual no TrackList e no player.
  function setFavInState(trackId: number, fav: boolean) {
    setViewTracks((ts) =>
      ts.map((t) => (t.id === trackId ? { ...t, is_favorite: fav } : t)),
    );
    setQueue((q) =>
      q.map((t) => (t.id === trackId ? { ...t, is_favorite: fav } : t)),
    );
  }

  async function onToggleFav(track: Track) {
    const nowFav = !track.is_favorite;
    setFavInState(track.id, nowFav);
    try {
      await toggleFavorite(track.id, nowFav);
      loadFavCount();
      if (view?.kind === "favorites" && !nowFav) {
        setViewTracks((ts) => ts.filter((t) => t.id !== track.id));
      }
    } catch {
      // Reverte o estado otimista e avisa.
      setFavInState(track.id, !nowFav);
      toast.error("Não foi possível atualizar as curtidas.");
    }
  }

  async function onAddTrackToPlaylist(playlistId: number) {
    if (!addTrack) return;
    try {
      await addToPlaylist(playlistId, addTrack.id);
      loadPlaylists();
      toast.success("Adicionada à playlist.");
    } catch {
      toast.error("Falha ao adicionar à playlist.");
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
  async function onRenamePlaylist(pl: PlaylistSummary) {
    const name = await dialog.prompt({
      title: "Renomear playlist",
      defaultValue: pl.name,
      confirmLabel: "Salvar",
    });
    if (name == null || name === pl.name) return;
    try {
      await renamePlaylist(pl.id, name);
      loadPlaylists();
      setView((v) =>
        v && v.kind === "playlist" && v.playlist.id === pl.id
          ? { ...v, playlist: { ...v.playlist, name } }
          : v,
      );
      toast.success("Playlist renomeada.");
    } catch {
      toast.error("Falha ao renomear a playlist.");
    }
  }
  async function onDeletePlaylist(pl: PlaylistSummary) {
    const ok = await dialog.confirm({
      title: `Excluir a playlist "${pl.name}"?`,
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    try {
      await deletePlaylist(pl.id);
    } catch {
      toast.error("Falha ao excluir a playlist.");
      return;
    }
    if (view?.kind === "playlist" && view.playlist.id === pl.id) {
      setView(null);
      setViewTracks([]);
    }
    loadPlaylists();
    toast.success("Playlist excluída.");
  }

  // ----- Guards -----
  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center text-zinc-500">
        Carregando…
      </main>
    );
  }
  if (!me) return <LandingView />;

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

  // Aviso de vencimento da assinatura: mostra um banner quando falta ≤ 7 dias
  // (ou já venceu). Só para quem tem plano com data de expiração.
  const expiryDays = me.plan_expires_at
    ? Math.ceil(
        (new Date(me.plan_expires_at).getTime() - Date.now()) / 86_400_000,
      )
    : null;
  const showExpiryWarning = expiryDays != null && expiryDays <= 7;

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
                {(me.is_admin || view.band.owner_id === me.id) && (
                  <button
                    onClick={() => onToggleHidden(view.band)}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      view.band.is_hidden
                        ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                        : "bg-white/10 text-zinc-300 hover:bg-white/20"
                    }`}
                    title={
                      view.band.is_hidden
                        ? "Oculto da vitrine pública — clique para exibir"
                        : "Visível na vitrine pública — clique para ocultar"
                    }
                  >
                    {view.band.is_hidden ? "Oculto" : "Na vitrine"}
                  </button>
                )}
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
              <p className="mt-1 text-xs text-zinc-400">
                {viewTracks.length} faixas
                {totalDurationLabel(viewTracks) && (
                  <span> · {totalDurationLabel(viewTracks)}</span>
                )}
              </p>
              <BandCategories
                bandId={view.band.id}
                current={view.band.categories}
                all={categories}
                isAdmin={me.is_admin}
                onChange={(cats) => onBandCategoriesChange(view.band.id, cats)}
              />
              <div className="mt-4 flex items-center justify-center gap-3 sm:justify-start">
                <button
                  onClick={() => viewTracks.length > 0 && startQueue(viewTracks, 0)}
                  disabled={viewTracks.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-2.5 text-sm font-semibold text-black transition-transform hover:scale-105 disabled:opacity-40"
                >
                  <PlayIcon className="h-4 w-4" /> Tocar
                </button>
                <button
                  onClick={() => onToggleBandFav(view.band)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full border transition-colors ${
                    view.band.is_favorite
                      ? "border-accent/50 bg-accent/15 text-accent"
                      : "border-white/15 bg-white/5 text-zinc-300 hover:text-white"
                  }`}
                  aria-label={view.band.is_favorite ? "Descurtir CD" : "Curtir CD"}
                  aria-pressed={view.band.is_favorite}
                  title={view.band.is_favorite ? "Remover dos CDs curtidos" : "Curtir este CD"}
                >
                  <HeartIcon className="h-5 w-5" filled={view.band.is_favorite} />
                </button>
                {!view.band.is_hidden && (
                  <button
                    onClick={() => shareCd(view.band.id, view.band.name)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 text-zinc-300 transition-colors hover:text-white"
                    aria-label="Compartilhar CD"
                    title="Compartilhar CD"
                  >
                    <ShareIcon className="h-5 w-5" />
                  </button>
                )}
              </div>
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
              {totalDurationLabel(viewTracks) && (
                <span> · {totalDurationLabel(viewTracks)}</span>
              )}
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
          onDownload={
            me.is_admin || (view.kind === "band" && view.band.owner_id === me.id)
              ? onDownloadTrack
              : undefined
          }
          onShare={(t) => shareCd(t.band_id, t.display_name)}
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
          {filterCategory !== null && (
            <button
              onClick={() => startRadio(filterCategory)}
              className="ml-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10"
              title="Tocar um rádio embaralhado deste gênero"
            >
              <PlayIcon className="h-3.5 w-3.5" /> Rádio
            </button>
          )}
          {filterCategory !== null && me.can_upload && (
            <button
              onClick={() => openUpload(filterCategory)}
              className="flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/25"
            >
              <UploadIcon className="h-3.5 w-3.5" />
              Enviar para {categories.find((c) => c.id === filterCategory)?.name}
            </button>
          )}
        </div>
      )}
      {bandsLoading ? (
        <BandGridSkeleton />
      ) : bandsError ? (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-6 py-10 text-center">
          <p className="text-sm text-zinc-400">Não foi possível carregar sua coleção.</p>
          <button
            onClick={() => {
              setBandsLoading(true);
              loadBands();
            }}
            className="mt-3 rounded-full bg-white/10 px-4 py-2 text-sm font-medium hover:bg-white/20"
          >
            Tentar de novo
          </button>
        </div>
      ) : bands.length > 0 ? (
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
            onClick={() => openUpload()}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black"
          >
            <UploadIcon className="h-4 w-4" /> Enviar coleção
          </button>
        </div>
      ) : (
        // Ouvinte sem CDs liberados → vitrine de planos (assinar).
        <SubscribeView />
      )}
    </section>
  );

  const tabContent =
    tab === "subscribe" ? (
      <SubscribeView />
    ) : tab === "search" ? (
      <SearchView
        onOpenBand={openBand}
        onPlayBand={(b) => playFrom(() => openBand(b))}
        onDeleteBand={onDeleteBand}
        onPlayTracks={(list, i) => startQueue(list, i)}
        currentTrackId={currentTrack?.id ?? null}
        isPlaying={isPlaying}
        categories={categories}
        onToggleFavorite={onToggleFav}
        onAddToPlaylist={(t) => setAddTrack(t)}
      />
    ) : tab === "library" ? (
      collection
    ) : (
      // home
      <div className="space-y-7">
        {newsBands.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span>🔔</span> Novidades para você
              <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-black">
                {newsBands.length}
              </span>
            </h2>
            <BandGrid
              bands={newsBands}
              selectedId={null}
              onOpen={openBand}
              onPlay={(b) => playFrom(() => openBand(b))}
              onDelete={onDeleteBand}
            />
          </section>
        )}
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
        {favCds.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <HeartIcon className="h-4 w-4 text-accent" filled /> CDs curtidos
            </h2>
            <BandGrid
              bands={favCds}
              selectedId={null}
              onOpen={openBand}
              onPlay={(b) => playFrom(() => openBand(b))}
              onDelete={onDeleteBand}
            />
          </section>
        )}
        {recommended.length > 0 && (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <span>✨</span> Descobrir
            </h2>
            <BandGrid
              bands={recommended}
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
          onRename={onRenamePlaylist}
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
        onRename={onRenamePlaylist}
        onCreate={onCreatePlaylist}
        onDelete={onDeletePlaylist}
        onUpload={() => openUpload()}
        onAdmin={() => router.push("/admin")}
        onProfile={() => setShowProfile(true)}
        onStats={() => setShowStats(true)}
        onDownloads={() => setShowDownloads(true)}
        onLogout={logout}
      />

      <main className="min-w-0 flex-1 pb-44 lg:pb-28">
        {/* Header mobile (a sidebar cobre o desktop). */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/5 bg-base/80 px-4 py-3 backdrop-blur lg:hidden">
          <h1 className="font-display text-lg font-black uppercase leading-none tracking-tight">
            Toque <span className="text-accent">Agora</span>
          </h1>

          {/* Menu hambúrguer (consolida as ações do header) */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-2.5 hover:bg-white/20"
              aria-label="Menu"
              aria-expanded={menuOpen}
            >
              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-indigo-600 text-[10px] font-black">
                {me.has_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl(me.id)} alt="" className="h-full w-full object-cover" />
                ) : (
                  (me.display_name || me.email).slice(0, 2).toUpperCase()
                )}
              </span>
              <MenuIcon className="h-5 w-5 text-zinc-300" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-white/10 bg-surface shadow-2xl">
                  <div className="border-b border-white/10 px-4 py-3">
                    <p className="truncate text-sm font-semibold">
                      {me.display_name || me.email}
                    </p>
                    {me.display_name && (
                      <p className="truncate text-xs text-zinc-400">{me.email}</p>
                    )}
                  </div>
                  {me.can_upload && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        openUpload();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/10"
                    >
                      <UploadIcon className="h-4 w-4 text-zinc-400" /> Enviar músicas
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setShowProfile(true);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/10"
                  >
                    <span className="w-4 text-center">👤</span> Meu perfil
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setShowStats(true);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/10"
                  >
                    <span className="w-4 text-center">📊</span> Minha retrospectiva
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setShowDownloads(true);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/10"
                  >
                    <span className="w-4 text-center">📥</span> Baixados (offline)
                  </button>
                  {me.is_admin && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        router.push("/admin");
                      }}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/10"
                    >
                      <span className="w-4 text-center">⚙️</span> Painel admin
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-3 border-t border-white/10 px-4 py-3 text-left text-sm text-red-400 hover:bg-white/10"
                  >
                    <span className="w-4 text-center">⏻</span> Sair
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-5xl space-y-7 px-4 py-6 sm:px-6">
          {(offline || downloads.blocked) && (
            <button
              onClick={() => setShowDownloads(true)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-sm hover:bg-white/10"
            >
              <span className="text-lg">{offline ? "📴" : "🔒"}</span>
              <span className="flex-1 text-zinc-200">
                {offline
                  ? "Você está sem internet — só as músicas baixadas tocam agora."
                  : "Sua licença offline expirou — reconecte para liberar os downloads."}
              </span>
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
                Ver baixados
              </span>
            </button>
          )}
          {showExpiryWarning && (
            <button
              onClick={() => onTab("subscribe")}
              className="flex w-full items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left text-sm transition-colors hover:bg-amber-500/15"
            >
              <span className="text-lg">⏳</span>
              <span className="flex-1 text-amber-200">
                {expiryDays! < 0
                  ? "Sua assinatura venceu. Renove para continuar ouvindo."
                  : expiryDays === 0
                    ? "Sua assinatura vence hoje. Renove para não perder o acesso."
                    : `Sua assinatura vence em ${expiryDays} ${expiryDays === 1 ? "dia" : "dias"}. Renove para não perder o acesso.`}
              </span>
              <span className="shrink-0 rounded-full bg-amber-400 px-3 py-1 text-xs font-bold text-black">
                Renovar
              </span>
            </button>
          )}
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
        isFavorite={currentTrack?.is_favorite ?? false}
        onToggleFavorite={currentTrack ? () => onToggleFav(currentTrack) : undefined}
        onAddToPlaylist={currentTrack ? () => setAddTrack(currentTrack) : undefined}
        resumeTime={resumeTime}
        onTime={(t) => {
          currentTimeRef.t = t;
          // Atualiza o currentTime salvo sem recriar todo o estado.
          if (queue.length > 0 && currentIndex != null) {
            savePlayerState({ queue, currentIndex, shuffle, repeat, currentTime: t });
          }
        }}
      />

      <MobileNav tab={tab} onTab={onTab} showSubscribe={!me.can_upload} />

      {showUpload && (
        <UploadModal
          onUploaded={onUploaded}
          onQuotaExceeded={(info) => {
            setShowUpload(false);
            setQuotaInfo(info);
          }}
          onClose={() => setShowUpload(false)}
          categoryId={uploadCategory}
          categoryName={
            uploadCategory != null
              ? categories.find((c) => c.id === uploadCategory)?.name ?? null
              : null
          }
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
      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showStats && <StatsModal onClose={() => setShowStats(false)} />}
      {showDownloads && (
        <DownloadsView
          onClose={() => setShowDownloads(false)}
          onPlay={(list, i) => startQueue(list, i)}
          currentTrackId={currentTrack?.id ?? null}
          isPlaying={isPlaying}
        />
      )}
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
