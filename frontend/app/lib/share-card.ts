// Gera um "card" quadrado (estilo story do Spotify) com a capa + nome do CD +
// marca, para compartilhar como IMAGEM (ex.: status do WhatsApp).

function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Mesma origem: NÃO setar crossOrigin (mantém o cookie do cover autenticado
    // e não "taina" o canvas).
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// object-fit: cover
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.width / img.height;
  const r = w / h;
  let sw = img.width;
  let sh = img.height;
  let sx = 0;
  let sy = 0;
  if (ir > r) {
    sw = img.height * r;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / r;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines - 1) break;
    } else {
      cur = test;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // Reticências se sobrou texto.
  const used = lines.join(" ").split(/\s+/).length;
  if (used < words.length && lines.length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/…?$/, "…");
  }
  return lines;
}

export async function buildShareCard(
  coverSrc: string,
  title: string,
  subtitle: string,
): Promise<Blob | null> {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#0b0b0f";
  ctx.fillRect(0, 0, W, H);

  const img = await loadImg(coverSrc);
  if (img) {
    // Fundo: capa desfocada/escurecida preenchendo tudo.
    ctx.save();
    ctx.filter = "blur(48px) brightness(0.45)";
    drawCover(ctx, img, -80, -80, W + 160, H + 160);
    ctx.restore();
    ctx.fillStyle = "rgba(11,11,15,0.5)";
    ctx.fillRect(0, 0, W, H);
  }

  // Capa central.
  const size = 600;
  const cx = (W - size) / 2;
  const cy = 150;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 20;
  roundRect(ctx, cx, cy, size, size, 40);
  ctx.fillStyle = "#1db954";
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, cx, cy, size, size, 40);
  ctx.clip();
  if (img) drawCover(ctx, img, cx, cy, size, size);
  ctx.restore();

  // Título.
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 66px system-ui, sans-serif";
  const titleY = cy + size + 120;
  const lines = wrapLines(ctx, title, W - 140, 2);
  lines.forEach((ln, i) => ctx.fillText(ln, W / 2, titleY + i * 78));

  // Subtítulo.
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.font = "500 40px system-ui, sans-serif";
  ctx.fillText(subtitle, W / 2, titleY + lines.length * 78 + 24);

  // Marca no rodapé: TOQUE AGORA.
  ctx.font = "800 46px system-ui, sans-serif";
  const t1 = "TOQUE ";
  const t2 = "AGORA";
  const w1 = ctx.measureText(t1).width;
  const w2 = ctx.measureText(t2).width;
  const startX = (W - (w1 + w2)) / 2;
  const by = H - 90;
  ctx.textAlign = "left";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(t1, startX, by);
  ctx.fillStyle = "#1db954";
  ctx.fillText(t2, startX + w1, by);

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
}

export type ImageShareResult = "shared" | "downloaded" | "failed";

export async function shareImage(
  blob: Blob,
  filename: string,
  text: string,
): Promise<ImageShareResult> {
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
  };
  try {
    const file = new File([blob], filename, { type: "image/png" });
    if (nav.canShare && nav.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return "shared";
    }
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return "shared";
  }
  // Fallback: baixa a imagem (o usuário posta manualmente).
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return "downloaded";
  } catch {
    return "failed";
  }
}
