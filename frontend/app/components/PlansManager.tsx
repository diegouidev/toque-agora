"use client";

import { useEffect, useState } from "react";
import {
  type Category,
  type Plan,
  createPlan,
  deletePlan,
  fetchCategories,
  fetchPlans,
  setPlanCategories,
} from "../lib/api";

export default function PlansManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [name, setName] = useState("");

  async function load() {
    try {
      const [p, c] = await Promise.all([fetchPlans(), fetchCategories()]);
      setPlans(p);
      setCats(c);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createPlan(name.trim());
      setName("");
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Falha ao criar plano");
    }
  }

  async function toggleCat(plan: Plan, cat: Category) {
    const has = plan.categories.some((c) => c.id === cat.id);
    const ids = has
      ? plan.categories.filter((c) => c.id !== cat.id).map((c) => c.id)
      : [...plan.categories.map((c) => c.id), cat.id];
    // otimista
    setPlans((ps) =>
      ps.map((p) =>
        p.id === plan.id
          ? { ...p, categories: cats.filter((c) => ids.includes(c.id)) }
          : p,
      ),
    );
    try {
      await setPlanCategories(plan.id, ids);
    } catch {
      load();
    }
  }

  async function remove(plan: Plan) {
    if (!confirm(`Excluir o plano "${plan.name}"? Os usuários ficam sem plano.`)) return;
    await deletePlan(plan.id);
    load();
  }

  return (
    <div className="space-y-3 rounded-xl bg-black/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Planos (pacotes de categorias)
      </p>

      <form onSubmit={add} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Novo plano (ex. Plano Forró)"
          className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button className="rounded-lg bg-accent px-4 text-sm font-semibold text-black">
          Criar
        </button>
      </form>

      {plans.length === 0 && (
        <p className="text-xs text-zinc-500">Nenhum plano ainda.</p>
      )}

      {plans.map((p) => (
        <div key={p.id} className="rounded-lg bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">
              {p.name}{" "}
              <span className="text-xs font-normal text-zinc-400">
                · {p.user_count} usuário{p.user_count === 1 ? "" : "s"}
              </span>
            </p>
            <button
              onClick={() => remove(p)}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Excluir
            </button>
          </div>
          {/* Categorias do plano (clicáveis) */}
          {cats.length === 0 ? (
            <p className="text-xs text-zinc-500">Crie categorias primeiro.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {cats.map((c) => {
                const on = p.categories.some((x) => x.id === c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleCat(p, c)}
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                      on ? "bg-accent text-black" : "bg-white/10 text-zinc-300 hover:bg-white/20"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
