"use client";

import { useState } from "react";
import { Flame, Mail, Lock, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

/**
 * Pantalla de acceso: iniciar sesión o crear cuenta con correo y contraseña.
 * La sesión queda guardada en el dispositivo hasta que el usuario cierre sesión.
 */
export default function Login() {
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) { setMsg({ t: "error", x: "Escribe tu correo y contraseña." }); return; }
    setLoading(true); setMsg(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ t: "error", x: "No pudimos iniciar sesión: " + error.message });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg({ t: "error", x: "No pudimos crear la cuenta: " + error.message });
      else if (data.user && !data.session)
        setMsg({ t: "ok", x: "Cuenta creada. Revisa tu correo y confirma tu dirección para poder entrar." });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8"
        style={{ boxShadow: "0 4px 24px rgba(16,24,40,.06)" }}>
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center mb-3">
            <Flame size={22} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-zinc-900">Enfoque</h1>
          <p className="text-sm text-zinc-400">Tu dashboard de productividad</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 focus-within:border-indigo-500 transition-colors">
            <Mail size={15} className="text-zinc-400" />
            <input type="email" placeholder="Correo electrónico" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 outline-none text-sm text-zinc-800 placeholder-zinc-400 bg-transparent" />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 focus-within:border-indigo-500 transition-colors">
            <Lock size={15} className="text-zinc-400" />
            <input type="password" placeholder="Contraseña (mínimo 6 caracteres)" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="flex-1 outline-none text-sm text-zinc-800 placeholder-zinc-400 bg-transparent" />
          </div>
        </div>

        {msg && (
          <p className={`text-xs mt-3 ${msg.t === "error" ? "text-rose-500" : "text-emerald-600"}`}>{msg.x}</p>
        )}

        <button onClick={submit} disabled={loading}
          className="w-full mt-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold py-2.5 transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2">
          {loading && <Loader2 size={15} className="animate-spin" />}
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </button>

        <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(null); }}
          className="w-full mt-3 text-xs text-zinc-400 hover:text-indigo-500 transition-colors">
          {mode === "login" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Iniciar sesión"}
        </button>
      </div>
    </div>
  );
}
