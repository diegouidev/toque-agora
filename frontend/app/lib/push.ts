// Web Push no cliente: inscrever/cancelar este dispositivo nas notificações
// de CD novo. No iOS só funciona com o app instalado na tela de início (PWA).

import { fetchPushKey, subscribePush, unsubscribePush } from "./api";

// applicationServerKey precisa ser Uint8Array (Safari não aceita base64url puro).
function b64urlToUint8(base64url: string): Uint8Array {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

// Inscrição atual deste navegador (ou null).
export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// Pede permissão, inscreve o navegador e registra no servidor.
// Deve ser chamada a partir de um clique (exigência do iOS/Safari).
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error("Este navegador não suporta notificações.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permissão de notificação negada.");
  }
  const reg = await navigator.serviceWorker.ready;
  const key = await fetchPushKey();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64urlToUint8(key) as BufferSource,
    }));
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Inscrição inválida.");
  }
  await subscribePush({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
}

// Cancela a inscrição deste navegador (local + servidor).
export async function disablePush(): Promise<void> {
  const sub = await getPushSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  await unsubscribePush(endpoint);
}
