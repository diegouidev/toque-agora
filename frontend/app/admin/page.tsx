"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AdminPanel from "../components/AdminPanel";
import { useAuth } from "../lib/auth-context";

export default function AdminPage() {
  const { me, loading } = useAuth();
  const router = useRouter();

  // Guard: só admin entra. Enquanto carrega o /me, aguarda; se não for admin, volta.
  useEffect(() => {
    if (!loading && (!me || !me.is_admin)) {
      router.replace("/");
    }
  }, [loading, me, router]);

  if (loading || !me || !me.is_admin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-400">
        Carregando…
      </div>
    );
  }

  return <AdminPanel asPage onClose={() => router.push("/")} />;
}
