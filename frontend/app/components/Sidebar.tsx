"use client";

import { useState } from "react";
import { avatarUrl, type Me, type PlaylistSummary } from "../lib/api";
import QuotaBar from "./QuotaBar";
import {
  HeartIcon,
  HomeIcon,
  LibraryIcon,
  PlusIcon,
  SearchIcon,
  ShareIcon,
  UploadIcon,
} from "./icons";

export type Tab = "home" | "search" | "library";

interface Props {
  me: Me;
  tab: Tab;
  onTab: (tab: Tab) => void;
  playlists: PlaylistSummary[];
  sharedPlaylists: PlaylistSummary[];
  favCount: number;
  activeKey: string | null; // "fav" | `pl:${id}`
  onOpenFavorites: () => void;
  onOpenPlaylist: (pl: PlaylistSummary) => void;
  onOpenShared: (pl: PlaylistSummary) => void;
  onShare: (pl: PlaylistSummary) => void;
  onCreate: (name: string) => void;
  onDelete: (pl: PlaylistSummary) => void;
  onUpload: () => void;
  onAdmin: () => void;
  onProfile: () => void;
  onLogout: () => void;
}

const NAV: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: "home", label: "Início", Icon: HomeIcon },
  { id: "search", label: "Buscar", Icon: SearchIcon },
  { id: "library", label: "Biblioteca", Icon: LibraryIcon },
];

/** Navegação lateral (desktop). No mobile usamos a MobileNav inferior. */
export default function Sidebar({
  me,
  tab,
  onTab,
  playlists,
  sharedPlaylists,
  favCount,
  activeKey,
  onOpenFavorites,
  onOpenPlaylist,
  onOpenShared,
  onShare,
  onCreate,
  onDelete,
  onUpload,
  onAdmin,
  onProfile,
  onLogout,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-4 border-r border-white/5 bg-black/30 p-4 lg:flex">
      <div className="px-2">
        <h1 className="font-display text-xl font-black uppercase leading-none tracking-tight">
          Toque <span className="text-accent">Agora</span>
        </h1>
        <p className="text-[11px] text-zinc-500">A sua Playlist preferida</p>
      </div>

      {/* Navegação principal */}
      <nav className="space-y-1">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onTab(id)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              tab === id ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
        <button
          onClick={onUpload}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-zinc-400 transition-colors hover:text-white"
        >
          <UploadIcon className="h-5 w-5" />
          Enviar
        </button>
      </nav>

      {/* Playlists + Curtidas */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl bg-white/5 p-2">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Suas playlists
          </span>
          <button
            onClick={() => setCreating((c) => !c)}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            aria-label="Nova playlist"
            title="Nova playlist"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        {creating && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) {
                onCreate(name.trim());
                setName("");
                setCreating(false);
              }
            }}
            className="mb-1 flex gap-1 px-1"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome"
              className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-sm outline-none focus:border-accent"
            />
            <button className="rounded-md bg-accent px-2 text-xs font-semibold text-black">
              OK
            </button>
          </form>
        )}

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto">
          <button
            onClick={onOpenFavorites}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
              activeKey === "fav" ? "bg-white/10 text-accent" : "hover:bg-white/5"
            }`}
          >
            <HeartIcon className="h-4 w-4 text-accent" filled />
            <span className="flex-1 truncate">Curtidas</span>
            <span className="text-xs text-zinc-500">{favCount}</span>
          </button>

          {playlists.map((pl) => (
            <div
              key={pl.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-2 text-sm transition-colors ${
                activeKey === `pl:${pl.id}` ? "bg-white/10 text-accent" : "hover:bg-white/5"
              }`}
            >
              <button
                onClick={() => onOpenPlaylist(pl)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span className="truncate">{pl.name}</span>
                <span className="ml-auto text-xs text-zinc-500">{pl.track_count}</span>
              </button>
              <button
                onClick={() => onShare(pl)}
                className="shrink-0 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:text-accent"
                aria-label="Compartilhar playlist"
                title="Compartilhar"
              >
                <ShareIcon className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(pl)}
                className="shrink-0 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:text-red-500"
                aria-label="Excluir playlist"
                title="Excluir playlist"
              >
                ✕
              </button>
            </div>
          ))}

          {playlists.length === 0 && (
            <p className="px-2 py-3 text-xs text-zinc-500">
              Crie sua primeira playlist no +.
            </p>
          )}

          {sharedPlaylists.length > 0 && (
            <>
              <p className="px-2 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Compartilhadas comigo
              </p>
              {sharedPlaylists.map((pl) => (
                <button
                  key={`shared-${pl.id}`}
                  onClick={() => onOpenShared(pl)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                    activeKey === `pl:${pl.id}` ? "bg-white/10 text-accent" : "hover:bg-white/5"
                  }`}
                >
                  <ShareIcon className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate">
                    {pl.name}
                    {pl.owner_email && (
                      <span className="block truncate text-[11px] text-zinc-500">
                        por {pl.owner_email}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-zinc-500">{pl.track_count}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Rodapé: perfil + quota + conta */}
      <div className="space-y-3 border-t border-white/5 pt-3">
        <button
          onClick={onProfile}
          className="flex w-full items-center gap-2 rounded-lg p-1 text-left hover:bg-white/5"
          title="Meu perfil"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-indigo-600 text-[10px] font-black">
            {me.has_avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl(me.id)} alt="" className="h-full w-full object-cover" />
            ) : (
              (me.display_name || me.email).slice(0, 2).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {me.display_name || me.email}
          </span>
        </button>
        <QuotaBar me={me} />
        <div className="flex items-center gap-2">
          {me.is_admin && (
            <button
              onClick={onAdmin}
              className="flex-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
            >
              Admin
            </button>
          )}
          <button
            onClick={onLogout}
            className="flex-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
            title={me.email}
          >
            Sair
          </button>
        </div>
      </div>
    </aside>
  );
}
