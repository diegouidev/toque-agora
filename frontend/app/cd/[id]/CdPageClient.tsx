"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchPublicCd,
  publicCoverUrl,
  type PublicCdDetail,
} from "../../lib/api";
import Marquee from "../../components/Marquee";
import PreviewPlayer from "../../components/PreviewPlayer";
import { MusicIcon } from "../../components/icons";

export default function CdPageClient({ id }: { id: number }) {
  const [cd, setCd] = useState<PublicCdDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchPublicCd(id)
      .then(setCd)
      .catch(() => setNotFound(true));
  }, [id]);

  function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      navigator.share({ title: cd?.name ?? "CD", url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    }
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-5 text-center">
        <p className="text-zinc-400">Este CD não está disponível.</p>
        <Link href="/" className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-black">
          Voltar ao início
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-16">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-base/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
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

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Cabeçalho do CD */}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
          <div className="flex h-44 w-44 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-2xl">
            {cd?.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={publicCoverUrl(id)}
                alt={cd?.name ?? ""}
                className="h-full w-full object-cover"
              />
            ) : (
              <MusicIcon className="h-16 w-16 text-white/80" />
            )}
          </div>
          <div className="w-full min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">CD</p>
            <Marquee
              text={cd?.name ?? "…"}
              active
              className="font-display text-2xl font-black sm:text-3xl"
            />
            <p className="mt-1 text-sm text-zinc-400">
              {cd?.owner_name ?? "—"} · {cd?.track_count ?? 0} faixas
            </p>
            {cd && cd.category_names.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {cd.category_names.map((c) => (
                  <span key={c} className="rounded-full bg-white/10 px-2.5 py-1 text-xs">
                    {c}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-4 flex justify-center gap-2 sm:justify-start">
              <Link
                href="/"
                className="rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.03]"
              >
                Assinar para ouvir tudo
              </Link>
              <button
                onClick={share}
                className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold hover:bg-white/20"
              >
                {copied ? "Link copiado!" : "Compartilhar"}
              </button>
            </div>
          </div>
        </div>

        {/* Tracklist com prévia */}
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">Faixas</h2>
          <p className="mb-3 text-sm text-zinc-400">
            Ouça 30 segundos de cada faixa. Assine para ouvir os CDs completos.
          </p>
          <div className="overflow-hidden rounded-2xl border border-white/5 bg-surface/40 p-2">
            {cd ? (
              <PreviewPlayer tracks={cd.tracks} />
            ) : (
              <p className="p-6 text-center text-sm text-zinc-500">Carregando…</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
