"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchPublicCds, publicCoverUrl, type PublicCd } from "../lib/api";
import { BandGridSkeleton } from "../components/Skeleton";
import { MusicIcon } from "../components/icons";

export default function NovidadesPage() {
  const [cds, setCds] = useState<PublicCd[]>([]);
  const [loading, setLoading] = useState(true);
  const [genre, setGenre] = useState<string | null>(null);

  useEffect(() => {
    fetchPublicCds(120)
      .then(setCds)
      .catch(() => setCds([]))
      .finally(() => setLoading(false));
  }, []);

  // Gêneros disponíveis = união das categorias dos CDs carregados (ordenados).
  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const cd of cds) for (const c of cd.category_names) set.add(c);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [cds]);

  const shown = genre
    ? cds.filter((cd) => cd.category_names.includes(genre))
    : cds;

  return (
    <main className="min-h-screen pb-16">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-base/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="font-display text-lg font-black uppercase tracking-tight">
            Toque <span className="text-accent">Agora</span>
          </Link>
          <Link
            href="/"
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-black"
          >
            Assinar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        <h1 className="mb-4 font-display text-2xl font-black">Lançamentos e novidades</h1>

        {/* Filtro por gênero */}
        {genres.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-2">
            <button
              onClick={() => setGenre(null)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                genre === null ? "bg-accent text-black" : "bg-white/10 hover:bg-white/20"
              }`}
            >
              Todos
            </button>
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setGenre(g)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  genre === g ? "bg-accent text-black" : "bg-white/10 hover:bg-white/20"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <BandGridSkeleton count={8} />
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-sm text-zinc-500">
            {cds.length === 0
              ? "Nenhum CD disponível no momento."
              : "Nenhum CD neste gênero."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((cd) => (
              <Link
                key={cd.id}
                href={`/cd/${cd.id}`}
                className="group rounded-xl border border-white/5 bg-surface/60 p-3 transition-colors hover:bg-white/5"
              >
                <div className="relative mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600">
                  {cd.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={publicCoverUrl(cd.id)}
                      alt={cd.name}
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : (
                    <MusicIcon className="h-10 w-10 text-white/80" />
                  )}
                </div>
                <p className="truncate font-semibold" title={cd.name}>
                  {cd.name}
                </p>
                <p className="truncate text-xs text-zinc-400">
                  {cd.owner_name ?? "—"} · {cd.track_count} faixas
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
