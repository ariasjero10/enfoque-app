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
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "#0A0A0B" }}>
      <div className="w-full max-w-sm rounded-3xl border border-white/[0.06] p-8"
        style={{ background: "#151517", boxShadow: "inset 0 1px 0 rgba(255,255,255,.04), 0 24px 48px -24px rgba(0,0,0,.75)" }}>
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
            style={{ background: "linear-gradient(180deg,#34D399,#10B981)", boxShadow: "0 4px 14px rgba(52,211,153,.35)" }}>
            <Flame size={22} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-50">Enfoque</h1>
          <p className="text-sm text-zinc-500">Tu dashboard de productividad</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 focus-within:border-emerald-400 transition-colors">
            <Mail size={15} className="text-zinc-500" />
            <input type="email" placeholder="Correo electrónico" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 outline-none text-sm text-zinc-100 placeholder-zinc-600 bg-transparent" />
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 focus-within:border-emerald-400 transition-colors">
            <Lock size={15} className="text-zinc-500" />
            <input type="password" placeholder="Contraseña (mínimo 6 caracteres)" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="flex-1 outline-none text-sm text-zinc-100 placeholder-zinc-600 bg-transparent" />
          </div>
        </div>

        {msg && (
          <p className={`text-xs mt-3 ${msg.t === "error" ? "text-rose-400" : "text-emerald-400"}`}>{msg.x}</p>
        )}

        <button onClick={submit} disabled={loading}
          className="enfoque-primary w-full mt-5 rounded-full text-white text-sm font-semibold py-2.5 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
          {loading && <Loader2 size={15} className="animate-spin" />}
          {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
        </button>

        <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMsg(null); }}
          className="w-full mt-3 text-xs text-zinc-500 hover:text-emerald-400 transition-colors">
          {mode === "login" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Iniciar sesión"}
        </button>
      </div>
    </div>
  );
}
