"use client";

import { useEffect, useState } from "react";
import {
  addComment,
  avatarUrl,
  deleteComment,
  fetchComments,
  type Comment,
} from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { useDialog } from "./Dialog";
import { useToast } from "./Toast";

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "agora";
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

export default function Comments({ bandId }: { bandId: number }) {
  const { me } = useAuth();
  const toast = useToast();
  const dialog = useDialog();
  const [items, setItems] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchComments(bandId)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [bandId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const c = await addComment(bandId, body);
      setItems((cs) => [c, ...cs]);
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao comentar.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: Comment) {
    const ok = await dialog.confirm({
      title: "Apagar comentário?",
      confirmLabel: "Apagar",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteComment(c.id);
      setItems((cs) => cs.filter((x) => x.id !== c.id));
    } catch {
      toast.error("Falha ao apagar.");
    }
  }

  return (
    <section className="border-t border-white/5 px-4 py-5 sm:px-5">
      <h3 className="mb-3 text-sm font-bold">
        Comentários {items.length > 0 && <span className="text-zinc-500">({items.length})</span>}
      </h3>

      <form onSubmit={submit} className="mb-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1000}
          placeholder="Escreva um comentário…"
          className="flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-full bg-accent px-4 text-sm font-semibold text-black disabled:opacity-40"
        >
          Enviar
        </button>
      </form>

      {loading ? (
        <p className="py-4 text-center text-sm text-zinc-500">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-500">
          Seja o primeiro a comentar.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => (
            <li key={c.id} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent to-indigo-600 text-[10px] font-black">
                {c.has_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl(c.user_id)} alt="" className="h-full w-full object-cover" />
                ) : (
                  c.user_name.slice(0, 2).toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold">{c.user_name}</span>{" "}
                  <span className="text-xs text-zinc-500">· {ago(c.created_at)}</span>
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-zinc-300">
                  {c.body}
                </p>
              </div>
              {(c.mine || me?.is_admin) && (
                <button
                  onClick={() => remove(c)}
                  className="shrink-0 self-start text-zinc-500 hover:text-red-400"
                  aria-label="Apagar comentário"
                  title="Apagar"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
