// Base da API. Vazio = mesma origem (o Caddy serve a API em /api).
// Em dev fora do Docker, defina NEXT_PUBLIC_API_URL.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

// ---------- Tipos ----------
export interface Track {
  id: number;
  band_id: number;
  name: string;
  display_name: string;
  size: number;
  index: number;
  duration: number;
  is_favorite: boolean;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  track_count: number;
  owner_email?: string | null;
  shared?: boolean;
}

export interface PlaylistShareOut {
  user_id: number;
  email: string;
}

export interface BandSummary {
  id: number;
  archive_id: number;
  name: string;
  kind: string; // "rar" | "zip"
  track_count: number;
  has_cover: boolean;
}

export interface UploadError {
  filename: string;
  detail: string;
}

export interface UploadResult {
  bands: BandSummary[];
  errors: UploadError[];
}

export interface QuotaExceeded {
  code: "quota_exceeded";
  used_gb: number;
  quota_gb: number;
  whatsapp: string;
}

export interface Me {
  id: number;
  email: string;
  is_admin: boolean;
  quota_bytes: number;
  used_bytes: number;
  quota_gb: number;
  used_gb: number;
  admin_whatsapp: string;
}

export interface AdminUser {
  id: number;
  email: string;
  is_admin: boolean;
  quota_bytes: number;
  used_bytes: number;
}

// Todas as chamadas enviam o cookie de sessão (HttpOnly).
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${path}`, {
    ...init,
    cache: "no-store",
    credentials: "include",
  });
}

// ---------- Auth ----------
export async function login(email: string, password: string): Promise<Me> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(typeof d.detail === "string" ? d.detail : "Falha no login");
  }
  return res.json();
}

export async function logout(): Promise<void> {
  await apiFetch("/api/auth/logout", { method: "POST" });
}

export async function fetchMe(): Promise<Me> {
  const res = await apiFetch("/api/auth/me");
  if (!res.ok) throw new Error("Não autenticado");
  return res.json();
}

// ---------- Coleção ----------
export function streamUrl(trackId: number): string {
  return `${API_URL}/api/stream/${trackId}`;
}

export function coverUrl(bandId: number): string {
  return `${API_URL}/api/bands/${bandId}/cover`;
}

export async function fetchBands(): Promise<BandSummary[]> {
  const res = await apiFetch("/api/bands");
  if (!res.ok) throw new Error("Falha ao listar bandas");
  return res.json();
}

export async function fetchBandTracks(bandId: number): Promise<Track[]> {
  const res = await apiFetch(`/api/bands/${bandId}/tracks`);
  if (!res.ok) throw new Error("Falha ao listar faixas");
  return res.json();
}

export async function deleteArchive(archiveId: number): Promise<void> {
  const res = await apiFetch(`/api/archives/${archiveId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Falha ao excluir");
}

// ---------- Admin ----------
export async function listUsers(): Promise<AdminUser[]> {
  const res = await apiFetch("/api/users");
  if (!res.ok) throw new Error("Falha ao listar usuários");
  return res.json();
}

export async function createUser(body: {
  email: string;
  password: string;
  quota_gb: number;
  is_admin: boolean;
}): Promise<void> {
  const res = await apiFetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(typeof d.detail === "string" ? d.detail : "Falha ao criar usuário");
  }
}

export async function updateUserQuota(userId: number, quotaGb: number): Promise<void> {
  const res = await apiFetch(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quota_gb: quotaGb }),
  });
  if (!res.ok) throw new Error("Falha ao atualizar quota");
}

