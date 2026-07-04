"use client";

// Placeholders de carregamento (evitam a tela "de estalo" e o texto seco
// "Carregando…"). Usam a animação pulse do Tailwind.

export function BandGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-white/5 bg-surface/60 p-3">
          <div className="mb-3 aspect-square animate-pulse rounded-lg bg-white/10" />
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-white/10" />
          <div className="mt-2 h-2.5 w-1/3 animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

export function TrackListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="space-y-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="flex items-center gap-4 px-4 py-2.5">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded bg-white/10" />
          <div className="h-3.5 flex-1 animate-pulse rounded bg-white/10" />
          <div className="h-3 w-8 shrink-0 animate-pulse rounded bg-white/5" />
        </li>
      ))}
    </ul>
  );
}
