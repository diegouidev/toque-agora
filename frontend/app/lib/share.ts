// Compartilhar um link: usa o menu nativo do aparelho (Web Share) quando existe;
// senão copia para a área de transferência.

export type ShareResult = "shared" | "copied" | "failed";

export async function shareOrCopy(url: string, title: string): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (e) {
      // Usuário cancelou o menu nativo → não faz nada (não copia por baixo).
      if (e instanceof Error && e.name === "AbortError") return "shared";
      // Outro erro → tenta copiar como fallback.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
