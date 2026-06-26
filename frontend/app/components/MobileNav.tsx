"use client";

import type { Tab } from "./Sidebar";
import { HomeIcon, LibraryIcon, SearchIcon } from "./icons";

interface Props {
  tab: Tab;
  onTab: (tab: Tab) => void;
}

const NAV: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
  { id: "home", label: "Início", Icon: HomeIcon },
  { id: "search", label: "Buscar", Icon: SearchIcon },
  { id: "library", label: "Biblioteca", Icon: LibraryIcon },
];

/** Barra de abas inferior (mobile/tablet). O mini-player fica logo acima dela. */
export default function MobileNav({ tab, onTab }: Props) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
        {NAV.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => onTab(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
              tab === id ? "text-accent" : "text-zinc-400"
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
