"use client";

import { useState, useEffect } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useSyncedData } from "@/lib/useSyncedData";
import DashboardApp, { defaultData } from "@/components/DashboardApp";
import Login from "@/components/Login";

/**
 * Página principal:
 * 1. Verifica si hay sesión activa (Supabase Auth).
 * 2. Sin sesión -> pantalla de acceso.
 * 3. Con sesión -> carga los datos del usuario y muestra el dashboard.
 */
export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id ?? null;
  const { data, setData, saved, error } = useSyncedData(userId, defaultData);

  if (!supabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <div className="max-w-md text-center">
          <h1 className="font-bold text-zinc-900 mb-2">Falta configurar Supabase</h1>
          <p className="text-sm text-zinc-500">
            Crea el archivo <code className="text-indigo-600">.env.local</code> a partir de{" "}
            <code className="text-indigo-600">.env.local.example</code> con la URL y la clave anon
            de tu proyecto (o configúralas como variables de entorno en Vercel) y vuelve a desplegar.
          </p>
        </div>
      </div>
    );
  }

  if (checking || (session && data === null && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!session) return <Login />;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <div className="max-w-md text-center">
          <h1 className="font-bold text-zinc-900 mb-2">No pudimos conectar con la base de datos</h1>
          <p className="text-sm text-zinc-500 mb-1">Verifica que ejecutaste el script <code>supabase/schema.sql</code> en tu proyecto de Supabase.</p>
          <p className="text-xs text-zinc-400">Detalle: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardApp
      data={data}
      setData={setData}
      saved={saved}
      userEmail={session.user.email}
      onSignOut={() => supabase.auth.signOut()}
    />
  );
}
