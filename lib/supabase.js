import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para el navegador.
 * Las claves se leen de las variables de entorno (.env.local en desarrollo,
 * Environment Variables en Vercel para producción).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

export const supabase = createClient(url, anonKey);
export const supabaseConfigured =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
