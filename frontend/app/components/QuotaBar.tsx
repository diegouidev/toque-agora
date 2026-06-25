"use client";

import type { Me } from "../lib/api";

export default function QuotaBar({ me }: { me: Me }) {
  const pct = me.quota_gb > 0 ? Math.min(100, (me.used_gb / me.quota_gb) * 100) : 0;
  const near = pct >= 85;
  return (
    <div className="w-full max-w-[220px]">
      <div className="mb-1 flex justify-between text-[11px] text-zinc-400">
        <span>Armazenamento</span>
        <span className={near ? "text-amber-400" : ""}>
          {me.used_gb} / {me.quota_gb} GB
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full transition-[width] ${near ? "bg-amber-400" : "bg-accent"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
