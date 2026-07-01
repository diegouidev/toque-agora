"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchBillingPlans,
  fetchPublicCds,
  publicCoverUrl,
  type PublicCd,
  type PublicPlan,
} from "../lib/api";
import LoginScreen from "./LoginScreen";
import { MusicIcon } from "./icons";

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function LandingView() {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [cds, setCds] = useState<PublicCd[]>([]);
  const [auth, setAuth] = useState<null | "login" | "register">(null);

  useEffect(() => {
    fetchBillingPlans().then(setPlans).catch(() => setPlans([]));
    fetchPublicCds(12).then(setCds).catch(() => setCds([]));
  }, []);

  if (auth) {
    return <LoginScreen initialMode={auth} onBack={() => setAuth(null)} />;
  }

  return (
    <main className="min-h-screen">
      {/* Topo */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-base/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="font-display text-lg font-black uppercase tracking-tight sm:text-xl">
            Toque <span className="text-accent">Agora</span>
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAuth("login")}
              className="rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium hover:bg-white/20"
            >
              Entrar
            </button>
            <button
              onClick={() => setAuth("register")}
              className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-black"
            >
              Criar conta
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pb-8 pt-12 text-center sm:px-6">
        <h2 className="font-display text-3xl font-black leading-tight sm:text-5xl">
          Todo o repertório na palma da mão
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-zinc-400">
          Assine e ouça os CDs completos onde quiser. Ouça uma prévia de 30s antes de
          assinar.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={() => setAuth("register")}
            className="rounded-full bg-accent px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.03]"
          >
            Assinar agora
          </button>
          <Link
            href="/novidades"
            className="rounded-full bg-white/10 px-6 py-3 text-sm font-semibold hover:bg-white/20"
          >
            Ver novidades
          </Link>
        </div>
      </section>

      {/* Planos */}
      {plans.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <h3 className="mb-4 text-lg font-bold">Planos</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.id}
                className="flex flex-col rounded-2xl border border-white/10 bg-surface/60 p-5"
              >
                <h4 className="text-lg font-bold">{p.name}</h4>
                <p className="mt-1 text-2xl font-black text-accent">
                  {brl(p.price_cents)}
                  <span className="text-sm font-normal text-zinc-400">/mês</span>
                </p>
                {p.category_names.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {p.category_names.map((c) => (
                      <span key={c} className="rounded-full bg-white/10 px-2.5 py-1 text-xs">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setAuth("register")}
                  className="mt-4 rounded-full bg-accent py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.02]"
                >
                  Assinar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CDs em destaque */}
      {cds.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-bold">CDs em destaque</h3>
            <Link href="/novidades" className="text-xs text-accent hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {cds.map((cd) => (
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
        </section>
      )}

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-500">
        TOQUE AGORA · assine e ouça onde quiser
      </footer>
    </main>
  );
}
