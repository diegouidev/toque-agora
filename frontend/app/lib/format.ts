// Helpers de formatação de tempo/duração, reutilizados nas views.

/** Segundos → "m:ss" (ex.: 184 → "3:04"). */
export function fmtDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Soma a duração de uma lista de faixas e devolve um rótulo humano.
 * Ex.: "48 min" ou "1 h 12 min". Retorna null se nenhuma faixa tem duração
 * conhecida (o ID3 pode não trazer a duração de todas).
 */
export function totalDurationLabel(
  tracks: { duration: number }[],
): string | null {
  const total = tracks.reduce((sum, t) => sum + (t.duration || 0), 0);
  if (total <= 0) return null;
  const mins = Math.round(total / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
