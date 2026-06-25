"use client";

import { useEffect, useState } from "react";
import {
  type AdminUser,
  createUser,
  deleteUser,
  listUsers,
  updateUserQuota,
} from "../lib/api";

const GB = 1024 * 1024 * 1024;

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [quota, setQuota] = useState("5");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setUsers(await listUsers());
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

  async function changeQuota(u: AdminUser) {
    const val = prompt(`Nova quota total (GB) para ${u.email}:`, String(Math.round(u.quota_bytes / GB)));
    if (val == null) return;
    const gb = Number(val);
    if (!gb || gb <= 0) return;
    await updateUserQuota(u.id, gb);
    load();
  }

  async function remove(u: AdminUser) {
    if (!confirm(`Excluir o usuário ${u.email}? As coleções dele serão removidas.`)) return;
    try {
      await deleteUser(u.id);
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao excluir");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg space-y-5 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Painel do administrador</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            ✕
          </button>
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
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button className="w-full rounded-full bg-accent py-2 text-sm font-bold text-black">
            Criar usuário
          </button>
        </form>

        {/* Lista */}
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {u.email} {u.is_admin && <span className="text-accent">(admin)</span>}
                </p>
                <p className="text-xs text-zinc-400">
                  {(u.used_bytes / GB).toFixed(1)} / {(u.quota_bytes / GB).toFixed(0)} GB
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => changeQuota(u)}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/20"
                >
                  Quota
                </button>
                {!u.is_admin && (
                  <button
                    onClick={() => remove(u)}
                    className="rounded-full bg-red-600/80 px-3 py-1 text-xs hover:bg-red-600"
                  >
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
