"use client";

import { useEffect, useState } from "react";
import { type AppConfigView, fetchAppConfig, updateAppConfig } from "../lib/api";

export default function AsaasConfig() {
  const [cfg, setCfg] = useState<AppConfigView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [webhook, setWebhook] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const c = await fetchAppConfig();
      setCfg(c);
      setBaseUrl(c.asaas_base_url || "");
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const body: Record<string, string> = { asaas_base_url: baseUrl };
      if (apiKey) body.asaas_api_key = apiKey;
      if (webhook) body.asaas_webhook_token = webhook;
      const c = await updateAppConfig(body);
      setCfg(c);
      setApiKey("");
      setWebhook("");
      setMsg("Configurações salvas.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Falha ao salvar");
    }
  }

  // URL do webhook que o admin deve colar no painel do Asaas.
  const webhookUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/billing/webhook` : "";

  return (
    <form onSubmit={save} className="space-y-2 rounded-xl bg-black/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Pagamentos (Asaas)
      </p>

      <div>
        <label className="text-[11px] text-zinc-400">Chave de API (access_token)</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={cfg?.asaas_api_key_set ? "•••••• (configurada — deixe em branco p/ manter)" : "Cole a chave do Asaas"}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className="text-[11px] text-zinc-400">URL base (sandbox ou produção)</label>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://sandbox.asaas.com/api/v3"
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className="text-[11px] text-zinc-400">Token do webhook (segredo)</label>
        <input
          type="password"
          value={webhook}
          onChange={(e) => setWebhook(e.target.value)}
          placeholder={cfg?.asaas_webhook_token_set ? "•••••• (configurado)" : "Defina um token e use no painel Asaas"}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="rounded-lg bg-white/5 p-2 text-[11px] text-zinc-400">
        No painel do Asaas → Integrações → Webhooks, aponte para:
        <br />
        <code className="break-all text-zinc-200">{webhookUrl}</code>
        <br />e use o mesmo token acima no campo de autenticação do webhook.
      </div>

      {msg && <p className="text-sm text-accent">{msg}</p>}
      <button className="w-full rounded-full bg-accent py-2 text-sm font-bold text-black">
        Salvar configurações
      </button>
    </form>
  );
}
