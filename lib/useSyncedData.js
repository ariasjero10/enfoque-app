import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

/**
 * Hook de sincronización con Supabase.
 * - Al iniciar sesión, carga los datos del usuario desde la nube.
 * - Cada cambio se guarda automáticamente (debounce de 900 ms).
 * - Última escritura gana: ideal para uso personal en varios dispositivos.
 */
export function useSyncedData(userId, defaultData, migrate = (d) => d) {
  const [data, setData] = useState(null);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const loaded = useRef(false);

  // Carga inicial
  useEffect(() => {
    if (!userId) return;
    loaded.current = false;
    (async () => {
      const { data: row, error: err } = await supabase
        .from("dashboards")
        .select("data")
        .eq("user_id", userId)
        .maybeSingle();
      if (err) { setError(err.message); return; }
      if (row) {
        setData(migrate({ ...defaultData, ...row.data }));
      } else {
        // Primer inicio de sesión: crea el registro del usuario
        await supabase.from("dashboards").insert({ user_id: userId, data: defaultData });
        setData(defaultData);
      }
      loaded.current = true;
    })();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guardado automático con debounce
  useEffect(() => {
    if (!loaded.current || data === null || !userId) return;
    setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error: err } = await supabase
        .from("dashboards")
        .upsert({ user_id: userId, data, updated_at: new Date().toISOString() });
      if (err) setError(err.message); else { setError(null); setSaved(true); }
    }, 900);
    return () => clearTimeout(timer.current);
  }, [data, userId]);

  return { data, setData, saved, error };
}
