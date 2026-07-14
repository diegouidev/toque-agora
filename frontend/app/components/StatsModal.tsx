"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMyStats, type MeStats, type StatItem } from "../lib/api";
import { useEscClose } from "../lib/useEscClose";
import { CloseIcon } from "./icons";

function fmtSince(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// "AAAA-MM" do mês atual deslocado em `offset` meses (dia 1 evita estouro).
function monthKey(offset: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Rótulo humano de um "AAAA-MM" (ex.: "julho de 2026").
function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

type Mode = { id: string; label: string; month?: string };

function Rank({ title, items }: { title: string; items: StatItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">{title}</h3>
      <ol className="space-y-1">
        {items.map((it, i) => (
          <li
            key={`${it.label}-${i}`}
            className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
          >
            <span className="w-5 shrink-0 text-center text-sm font-black text-accent">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{it.label}</p>
              {it.sublabel && (
                <p className="truncate text-xs text-zinc-400">{it.sublabel}</p>
              )}
            </div>
            <span className="shrink-0 text-xs tabular-nums text-zinc-400">
              {it.plays}×
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ---------- Imagem compartilhável (formato story 1080×1920) ----------

// Encurta um texto até caber em `maxWidth` px (com reticências).
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) {
    t = t.slice(0, -1);
  }
  return `${t}…`;
}

function drawCard(stats: MeStats, periodLabel: string): HTMLCanvasElement {
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Fundo: gradiente da marca (rosa → laranja) com base escura.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#be123c");
  grad.addColorStop(0.55, "#ea580c");
  grad.addColorStop(1, "#1c1007");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";

  // Cabeçalho
  ctx.font = "800 44px system-ui, -apple-system, sans-serif";
  ctx.fillText("T O Q U E   A G O R A", W / 2, 160);
  ctx.font = "900 92px system-ui, -apple-system, sans-serif";
  ctx.fillText("Minha retrospectiva", W / 2, 300);
  ctx.font = "600 52px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(periodLabel, W / 2, 380);

  // Número grande: minutos
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 260px system-ui, -apple-system, sans-serif";
  ctx.fillText(String(stats.total_minutes.toLocaleString("pt-BR")), W / 2, 700);
  ctx.font = "700 56px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText("minutos ouvidos", W / 2, 790);

  // Linha de totais
  ctx.font = "700 48px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(
    `${stats.total_plays.toLocaleString("pt-BR")} reproduções  ·  ` +
      `${stats.unique_tracks.toLocaleString("pt-BR")} faixas`,
    W / 2,
    900,
  );

  // Destaques (top 1 de cada ranking)
  const rows: Array<[string, StatItem | undefined]> = [
    ["TOP FAIXA", stats.top_tracks[0]],
    ["TOP CD", stats.top_bands[0]],
    ["TOP GÊNERO", stats.top_categories[0]],
  ];
  let y = 1060;
  for (const [title, item] of rows) {
    if (!item) continue;
    // painel
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    const panelH = 210;
    const r = 28;
    const x = 80;
    const w = W - 160;
    ctx.beginPath();
    ctx.roundRect(x, y, w, panelH, r);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.font = "800 38px system-ui, -apple-system, sans-serif";
    ctx.fillText(title, W / 2, y + 66);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 58px system-ui, -apple-system, sans-serif";
    ctx.fillText(fitText(ctx, item.label, w - 80), W / 2, y + 140);
    if (item.sublabel) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "600 40px system-ui, -apple-system, sans-serif";
      ctx.fillText(fitText(ctx, item.sublabel, w - 80), W / 2, y + 190);
    }
    y += panelH + 40;
  }

  // Rodapé
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = "700 42px system-ui, -apple-system, sans-serif";
  ctx.fillText(window.location.host || "TOQUE AGORA", W / 2, H - 100);
  return canvas;
}

async function shareCard(stats: MeStats, periodLabel: string): Promise<void> {
  const canvas = drawCard(stats, periodLabel);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Falha ao gerar a imagem.");
  const file = new File([blob], "minha-retrospectiva.png", { type: "image/png" });

  // Compartilhamento nativo (WhatsApp/Instagram) quando disponível…
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Minha retrospectiva" });
      return;
    } catch {
      /* usuário cancelou ou não suportado — cai no download */
    }
  }
  // …senão baixa o PNG.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "minha-retrospectiva.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function StatsModal({ onClose }: { onClose: () => void }) {
  useEscClose(onClose);
  const modes = useMemo<Mode[]>(
    () => [
      { id: "cur", label: "Este mês", month: monthKey(0) },
      { id: "prev", label: "Mês passado", month: monthKey(-1) },
      { id: "all", label: "Geral" },
    ],
    [],
  );
  const [mode, setMode] = useState<Mode>(modes[0]);
  const [stats, setStats] = useState<MeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchMyStats(mode.month)
      .then(setStats)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [mode]);

  const empty = stats && stats.total_plays === 0;
  const periodLabel = mode.month ? monthLabel(mode.month) : "desde o início";

  async function onShare() {
    if (!stats || sharing) return;
    setSharing(true);
    try {
      await shareCard(stats, periodLabel);
    } finally {
      setSharing(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Minha retrospectiva"
        className="w-full max-w-md space-y-5 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-black">Minha retrospectiva</h2>
            <p className="text-xs text-zinc-400">
              {mode.month
                ? periodLabel
                : stats?.since
                  ? `desde ${fmtSince(stats.since)}`
                  : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Período */}
        <div className="flex gap-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode.id === m.id
                  ? "bg-accent text-black"
                  : "bg-white/10 text-zinc-300 hover:bg-white/15"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-zinc-500">Calculando…</p>
        ) : error ? (
          <p className="py-10 text-center text-sm text-red-400">
            Não foi possível carregar a retrospectiva.
          </p>
        ) : empty ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            {mode.month
              ? "Nenhuma reprodução neste período. Toque algumas faixas e volte aqui!"
              : "Você ainda não tem histórico. Toque algumas faixas e volte aqui!"}
          </p>
        ) : (
          stats && (
            <>
              {/* Números do topo */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-white/5 py-3">
                  <p className="text-2xl font-black text-accent">{stats.total_minutes}</p>
                  <p className="text-[11px] text-zinc-400">minutos</p>
                </div>
                <div className="rounded-xl bg-white/5 py-3">
                  <p className="text-2xl font-black text-accent">{stats.total_plays}</p>
                  <p className="text-[11px] text-zinc-400">reproduções</p>
                </div>
                <div className="rounded-xl bg-white/5 py-3">
                  <p className="text-2xl font-black text-accent">{stats.unique_tracks}</p>
                  <p className="text-[11px] text-zinc-400">faixas</p>
                </div>
              </div>

              <Rank title="Faixas mais tocadas" items={stats.top_tracks} />
              <Rank title="CDs mais tocados" items={stats.top_bands} />
              <Rank title="Gêneros favoritos" items={stats.top_categories} />

              <button
                onClick={onShare}
                disabled={sharing}
                className="w-full rounded-xl bg-accent px-4 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.01] disabled:opacity-60"
              >
                {sharing ? "Gerando imagem…" : "📤 Compartilhar retrospectiva"}
              </button>
            </>
          )
        )}
      </div>
    </div>
  );
}
