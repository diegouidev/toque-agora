// Capa "fake" determinística a partir do nome (gradiente + iniciais).
// Compartilhado entre BandGrid e PlayerBar (antes duplicado nos dois).

const GRADIENTS = [
  "from-rose-500 to-orange-500",
  "from-accent to-emerald-700",
  "from-indigo-500 to-purple-600",
  "from-sky-500 to-blue-700",
  "from-fuchsia-500 to-pink-600",
  "from-amber-400 to-red-500",
  "from-teal-400 to-cyan-600",
];

export function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "♪").concat(words[1]?.[0] ?? "").toUpperCase();
}
