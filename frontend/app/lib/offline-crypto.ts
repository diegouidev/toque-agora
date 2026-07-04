// Criptografia dos downloads offline (AES-GCM via Web Crypto).
// A chave vem da licença emitida pelo servidor (base64 de 32 bytes = AES-256).
// O MP3 puro nunca é gravado — só o texto cifrado vai para o IndexedDB.

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function importKey(keyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    b64ToBytes(keyB64),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface Encrypted {
  iv: Uint8Array;
  data: ArrayBuffer;
}

export async function encrypt(
  key: CryptoKey,
  bytes: ArrayBuffer,
): Promise<Encrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes);
  return { iv, data };
}

export async function decrypt(
  key: CryptoKey,
  iv: Uint8Array,
  data: ArrayBuffer,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
}
