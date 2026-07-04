"use client";

import { useRef, useState } from "react";
import {
  avatarUrl,
  changeMyPassword,
  deleteAvatar,
  updateMe,
  uploadAvatar,
} from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useEscClose } from "../lib/useEscClose";

export default function ProfileModal({ onClose }: { onClose: () => void }) {
  const { me, refresh } = useAuth();
  useEscClose(onClose);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(me?.display_name ?? "");
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // bust de cache do avatar após upload
  const [avatarV, setAvatarV] = useState(0);

  if (!me) return null;

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await updateMe(name.trim());
      await refresh();
      setMsg("Nome atualizado.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha");
    }
  }

  async function savePwd(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    try {
      await changeMyPassword(oldPwd, newPwd);
      setOldPwd("");
      setNewPwd("");
      setMsg("Senha alterada.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha");
    }
  }

  async function onPickAvatar(file: File) {
    setErr(null);
    try {
      await uploadAvatar(file);
      await refresh();
      setAvatarV((v) => v + 1);
      setMsg("Avatar atualizado.");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "Falha ao enviar avatar");
    }
  }

  async function removeAvatar() {
    try {
      await deleteAvatar();
      await refresh();
      setAvatarV((v) => v + 1);
    } catch {
      /* ignore */
    }
  }

  const initials = (me.display_name || me.email).slice(0, 2).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Meu perfil"
        className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Meu perfil</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>

        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-indigo-600 text-xl font-black">
            {me.has_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`${avatarUrl(me.id)}?v=${avatarV}`}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="space-x-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-full bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
            >
              Trocar foto
            </button>
            {me.has_avatar && (
              <button
                onClick={removeAvatar}
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-red-400 hover:bg-white/20"
              >
                Remover
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickAvatar(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Nome */}
        <form onSubmit={saveName} className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Nome de exibição
          </label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={me.email}
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button className="rounded-lg bg-accent px-4 text-sm font-semibold text-black">
              Salvar
            </button>
          </div>
          <p className="text-xs text-zinc-500">Email: {me.email}</p>
        </form>

        {/* Senha */}
        <form onSubmit={savePwd} className="space-y-2 border-t border-white/10 pt-4">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Trocar senha
          </label>
          <input
            type="password"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            placeholder="Senha atual"
            required
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="Nova senha (mín. 8)"
            required
            minLength={8}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button className="w-full rounded-lg bg-white/10 py-2 text-sm font-semibold hover:bg-white/20">
            Alterar senha
          </button>
        </form>

        {msg && <p className="text-sm text-accent">{msg}</p>}
        {err && <p className="text-sm text-red-400">{err}</p>}
      </div>
    </div>
  );
}
