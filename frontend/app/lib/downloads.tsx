"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { fetchOfflineLicense, streamUrl, type Track } from "./api";
import { decrypt, encrypt, importKey } from "./offline-crypto";
import {
  clearAllTracks,
  getLicense,
  getTrack,
  listTrackIds,
  listTracks,
  removeTrack,
  saveLicense,
  saveTrack,
  usageBytes,
  type OfflineTrackMeta,
} from "./offline-db";

interface DownloadsApi {
  ids: Set<number>; // faixas baixadas
  busy: Set<number>; // baixando agora
  usage: number; // bytes usados
  licenseValid: boolean; // pode decifrar/tocar os baixados
  blocked: boolean; // tem baixados mas a licença expirou → travado
  online: boolean;
  isDownloaded: (id: number) => boolean;
  download: (track: Track) => Promise<void>;
  remove: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
  listDownloads: () => Promise<OfflineTrackMeta[]>;
  getOfflineUrl: (id: number) => Promise<string | null>;
  renewLicense: () => Promise<boolean>;
}

const DownloadsContext = createContext<DownloadsApi | null>(null);

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [usage, setUsage] = useState(0);
  const [licenseValid, setLicenseValid] = useState(false);
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const keyRef = useRef<CryptoKey | null>(null);
  const expRef = useRef<number>(0);

  const refreshUsage = useCallback(async () => {
    setUsage(await usageBytes().catch(() => 0));
  }, []);

  // Importa uma licença (b64 + validade) para a memória.
  const applyLicense = useCallback(async (keyB64: string, expiresMs: number) => {
    if (expiresMs <= Date.now()) {
      keyRef.current = null;
      expRef.current = 0;
      setLicenseValid(false);
      return false;
    }
    try {
      keyRef.current = await importKey(keyB64);
      expRef.current = expiresMs;
      setLicenseValid(true);
      return true;
    } catch {
      keyRef.current = null;
      setLicenseValid(false);
      return false;
    }
  }, []);

  const renewLicense = useCallback(async () => {
    try {
      const lic = await fetchOfflineLicense();
      const expMs = new Date(lic.expires_at).getTime();
      await saveLicense({ key: lic.key, expires_at: expMs });
      return applyLicense(lic.key, expMs);
    } catch {
      // Falhou (offline ou sem assinatura): tenta a licença guardada.
      const stored = await getLicense().catch(() => null);
      if (stored) return applyLicense(stored.key, stored.expires_at);
      setLicenseValid(false);
      return false;
    }
  }, [applyLicense]);

  // Boot: carrega ids + uso + licença guardada; se online, renova.
  useEffect(() => {
    (async () => {
      setIds(new Set(await listTrackIds().catch(() => [])));
      await refreshUsage();
      const stored = await getLicense().catch(() => null);
      if (stored) await applyLicense(stored.key, stored.expires_at);
      if (typeof navigator === "undefined" || navigator.onLine) {
        await renewLicense();
      }
    })();
  }, [applyLicense, renewLicense, refreshUsage]);

  // Reage a mudanças de conexão.
  useEffect(() => {
    function up() {
      setOnline(true);
      renewLicense();
    }
    function down() {
      setOnline(false);
    }
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [renewLicense]);

  const download = useCallback(
    async (track: Track) => {
      if (!keyRef.current) {
        const ok = await renewLicense();
        if (!ok || !keyRef.current) {
          throw new Error("Sem licença — assine para baixar offline.");
        }
      }
      setBusy((b) => new Set(b).add(track.id));
      try {
        const res = await fetch(streamUrl(track.id), {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Falha ao baixar a faixa.");
        const buf = await res.arrayBuffer();
        const enc = await encrypt(keyRef.current, buf);
        await saveTrack(
          {
            id: track.id,
            display_name: track.display_name,
            band_id: track.band_id,
            band_name: null,
            duration: track.duration,
          },
          enc.iv,
          enc.data,
        );
        setIds((s) => new Set(s).add(track.id));
        await refreshUsage();
      } finally {
        setBusy((b) => {
          const n = new Set(b);
          n.delete(track.id);
          return n;
        });
      }
    },
    [renewLicense, refreshUsage],
  );

  const remove = useCallback(
    async (id: number) => {
      await removeTrack(id);
      setIds((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      await refreshUsage();
    },
    [refreshUsage],
  );

  const clearAll = useCallback(async () => {
    await clearAllTracks();
    setIds(new Set());
    await refreshUsage();
  }, [refreshUsage]);

  const getOfflineUrl = useCallback(
    async (id: number) => {
      if (!ids.has(id) || !keyRef.current || expRef.current <= Date.now()) {
        return null;
      }
      const rec = await getTrack(id).catch(() => null);
      if (!rec) return null;
      try {
        const plain = await decrypt(keyRef.current, rec.iv, rec.data);
        const blob = new Blob([plain], { type: "audio/mpeg" });
        return URL.createObjectURL(blob);
      } catch {
        return null;
      }
    },
    [ids],
  );

  const api: DownloadsApi = {
    ids,
    busy,
    usage,
    licenseValid,
    blocked: ids.size > 0 && !licenseValid,
    online,
    isDownloaded: (id) => ids.has(id),
    download,
    remove,
    clearAll,
    listDownloads: listTracks,
    getOfflineUrl,
    renewLicense,
  };

  return (
    <DownloadsContext.Provider value={api}>{children}</DownloadsContext.Provider>
  );
}

export function useDownloads(): DownloadsApi {
  const ctx = useContext(DownloadsContext);
  if (!ctx) {
    throw new Error("useDownloads deve ser usado dentro de DownloadsProvider");
  }
  return ctx;
}
