"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  cacheMe,
  clearCachedMe,
  fetchMe,
  getCachedMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
  type Me,
} from "./api";

interface AuthState {
  me: Me | null;
  loading: boolean;
  // true quando o `me` veio do cache local porque o app está sem internet.
  offline: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const m = await fetchMe();
      cacheMe(m);
      setMe(m);
      setOffline(false);
    } catch {
      // Sem rede? Usa o último `me` em cache para o app abrir offline
      // (tela de Baixados). Se estamos online, é logout de verdade.
      const cached =
        typeof navigator !== "undefined" && !navigator.onLine
          ? getCachedMe()
          : null;
      if (cached) {
        setMe(cached);
        setOffline(true);
      } else {
        setMe(null);
        setOffline(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const m = await apiLogin(email, password); // seta o cookie e devolve /me
    cacheMe(m);
    setMe(m);
    setOffline(false);
  }, []);

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const m = await apiRegister(email, password, displayName);
      cacheMe(m);
      setMe(m);
      setOffline(false);
    },
    [],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    clearCachedMe();
    setMe(null);
    setOffline(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ me, loading, offline, login, register, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
