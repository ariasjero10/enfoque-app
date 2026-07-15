import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { pendientesDe } from "@/lib/pendientes";

export const runtime = "nodejs";        // web-push necesita Node, no Edge
export const dynamic = "force-dynamic";

/**
 * Recordatorio con la app cerrada.
 *
 * Vercel llama a esta ruta a varias horas fijas (ver vercel.json). En cada
 * llamada miramos qué hora es en Colombia y solo avisamos a quien haya elegido
 * esa hora en la app. Así puedes cambiar tu hora desde la app sin volver a
 * desplegar nada.
 *
 * Nota: en el plan gratuito de Vercel la ejecución no es puntual al minuto,
 * puede ocurrir en cualquier momento dentro de la hora indicada.
 */

const BOGOTA_UTC_OFFSET = -5;   // Colombia no cambia de hora en todo el año

function ahoraEnBogota() {
  const utc = new Date();
  return new Date(utc.getTime() + BOGOTA_UTC_OFFSET * 3600 * 1000);
}

const pad = (n) => String(n).padStart(2, "0");
const claveDia = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export async function GET(request) {
  // Solo Vercel puede disparar esto.
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "No autorizado" }, { status: 401 });
  }

  const faltantes = ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]
    .filter((k) => !process.env[k]);
  if (faltantes.length) {
    return Response.json({ error: "Faltan variables de entorno", faltantes }, { status: 500 });
  }

  webpush.setVapidDetails(
    "mailto:recordatorios@enfoque.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  // Cliente de servicio: lee los datos de todos los usuarios saltándose RLS.
  // Esta llave NUNCA debe llevar el prefijo NEXT_PUBLIC_ (quedaría expuesta al navegador).
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const bog = ahoraEnBogota();
  const horaBog = bog.getUTCHours();
  const hoy = claveDia(bog);

  const { data: filas, error } = await admin.from("dashboards").select("user_id, data");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let enviados = 0, revisados = 0, sinPendientes = 0, limpiadas = 0;

  for (const fila of filas || []) {
    revisados++;
    const d = fila.data || {};
    const a = d.alarm || {};

    if (!a.enabled) continue;
    if (Number(a.hour) !== horaBog) continue;            // no es tu hora

    const pend = pendientesDe(d);
    if (pend.length === 0) { sinPendientes++; continue; }  // vas al día, no molestamos

    // ¿Ya te avisamos hoy?
    const { data: estado } = await admin
      .from("notif_state").select("last_notified").eq("user_id", fila.user_id).maybeSingle();
    if (estado?.last_notified === hoy) continue;

    const { data: subs } = await admin
      .from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", fila.user_id);
    if (!subs?.length) continue;

    const payload = JSON.stringify({
      title: "Enfoque · te falta algo hoy",
      body: pend.join(" · "),
    });

    let algunoLlego = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        algunoLlego = true;
        enviados++;
      } catch (e) {
        // 404/410 = el navegador desechó la suscripción (app desinstalada, caché limpiado).
        // Se borra sola para no acumular basura.
        if (e.statusCode === 404 || e.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          limpiadas++;
        }
      }
    }

    if (algunoLlego) {
      await admin.from("notif_state").upsert({ user_id: fila.user_id, last_notified: hoy });
    }
  }

  return Response.json({
    ok: true, horaBogota: horaBog, revisados, enviados, sinPendientes, limpiadas,
  });
}
