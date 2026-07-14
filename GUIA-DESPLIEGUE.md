# 🚀 Guía de despliegue — paso a paso

Sigue estos pasos en orden. Todo se hace desde el navegador, sin instalar nada,
y todos los servicios tienen plan gratuito de sobra para uso personal.
Tiempo estimado: 20–30 minutos.

---

## PARTE 1 · Supabase (tu base de datos y login) — 10 min

1. Entra a **https://supabase.com** y crea una cuenta (puedes usar Google).
2. Clic en **New project**:
   - **Name**: `enfoque`
   - **Database Password**: inventa una contraseña fuerte y **guárdala** (no la necesitarás a diario, pero consérvala).
   - **Region**: `South America (São Paulo)` — la más cercana a Colombia.
   - Clic en **Create new project** y espera 1–2 minutos.
3. En el menú lateral izquierdo, abre **SQL Editor** → **New query**.
4. Abre el archivo `supabase/schema.sql` de esta carpeta, copia TODO su contenido,
   pégalo en el editor y presiona **Run**. Debe decir "Success".
5. Ve a **Authentication → Sign In / Up** (o Providers) y verifica que **Email** esté habilitado.
   - 💡 Recomendado: desactiva la opción **"Confirm email"** para poder entrar
     inmediatamente al crear tu cuenta, sin esperar correo de confirmación.
6. Ve a **Project Settings (⚙️) → API** y copia estos dos valores en un bloc de notas:
   - **Project URL** (algo como `https://abcdefgh.supabase.co`)
   - **anon public** key (una clave larga que empieza por `eyJ...`)

---

## PARTE 2 · GitHub (donde vive tu código) — 5 min

1. Entra a **https://github.com** y crea una cuenta si no tienes.
2. Clic en **+ → New repository**:
   - **Name**: `enfoque-app`
   - Visibilidad: **Private**
   - Clic en **Create repository**.
3. En la página del repositorio, clic en **uploading an existing file**
   (o **Add file → Upload files**).
4. Abre la carpeta del proyecto en tu computador, selecciona **todo su contenido**
   (las carpetas `app`, `components`, `lib`, `public`, `supabase` y los archivos sueltos)
   y **arrástralo** a la página de GitHub.
   - ⚠️ NO subas la carpeta contenedora, sino lo que hay DENTRO de ella.
   - ⚠️ Si existieran `node_modules` o `.next`, NO las subas (el zip que recibiste no las incluye).
5. Abajo, clic en **Commit changes** y espera a que termine de subir.

---

## PARTE 3 · Vercel (publicar la app en internet) — 5 min

1. Entra a **https://vercel.com** y clic en **Sign Up → Continue with GitHub**
   (así se conectan solos).
2. Clic en **Add New… → Project**.
3. Verás tu repositorio `enfoque-app` → clic en **Import**.
4. Vercel detecta Next.js automáticamente. Antes de desplegar, abre la sección
   **Environment Variables** y agrega estas dos (los valores que copiaste de Supabase):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | tu Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | tu clave anon public |

5. Clic en **Deploy** y espera 1–2 minutos.
6. 🎉 Al terminar verás tu dirección: algo como **https://enfoque-app.vercel.app**
   Esa es tu aplicación, disponible desde cualquier dispositivo del mundo.
7. (Solo si dejaste activada la confirmación por correo en Supabase):
   vuelve a Supabase → **Authentication → URL Configuration** y en **Site URL**
   pega tu dirección de Vercel, para que los enlaces de confirmación funcionen.

---

## PARTE 4 · Instalarla en el PC — 2 min

1. Abre tu dirección de Vercel en **Chrome o Edge**.
2. Clic en **Crear cuenta**, escribe tu correo y una contraseña → entra al dashboard.
3. En la barra de direcciones del navegador aparece un **ícono de instalar**
   (un monitor con flecha ⬇). Clic → **Instalar**.
4. La app se abre en su propia ventana y queda con ícono en el escritorio
   y el menú de inicio, como cualquier programa.

---

## PARTE 5 · Instalarla en el celular — 2 min

**Android (Chrome):**
1. Abre tu dirección de Vercel en Chrome.
2. Inicia sesión con **la misma cuenta** que creaste en el PC.
3. Menú (⋮) → **Instalar aplicación** (o "Agregar a pantalla de inicio").

**iPhone (Safari):**
1. Abre tu dirección de Vercel en Safari.
2. Inicia sesión con la misma cuenta.
3. Botón **Compartir** (□↑) → **Agregar a pantalla de inicio**.

✅ Como PC y celular usan la misma cuenta, **todo se sincroniza automáticamente**:
lo que registres en uno aparece en el otro en segundos (si tienes la app abierta
en el otro dispositivo, recarga para ver los cambios).

---

## PARTE 6 · Traer tus datos de la versión anterior — 2 min

Si venías usando el archivo `enfoque-dashboard.html`:
1. Abre la versión vieja (HTML) → pestaña **General → Exportar datos**. Se descarga un `.json`.
2. Abre la versión nueva (Vercel) → **General → Importar datos** → selecciona ese `.json`.
3. Listo: todo tu historial queda en la nube.

---

## Mantenimiento futuro

- **Actualizar la app**: cuando tengas una versión nueva del código, súbela al mismo
  repositorio de GitHub (Upload files → reemplazar) y Vercel redespliega solo.
- **Respaldos**: Supabase guarda todo, pero exporta un `.json` de vez en cuando
  desde General → Exportar datos, por tranquilidad.
- **Costo**: $0. Los planes gratuitos de Supabase y Vercel cubren de sobra el uso personal.
  Única nota: Supabase pausa proyectos gratuitos tras ~1 semana sin uso; como la app
  se conecta cada vez que la abres, con usarla regularmente no pasa nada. Si algún día
  aparece pausado, se reactiva con un clic en el panel de Supabase.
