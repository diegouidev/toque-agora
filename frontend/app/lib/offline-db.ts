// Armazenamento offline no IndexedDB: faixas cifradas + licença.
// Não há dependência externa — usa a IndexedDB nativa com um wrapper Promise.

const DB_NAME = "toqueagora-offline";
const DB_VERSION = 1;
const STORE_TRACKS = "tracks";
const STORE_META = "meta"; // licença e outros

export interface OfflineTrackMeta {
  id: number;
  display_name: string;
  band_id: number;
  band_name: string | null;
  duration: number;
}

interface StoredTrack extends OfflineTrackMeta {
  iv: ArrayBuffer;
  data: ArrayBuffer; // ciphertext
  size: number; // tamanho cifrado (para o cálculo de uso)
  savedAt: number;
}

export interface StoredLicense {
  key: string; // base64 da chave AES
  expires_at: number; // epoch ms
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        db.createObjectStore(STORE_TRACKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "k" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      }),
  );
}

// ---------- Faixas ----------
export async function saveTrack(
  meta: OfflineTrackMeta,
  iv: Uint8Array,
  data: ArrayBuffer,
): Promise<void> {
  const rec: StoredTrack = {
    ...meta,
    iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength),
    data,
    size: data.byteLength,
    savedAt: Date.now(),
  };
  await tx(STORE_TRACKS, "readwrite", (s) => s.put(rec));
}

export async function getTrack(
  id: number,
): Promise<{ iv: Uint8Array; data: ArrayBuffer } | null> {
  const rec = (await tx(STORE_TRACKS, "readonly", (s) =>
    s.get(id),
  )) as StoredTrack | undefined;
  if (!rec) return null;
  return { iv: new Uint8Array(rec.iv), data: rec.data };
}

export async function listTracks(): Promise<OfflineTrackMeta[]> {
  const all = (await tx(STORE_TRACKS, "readonly", (s) =>
    s.getAll(),
  )) as StoredTrack[];
  return all
    .sort((a, b) => b.savedAt - a.savedAt)
    .map(({ id, display_name, band_id, band_name, duration }) => ({
      id,
      display_name,
      band_id,
      band_name,
      duration,
    }));
}

export async function listTrackIds(): Promise<number[]> {
  const keys = (await tx(STORE_TRACKS, "readonly", (s) =>
    s.getAllKeys(),
  )) as IDBValidKey[];
  return keys.map((k) => Number(k));
}

export async function removeTrack(id: number): Promise<void> {
  await tx(STORE_TRACKS, "readwrite", (s) => s.delete(id));
}

export async function clearAllTracks(): Promise<void> {
  await tx(STORE_TRACKS, "readwrite", (s) => s.clear());
}

export async function usageBytes(): Promise<number> {
  const all = (await tx(STORE_TRACKS, "readonly", (s) =>
    s.getAll(),
  )) as StoredTrack[];
  return all.reduce((sum, r) => sum + (r.size || 0), 0);
}

// ---------- Licença ----------
export async function saveLicense(lic: StoredLicense): Promise<void> {
  await tx(STORE_META, "readwrite", (s) => s.put({ k: "license", ...lic }));
}

export async function getLicense(): Promise<StoredLicense | null> {
  const rec = (await tx(STORE_META, "readonly", (s) => s.get("license"))) as
    | (StoredLicense & { k: string })
    | undefined;
  if (!rec) return null;
  return { key: rec.key, expires_at: rec.expires_at };
}

export async function clearLicense(): Promise<void> {
  await tx(STORE_META, "readwrite", (s) => s.delete("license"));
}