export async function deleteUser(userId: number): Promise<void> {
  const res = await apiFetch(`/api/users/${userId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Falha ao excluir usuário");
}

// ---------- Admin: visão geral ----------
export interface AdminTotals {
  users: number;
  used_bytes: number;
  archives: number;
  bands: number;
  tracks: number;
  plays: number;
}

export interface AdminUserStat {
  id: number;
  email: string;
  is_admin: boolean;
  quota_bytes: number;
  used_bytes: number;
  archive_count: number;
  track_count: number;
  last_played_at: string | null;
  created_at: string | null;
}

export interface TopBand {
  id: number;
  name: string;
  plays: number;
}

export interface AdminOverview {
  totals: AdminTotals;
  users: AdminUserStat[];
  top_bands: TopBand[];
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  const res = await apiFetch("/api/admin/overview");
  if (!res.ok) throw new Error("Falha ao carregar visão geral");
  return res.json();
}

// ---------- Favoritos ----------
export async function toggleFavorite(trackId: number, fav: boolean): Promise<void> {
  const res = await apiFetch(`/api/favorites/${trackId}`, {
    method: fav ? "PUT" : "DELETE",
  });
  if (!res.ok && res.status !== 204) throw new Error("Falha ao curtir");
}

export async function fetchFavorites(): Promise<Track[]> {
  const res = await apiFetch("/api/favorites");
  if (!res.ok) throw new Error("Falha ao listar curtidas");
  return res.json();
}

// ---------- Playlists ----------
export async function fetchPlaylists(): Promise<PlaylistSummary[]> {
  const res = await apiFetch("/api/playlists");
  if (!res.ok) throw new Error("Falha ao listar playlists");
  return res.json();
}

export async function createPlaylist(name: string): Promise<PlaylistSummary> {
  const res = await apiFetch("/api/playlists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Falha ao criar playlist");
  return res.json();
}

export async function deletePlaylist(id: number): Promise<void> {
  const res = await apiFetch(`/api/playlists/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Falha ao excluir playlist");
}

export async function fetchPlaylistTracks(id: number): Promise<Track[]> {
  const res = await apiFetch(`/api/playlists/${id}/tracks`);
  if (!res.ok) throw new Error("Falha ao listar faixas da playlist");
  return res.json();
}

export async function addToPlaylist(playlistId: number, trackId: number): Promise<void> {
  const res = await apiFetch(`/api/playlists/${playlistId}/tracks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_id: trackId }),
  });
  if (!res.ok && res.status !== 204) throw new Error("Falha ao adicionar à playlist");
}

export async function reorderPlaylist(
  playlistId: number,
  trackIds: number[],
): Promise<void> {
  const res = await apiFetch(`/api/playlists/${playlistId}/order`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ track_ids: trackIds }),
  });
  if (!res.ok && res.status !== 204) throw new Error("Falha ao reordenar");
}

export async function removeFromPlaylist(playlistId: number, trackId: number): Promise<void> {
  const res = await apiFetch(`/api/playlists/${playlistId}/tracks/${trackId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) throw new Error("Falha ao remover da playlist");
}

// ---------- Compartilhamento de playlists ----------
export async function fetchSharedPlaylists(): Promise<PlaylistSummary[]> {
  const res = await apiFetch("/api/playlists/shared");
  if (!res.ok) throw new Error("Falha ao listar compartilhadas");
  return res.json();
}

export async function sharePlaylist(
  playlistId: number,
  email: string,
): Promise<PlaylistShareOut> {
  const res = await apiFetch(`/api/playlists/${playlistId}/share`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(typeof d.detail === "string" ? d.detail : "Falha ao compartilhar");
  }
  return res.json();
}

export async function fetchPlaylistShares(playlistId: number): Promise<PlaylistShareOut[]> {
  const res = await apiFetch(`/api/playlists/${playlistId}/shares`);
  if (!res.ok) throw new Error("Falha ao listar compartilhamentos");
  return res.json();
}

export async function unsharePlaylist(playlistId: number, userId: number): Promise<void> {
  const res = await apiFetch(`/api/playlists/${playlistId}/share/${userId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) throw new Error("Falha ao remover compartilhamento");
}

// ---------- Renomear banda / faixa ----------
export async function renameBand(bandId: number, name: string): Promise<BandSummary> {
  const res = await apiFetch(`/api/bands/${bandId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Falha ao renomear banda");
  return res.json();
}

export async function renameTrack(trackId: number, name: string): Promise<Track> {
  const res = await apiFetch(`/api/tracks/${trackId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("Falha ao renomear faixa");
  return res.json();
}

// ---------- Busca ----------
export interface SearchResult {
  bands: BandSummary[];
  tracks: Track[];
}

export async function searchAll(q: string): Promise<SearchResult> {
  const res = await apiFetch(`/api/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("Falha na busca");
  return res.json();
}

// ---------- Histórico (tocadas recentemente) ----------
export async function fetchRecent(limit = 20): Promise<BandSummary[]> {
  const res = await apiFetch(`/api/history?limit=${limit}`);
  if (!res.ok) throw new Error("Falha ao listar recentes");
  return res.json();
}

// Registra que uma faixa começou a tocar (falha silenciosa; não bloqueia o player).
export function recordPlay(trackId: number): void {
  apiFetch(`/api/history/${trackId}`, { method: "POST", keepalive: true }).catch(
    () => {},
  );
}

// ---------- Upload com progresso (XHR) ----------
// Retornado para o Uploader montar a request com cookie (withCredentials).
export function uploadEndpoint(): string {
  return `${API_URL}/api/upload`;
}

// ---------- Upload em pedaços (passa pelo limite do proxy/Cloudflare) ----------
export function uploadChunkEndpoint(): string {
  return `${API_URL}/api/upload/chunk`;
}
export function uploadCompleteEndpoint(): string {
  return `${API_URL}/api/upload/complete`;
}
export function uploadAbortEndpoint(): string {
  return `${API_URL}/api/upload/abort`;
}

// ---------- WhatsApp upgrade ----------
export function whatsappUpgradeUrl(
  whatsapp: string,
  email: string,
  usedGb: number,
  quotaGb: number,
): string {
  const msg =
    `Olá! Sou ${email} (uso ${usedGb}/${quotaGb} GB) e quero comprar mais ` +
    `espaço na TOQUE AGORA.`;
  return `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
}
