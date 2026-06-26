"use client";

import { useState } from "react";
import { setBandCategories, type Category } from "../lib/api";
import { PlusIcon } from "./icons";

interface Props {
  bandId: number;
  current: Category[];
  all: Category[]; // todas as categorias existentes (para o admin escolher)
  isAdmin: boolean;
  onChange: (cats: Category[]) => void;
}

export default function BandCategories({
  bandId,
  current,
  all,
  isAdmin,
  onChange,
}: Props) {
  const [menu, setMenu] = useState(false);

  async function update(next: Category[]) {
    onChange(next); // otimista
    try {
      await setBandCategories(bandId, next.map((c) => c.id));
    } catch {
      /* mantém o estado otimista; recarregar resolve */
    }
  }

  function add(cat: Category) {
    setMenu(false);
    if (current.some((c) => c.id === cat.id)) return;
    update([...current, cat]);
  }
  function remove(cat: Category) {
    update(current.filter((c) => c.id !== cat.id));
  }

  const available = all.filter((c) => !current.some((x) => x.id === c.id));

  if (!isAdmin && current.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
      {current.map((c) => (
        <span
          key={c.id}
          className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs"
        >
          {c.name}
          {isAdmin && (
            <button
              onClick={() => remove(c)}
              className="text-zinc-300 hover:text-red-400"
              aria-label={`Remover ${c.name}`}
            >
              ✕
            </button>
          )}
        </span>
      ))}

      {isAdmin && (
        <div className="relative">
          <button
            onClick={() => setMenu((m) => !m)}
            className="flex items-center gap-1 rounded-full border border-dashed border-white/30 px-2.5 py-1 text-xs text-zinc-300 hover:bg-white/10"
          >
            <PlusIcon className="h-3 w-3" /> Categoria
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute left-0 top-9 z-50 max-h-56 w-44 overflow-y-auto rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-2xl">
                {available.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-zinc-500">
                    Sem categorias disponíveis. Crie no painel admin.
                  </p>
                ) : (
                  available.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => add(c)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
                    >
                      {c.name}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
