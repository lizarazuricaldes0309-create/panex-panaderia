import { useState } from "react";
import Admin from "./Admin";
import { Button } from "@/components/ui/button";

export default function PasswordAdmin() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (authenticated) return <Admin />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (!response.ok) throw new Error("Contraseña incorrecta.");
      setAuthenticated(true);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="flex min-h-screen items-center justify-center bg-[#fffaf4] p-6"><form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-8 text-center shadow-xl"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#a64b2a] text-2xl text-white">✦</div><h1 className="mt-5 font-display text-3xl text-[#4e2b1f]">Panel privado Panex</h1><p className="mt-3 text-sm leading-6 text-[#806f64]">Introduce la contraseña de administración para continuar.</p><input autoFocus type="password" value={password} onChange={event => setPassword(event.target.value)} className="mt-6 w-full rounded-2xl border border-[#eadfd2] bg-white px-4 py-3 text-center outline-none focus:border-[#a64b2a]" placeholder="Contraseña" autoComplete="current-password" /><Button disabled={loading || !password} className="mt-4 w-full rounded-full bg-[#a64b2a] py-3 text-white hover:bg-[#873b22]">{loading ? "Comprobando…" : "Entrar al panel"}</Button>{error && <p className="mt-4 text-sm font-semibold text-[#bd3b32]">{error}</p>}</form></div>;
}
