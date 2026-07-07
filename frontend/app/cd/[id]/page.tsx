import type { Metadata } from "next";
import { headers } from "next/headers";
import CdPageClient from "./CdPageClient";

// Origem pública do site — usada para montar URLs ABSOLUTAS no Open Graph
// (WhatsApp/Instagram só mostram a capa se a URL for absoluta). Prioriza
// NEXT_PUBLIC_SITE_URL; senão deriva do host da requisição.
function siteOrigin(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const origin = siteOrigin();
  const cover = origin ? `${origin}/api/public/cds/${params.id}/cover` : undefined;

  let name = "CD";
  let owner = "";
  let count = 0;
  if (origin) {
    try {
      const res = await fetch(`${origin}/api/public/cds/${params.id}`, {
        next: { revalidate: 300 },
      });
      if (res.ok) {
        const cd = await res.json();
        name = cd.name ?? name;
        owner = cd.owner_name ?? "";
        count = cd.track_count ?? 0;
      }
    } catch {
      /* mantém genérico se não conseguir buscar */
    }
  }

  const desc = `${owner ? owner + " · " : ""}${count} faixas · Ouça a prévia de 30s e assine para o CD completo.`;
  const images = cover
    ? [{ url: cover, width: 600, height: 600, alt: name }]
    : [];

  return {
    title: `${name} — TOQUE AGORA`,
    description: desc,
    openGraph: {
      title: name,
      description: desc,
      siteName: "TOQUE AGORA",
      type: "website",
      images,
      ...(origin ? { url: `${origin}/cd/${params.id}` } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description: desc,
      images: cover ? [cover] : [],
    },
  };
}

export default function Page({ params }: { params: { id: string } }) {
  return <CdPageClient id={Number(params.id)} />;
}
