import { supabase } from "./supabase";

/**
 * Suscripción de este dispositivo a los recordatorios del servidor.
 * Cada dispositivo (PC, celular) se registra por separado: por eso hay que
 * activarlo una vez en cada uno.
 */

export const pushConfigured = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export const pushSupported = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

// La llave VAPID viaja en base64url y el navegador la pide como bytes.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

/** ¿Este dispositivo ya está recibiendo recordatorios? */
export async function pushStatus() {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Activa los recordatorios en este dispositivo. */
export async function subscribeToPush(userId) {
  if (!pushSupported()) throw new Error("Este navegador no admite recordatorios.");
  if (!pushConfigured) throw new Error("Falta configurar la llave VAPID en Vercel.");

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    throw new Error("No diste permiso de notificaciones. Actívalo en los ajustes del navegador.");
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    });
  }

  const j = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    { endpoint: j.endpoint, user_id: userId, p256dh: j.keys.p256dh, auth: j.keys.auth },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
  return true;
}

/** Desactiva los recordatorios en este dispositivo. */
export async function unsubscribeFromPush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return true;
  const { endpoint } = sub.toJSON();
  await sub.unsubscribe();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return true;
}
