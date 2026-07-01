import type { Metadata } from "next";
import CdPageClient from "./CdPageClient";

// Definir NEXT_PUBLIC_SITE_URL (ex.: https://play.diegodev.app.br) habilita a
// prévia de imagem (capa do CD) ao compartilhar o link no WhatsApp/Instagram.
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export function generateMetadata({
  params,
}: {
  params: { id: string };
}): Metadata {
  const cover = `${SITE}/api/public/cds/${params.id}/cover`;
  return {
    title: "CD — TOQUE AGORA",
    description: "Ouça a prévia de 30s e assine para o CD completo.",
    openGraph: {
      title: "TOQUE AGORA",
      description: "Ouça a prévia de 30s e assine para o CD completo.",
      images: SITE ? [cover] : [],
    },
  };
}

export default function Page({ params }: { params: { id: string } }) {
  return <CdPageClient id={Number(params.id)} />;
}
