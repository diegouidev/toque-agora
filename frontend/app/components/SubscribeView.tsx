"use client";

import { useEffect, useState } from "react";
import {
  type BillingStatus,
  type PublicPlan,
  cancelSubscription,
  fetchBillingPlans,
  fetchBillingStatus,
  subscribe,
} from "../lib/api";
import { useAuth } from "../lib/auth-context";

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function SubscribeView() {
  const { refresh } = useAuth();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadStatus() {
    try {
      setStatus(await fetchBillingStatus());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    fetchBillingPlans().then(setPlans).catch(() => setPlans([]));
    loadStatus();
  }, []);

  async function onSubscribe(planId: number) {
    setError(null);
    setBusyId(planId);
    try {
      const res = await subscribe(planId);
      if (res.invoice_url) {
        window.open(res.invoice_url, "_blank", "noopener,noreferrer");
      }
      loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao assinar");
    } finally {
      setBusyId(null);
    }
  }

  const pending = status?.status === "pending" || status?.status === "overdue";
  const active = status?.status === "active";

  async function onCancel() {
    if (!confirm("Cancelar sua assinatura? O acesso continua até o vencimento.")) return;
    try {
      setStatus(await cancelSubscription());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cancelar");
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-6">
      <div className="text-center">
        <h2 className="font-display text-2xl font-black sm:text-3xl">
          {active ? "Minha assinatura" : "Escolha seu plano"}
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Assine e libere o repertório na hora. Pagamento via PIX ou cartão.
        </p>
      </div>

      {active && (
        <div className="rounded-2xl border border-accent/40 bg-accent/10 p-5 text-center">
          <p className="text-sm text-zinc-300">Plano ativo</p>
          <p className="text-xl font-black text-accent">{status?.plan_name ?? "—"}</p>
          <p className="mt-1 text-sm text-zinc-400">
            Válido até <span className="font-semibold">{fmtDate(status?.expires_at ?? null)}</span>
          </p>
          <button
            onClick={onCancel}
            className="mt-4 rounded-full border border-white/15 px-5 py-2 text-xs font-medium text-zinc-300 hover:bg-white/10"
          >
            Cancelar assinatura
          </button>
        </div>
      )}

      {pending && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-center text-sm">
          <p className="font-semibold text-amber-300">
            {status?.status === "overdue" ? "Pagamento em atraso" : "Pagamento pendente"}
          </p>
          <p className="mt-1 text-zinc-300">
            Assim que o pagamento for confirmado, seu acesso é liberado automaticamente.
          </p>
          <button
            onClick={() => refresh()}
            className="mt-3 rounded-full bg-white/10 px-4 py-2 text-xs font-medium hover:bg-white/20"
          >
            Já paguei — atualizar
          </button>
        </div>
      )}

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      {plans.length === 0 ? (
        <p className="text-center text-sm text-zinc-500">
          Nenhum plano disponível no momento.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {plans.map((p) => (
            <div
              key={p.id}
              className="flex flex-col rounded-2xl border border-white/10 bg-surface/60 p-5"
            >
              <h3 className="text-lg font-bold">{p.name}</h3>
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
                onClick={() => onSubscribe(p.id)}
                disabled={busyId === p.id}
                className="mt-4 rounded-full bg-accent py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.02] disabled:opacity-50"
              >
                {busyId === p.id ? "Gerando pagamento…" : "Assinar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
