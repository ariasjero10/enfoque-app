# Enfoque · Dashboard de Productividad

Aplicación web personal de productividad con sincronización en la nube.

## Tecnologías
- **Next.js 14** (App Router) + React 18
- **Tailwind CSS** — estilos
- **Supabase** — autenticación (correo y contraseña) + base de datos PostgreSQL
- **Recharts** — gráficos · **Lucide** — iconos
- **PWA** — instalable en PC y celular

## Estructura
```
app/            Páginas (layout, página principal con control de sesión)
components/     DashboardApp (toda la interfaz) y Login
lib/            Cliente de Supabase y hook de sincronización
supabase/       schema.sql — script de base de datos (ejecutar una vez)
public/         Manifest PWA, iconos y service worker
```

## Cómo funciona la sincronización
Cada usuario tiene una fila en la tabla `dashboards` con todos sus datos en formato JSON.
Los cambios se guardan automáticamente (debounce de 0,9 s) y con Row Level Security
cada usuario solo puede leer y escribir sus propios datos. Al abrir la app en cualquier
dispositivo con la misma cuenta, se cargan los datos más recientes.

## Despliegue
Lee **GUIA-DESPLIEGUE.md** — paso a paso completo, sin necesidad de saber programar.

## Desarrollo local (opcional)
```bash
npm install
cp .env.local.example .env.local   # y pega tus claves de Supabase
npm run dev                         # abre http://localhost:3000
```
