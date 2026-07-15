# 🔔 Activar los recordatorios con la app cerrada

**Esto es opcional.** Sin hacer nada de esto, la app ya funciona completa y el recordatorio
te suena cuando la tienes abierta. Sigue esta guía solo cuando quieras que además te llegue
al celular con la app cerrada.

Tiempo: ~15 minutos, una sola vez.

---

## PARTE 1 · La tabla nueva en Supabase — 3 min

1. Entra a **https://supabase.com** → tu proyecto `enfoque`.
2. Menú izquierdo → **SQL Editor** → **New query**.
3. Abre el archivo `supabase/schema-push.sql` de este proyecto, copia TODO su contenido,
   pégalo y presiona **Run**. Debe decir "Success".

> No borra ni modifica nada de lo que ya tienes. Solo agrega dos tablas nuevas.

---

## PARTE 2 · La llave de servicio de Supabase — 2 min

1. En Supabase: **Project Settings (⚙️) → API**.
2. Busca la sección **Project API keys** y copia la llave **`service_role`**
   (NO la `anon public`, esa ya la tienes).

> ⚠️ Esta llave puede leer todo tu proyecto saltándose la seguridad. Va **solo** en Vercel,
> nunca en el código ni en un chat. Si alguna vez se te escapa, en esa misma pantalla
> puedes regenerarla.

---

## PARTE 3 · Las variables en Vercel — 5 min

1. Entra a **https://vercel.com** → tu proyecto `enfoque-app`.
2. **Settings → Environment Variables**.
3. Agrega estas cuatro, una por una (marca los tres entornos: Production, Preview, Development):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `BPWWgDcLruMJIJGtH2Yg0rTTxLkBdyhyENhIlfxidXO7JJmGZd57YUHBQGePdW4cOUyY_RSkee4m3dLgvkVf9Mc` |
| `VAPID_PRIVATE_KEY` | `Ld9D_dvWy00Vy2nl5N2dID09y3ebUzYfd3MKAJ8UA5s` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(la llave `service_role` de la Parte 2)* |
| `CRON_SECRET` | `f401a75f9ca97c3149f9d59464d8ce39c486a008b9be84f6` |

> Las llaves VAPID y el `CRON_SECRET` los generé para ti y son únicos de tu app.
> La `VAPID_PRIVATE_KEY` y el `CRON_SECRET` **no llevan** el prefijo `NEXT_PUBLIC_`:
> ese prefijo es justamente lo que haría que quedaran expuestas en el navegador.

4. **Deployments** → el último → menú (⋯) → **Redeploy**.
   Las variables solo entran en vigor con un despliegue nuevo.

---

## PARTE 4 · Encender el aviso en cada dispositivo — 3 min

Esto hay que hacerlo **en cada aparato** donde quieras recibirlo. El PC y el celular
son suscripciones distintas.

**En el PC:**
1. Abre tu app → menú lateral → **Recordatorio**.
2. Elige tu hora (por defecto 7:00 pm) y marca qué quieres que te reclame.
3. Abajo, en "Con la app cerrada" → **Activar en este dispositivo** → acepta el permiso.
4. Debe quedar en verde: "Activo en este dispositivo".

**En Android (Chrome):**
- Igual que en el PC. Funciona aunque no la instales, pero instálala de todos modos.

**En iPhone (Safari) — obligatorio instalarla:**
1. Abre la app en Safari → **Compartir** (□↑) → **Agregar a pantalla de inicio**.
2. **Cierra Safari y abre la app desde el ícono de la pantalla de inicio.**
3. Ahí sí: **Recordatorio → Activar en este dispositivo**.

> En iPhone, si abres la app desde Safari en vez del ícono, el botón no aparece.
> Es una restricción de Apple: las notificaciones solo existen para apps instaladas.

---

## Cómo saber si quedó bien

Deja un objetivo sin marcar y espera tu hora. Si llega el aviso, listo.

Si quieres probar sin esperar: en la app, cambia la hora del recordatorio a la
**hora siguiente** a la actual y espera. (El aviso solo se dispara una vez al día.)

---

## Lo que tienes que saber de cómo funciona

- **La hora no es exacta.** El plan gratuito de Vercel no garantiza puntualidad:
  tu aviso de las 7:00 pm puede llegar en cualquier momento entre 7:00 y 7:59 pm.
  Para "recuérdame lo que falta hoy" alcanza de sobra. Si algún día te molesta,
  el plan Pro de Vercel lo vuelve puntual al minuto.
- **Solo llega si de verdad te falta algo.** Si ya cumpliste tus objetivos, leíste
  y estudiaste alemán, no te molesta.
- **Una vez al día.** No insiste.
- **Puedes cambiar la hora desde la app** (6 a 10 pm) sin volver a desplegar nada.
  Si quisieras una hora fuera de ese rango, hay que agregarla en `vercel.json`
  (recuerda: Vercel corre en UTC, y Colombia es UTC-5, sin cambio de horario).
- **Un servidor lee tus datos** para saber si estás en mora. Es tu propio servidor
  y tu propia base de datos, pero es un cambio real respecto a antes, cuando todo
  se quedaba en tu navegador. Vale la pena saberlo.
- **Si un día dejan de llegar**, entra a **Recordatorio** y vuelve a activar el
  dispositivo. Los navegadores a veces desechan la suscripción (al limpiar caché,
  al reinstalar la app). La app detecta las muertas y las borra sola.
