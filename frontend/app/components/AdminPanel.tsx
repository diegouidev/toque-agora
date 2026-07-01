"use client";

import { useEffect, useState } from "react";
import {
  type AdminOverview,
  type AdminUserDetail,
  type AdminUserStat,
  type Category,
  type Plan,
  type PlaylistSummary,
  avatarUrl,
  createCategory,
  createUser,
  deleteCategory,
  deleteUser,
  fetchAdminOverview,
  fetchAdminUser,
  fetchAdminUserPlaylists,
  fetchCategories,
  fetchPlans,
  resetUserPassword,
  setUserBlocked,
  updateUser,
  updateUserQuota,
} from "../lib/api";
import AsaasConfig from "./AsaasConfig";
import PlansManager from "./PlansManager";

const GB = 1024 * 1024 * 1024;

function fmtBytes(b: number): string {
  if (b >= GB) return `${(b / GB).toFixed(1)} GB`;
  return `${(b / (1024 * 1024)).toFixed(0)} MB`;
}
function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
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
  const [cats, setCats] = useState<Category[]>([]);
  const [newCat, setNewCat] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [canUpload, setCanUpload] = useState(true);
  const [planId, setPlanId] = useState<string>(""); // "" = sem plano

  async function loadCats() {
    try {
      setCats(await fetchCategories());
    } catch {
      /* ignore */
    }
  }
  async function addCat(e: React.FormEvent) {
    e.preventDefault();
    if (!newCat.trim()) return;
    try {
      await createCategory(newCat.trim());
      setNewCat("");
      loadCats();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao criar categoria");
    }
  }
  async function removeCat(c: Category) {
    if (!confirm(`Excluir a categoria "${c.name}"? Os CDs perdem essa marcação.`)) return;
    await deleteCategory(c.id);
    loadCats();
  }

  async function loadPlans() {
    try {
      setPlans(await fetchPlans());
    } catch {
      /* ignore */
    }
  }
  async function load() {
    loadCats();
    loadPlans();
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
        can_upload: canUpload,
        plan_id: planId ? Number(planId) : null,
      });
      setEmail("");
      setPassword("");
      setQuota("5");
      setCanUpload(true);
      setPlanId("");
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

  async function toggleUpload(u: AdminUserStat) {
    try {
      await updateUser(u.id, { can_upload: !u.can_upload });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha");
    }
  }

  async function changePlan(u: AdminUserStat) {
    const opts = plans.map((p) => `${p.id}=${p.name}`).join(", ");
    const val = prompt(
      `Plano de ${u.email}. Digite o ID do plano (0 = sem plano).\nDisponíveis: ${opts || "nenhum"}`,
      u.plan_id ? String(u.plan_id) : "0",
    );
    if (val == null) return;
    try {
      await updateUser(u.id, { plan_id: Number(val) || 0 });
      load();
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
  const billing = data?.billing;
  const usage = data?.usage ?? [];
  const usageMax = Math.max(1, ...usage.map((p) => p.plays));

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

        {/* Vendas / assinaturas */}
        {billing && (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Vendas
            </p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-black/30 p-3">
                <p className="text-lg font-black text-accent">{billing.active_subscribers}</p>
                <p className="text-[11px] uppercase tracking-wide text-zinc-400">
                  Assinantes ativos
                </p>
              </div>
              <div className="rounded-xl bg-black/30 p-3">
                <p className="text-lg font-black text-accent">
                  {brl(billing.estimated_mrr_cents)}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-zinc-400">
                  Receita estimada/mês
                </p>
              </div>
              <div className="rounded-xl bg-black/30 p-3">
                <p className="truncate text-lg font-black">
                  {billing.top_plan_name ?? "—"}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-zinc-400">
                  Plano mais vendido{" "}
                  {billing.top_plan_count > 0 && `(${billing.top_plan_count})`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Uso ao longo do tempo (reproduções/dia, últimos 30 dias) */}
        {usage.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Uso (reproduções/dia — últimos 30 dias)
            </p>
            <div className="flex h-24 items-end gap-0.5 rounded-xl bg-black/30 p-3">
              {usage.map((p) => (
                <div
                  key={p.date}
                  title={`${p.date}: ${p.plays} reproduções`}
                  style={{ height: `${Math.max(4, (p.plays / usageMax) * 100)}%` }}
                  className="flex-1 rounded-t bg-accent/70 hover:bg-accent"
                />
              ))}
            </div>
          </div>
        )}

        {/* Categorias */}
        <div className="space-y-2 rounded-xl bg-black/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Categorias
          </p>
          <div className="flex flex-wrap gap-2">
            {cats.map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs"
              >
                {c.name}
                <button
                  onClick={() => removeCat(c)}
                  className="text-zinc-400 hover:text-red-400"
                  aria-label={`Excluir ${c.name}`}
                >
                  ✕
                </button>
              </span>
            ))}
            {cats.length === 0 && (
              <span className="text-xs text-zinc-500">Nenhuma categoria ainda.</span>
            )}
          </div>
          <form onSubmit={addCat} className="flex gap-2">
            <input
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="Nova categoria (ex. Forró)"
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button className="rounded-lg bg-accent px-4 text-sm font-semibold text-black">
              Criar
            </button>
          </form>
        </div>

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
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={canUpload}
                onChange={(e) => setCanUpload(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Pode enviar (upload)
            </label>
            <select
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="">Sem plano</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  Plano: {p.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="w-full rounded-full bg-accent py-2 text-sm font-bold text-black">
            Criar usuário
          </button>
        </form>

        {/* Planos */}
        <PlansManager />

        {/* Configuração de pagamentos (Asaas) */}
        <AsaasConfig />

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
                    {u.track_count} faixas
                    {!u.is_admin && (
                      <>
                        {" · "}
                        {u.can_upload ? "envia" : "ouvinte"}
                        {u.plan_name ? ` · Plano: ${u.plan_name}` : " · sem plano"}
                      </>
                    )}
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
                      onClick={() => changePlan(u)}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                    >
                      Plano
                    </button>
                    <button
                      onClick={() => toggleUpload(u)}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                    >
                      {u.can_upload ? "Bloq. upload" : "Lib. upload"}
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
