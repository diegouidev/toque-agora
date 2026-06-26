"use client";

import { useEffect, useState } from "react";
import {
  type AdminOverview,
  type AdminUserDetail,
  type AdminUserStat,
  type PlaylistSummary,
  avatarUrl,
  createUser,
  deleteUser,
  fetchAdminOverview,
  fetchAdminUser,
  fetchAdminUserPlaylists,
  resetUserPassword,
  setUserBlocked,
  updateUserQuota,
} from "../lib/api";

const GB = 1024 * 1024 * 1024;

function fmtBytes(b: number): string {
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  return `${(b / (1024 * 1024)).toFixed(0)} MB`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [quota, setQuota] = useState("5");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setData(await fetchAdminOverview());
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createUser({
        email: email.trim(),
        password,
        quota_gb: Number(quota) || 5,
        is_admin: false,
      });
      setEmail("");
      setPassword("");
      setQuota("5");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar");
    }
  }

  async function changeQuota(u: AdminUserStat) {
    const val = prompt(
      `Nova quota total (GB) para ${u.email}:`,
      String(Math.round(u.quota_bytes / GB)),
    );
    if (val == null) return;
    const gb = Number(val);
    if (!gb || gb <= 0) return;
    await updateUserQuota(u.id, gb);
    load();
  }

  async function remove(u: AdminUserStat) {
    if (!confirm(`Excluir o usuário ${u.email}? As coleções dele serão removidas.`)) return;
    try {
      await deleteUser(u.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao excluir");
    }
  }

  async function toggleBlock(u: AdminUserStat) {
    const block = u.is_active; // se está ativo, vamos bloquear
    if (!confirm(`${block ? "Bloquear" : "Desbloquear"} o login de ${u.email}?`)) return;
    try {
      await setUserBlocked(u.id, block);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha");
    }
  }

  async function resetPassword(u: AdminUserStat) {
    const pwd = prompt(`Nova senha para ${u.email} (mín. 8 caracteres):`);
    if (pwd == null) return;
    if (pwd.length < 8) {
      alert("A senha precisa ter ao menos 8 caracteres.");
      return;
    }
    try {
      await resetUserPassword(u.id, pwd);
      alert("Senha redefinida.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha");
    }
  }

  // Detalhe de um usuário (perfil + playlists).
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailPls, setDetailPls] = useState<PlaylistSummary[]>([]);
  async function openDetail(u: AdminUserStat) {
    try {
      const [d, pls] = await Promise.all([
        fetchAdminUser(u.id),
        fetchAdminUserPlaylists(u.id),
      ]);
      setDetail(d);
      setDetailPls(pls);
    } catch {
      /* ignore */
    }
  }

  const totals = data?.totals;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl space-y-5 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Painel do administrador</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>

        {/* Totais globais */}
        {totals && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Usuários", value: totals.users },
              { label: "Armazenamento", value: fmtBytes(totals.used_bytes) },
              { label: "Faixas", value: totals.tracks },
              { label: "Reproduções", value: totals.plays },
            ].map((c) => (
              <div key={c.label} className="rounded-xl bg-black/30 p-3">
                <p className="text-lg font-black">{c.value}</p>
                <p className="text-[11px] uppercase tracking-wide text-zinc-400">{c.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Criar usuário */}
        <form onSubmit={add} className="space-y-2 rounded-xl bg-black/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Novo usuário
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent sm:col-span-2"
            />
            <input
              type="number"
              min={1}
              placeholder="GB"
              value={quota}
              onChange={(e) => setQuota(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <input
            type="text"
            placeholder="Senha (mín. 8 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="w-full rounded-full bg-accent py-2 text-sm font-bold text-black">
            Criar usuário
          </button>
        </form>

        {/* Lista de usuários com estatísticas */}
        <div className="space-y-2">
          {(data?.users ?? []).map((u) => (
            <div
              key={u.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${
                u.is_active ? "bg-white/5" : "bg-red-950/40"
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-indigo-600 text-[10px] font-black">
                  {u.has_avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl(u.id)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (u.display_name || u.email).slice(0, 2).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {u.display_name ? `${u.display_name} · ` : ""}
                    {u.email} {u.is_admin && <span className="text-accent">(admin)</span>}
                    {!u.is_active && <span className="ml-1 text-red-400">(bloqueado)</span>}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {fmtBytes(u.used_bytes)} / {(u.quota_bytes / GB).toFixed(0)} GB ·{" "}
                    {u.track_count} faixas · ativo {fmtDate(u.last_played_at)}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                <button
                  onClick={() => openDetail(u)}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                >
                  Perfil
                </button>
                <button
                  onClick={() => changeQuota(u)}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                >
                  Quota
                </button>
                <button
                  onClick={() => resetPassword(u)}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                >
                  Senha
                </button>
                {!u.is_admin && (
                  <>
                    <button
                      onClick={() => toggleBlock(u)}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                    >
                      {u.is_active ? "Bloquear" : "Desbloquear"}
                    </button>
                    <button
                      onClick={() => remove(u)}
                      className="rounded-full bg-red-600/80 px-3 py-1 text-xs hover:bg-red-600"
                    >
                      Excluir
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Bandas mais tocadas */}
        {data && data.top_bands.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Mais tocadas
            </p>
            {data.top_bands.map((b, i) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-lg bg-black/20 px-3 py-1.5 text-sm"
              >
                <span className="truncate">
                  <span className="mr-2 text-zinc-500">{i + 1}</span>
                  {b.name}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">{b.plays} plays</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detalhe do usuário (perfil + playlists) */}
      {detail && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-8"
          onClick={() => setDetail(null)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-indigo-600 text-sm font-black">
                {detail.has_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl(detail.id)} alt="" className="h-full w-full object-cover" />
                ) : (
                  (detail.display_name || detail.email).slice(0, 2).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{detail.display_name || detail.email}</p>
                <p className="truncate text-xs text-zinc-400">{detail.email}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-zinc-400 hover:text-white">
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <Info label="Status" value={detail.is_active ? "Ativo" : "Bloqueado"} />
              <Info label="Admin" value={detail.is_admin ? "Sim" : "Não"} />
              <Info label="Uso" value={`${fmtBytes(detail.used_bytes)} / ${(detail.quota_bytes / GB).toFixed(0)} GB`} />
              <Info label="Arquivos" value={String(detail.archive_count)} />
              <Info label="Faixas" value={String(detail.track_count)} />
              <Info label="Playlists" value={String(detail.playlist_count)} />
              <Info label="Último play" value={fmtDate(detail.last_played_at)} />
              <Info label="Criado em" value={fmtDate(detail.created_at)} />
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Playlists ({detailPls.length})
              </p>
              {detailPls.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhuma playlist.</p>
              ) : (
                <div className="space-y-1">
                  {detailPls.map((p) => (
                    <div
                      key={p.id}
                      className="flex justify-between rounded-lg bg-black/20 px-3 py-1.5 text-sm"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 text-xs text-zinc-400">{p.track_count} faixas</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/20 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="truncate font-medium">{value}</p>
    </div>
  );
}
