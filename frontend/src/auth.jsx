import { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "./api";

const C = createContext(null);
export const useAuth = () => useContext(C);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    api("/me").then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  const login = async (email, password) => {
    const r = await api("/auth/login", { method: "POST", body: { email, password } });
    setToken(r.token);
    setUser(r.user);
  };
  const register = async (f) => {
    const r = await api("/auth/register", { method: "POST", body: f });
    setToken(r.token);
    setUser(r.user);
  };
  const logout = () => { setToken(null); setUser(null); };

  return <C.Provider value={{ user, ready, login, register, logout }}>{children}</C.Provider>;
}
