-- ============================================================
-- ENFOQUE · Dashboard de Productividad
-- Ejecuta este script una sola vez en:
-- Supabase -> SQL Editor -> New query -> pegar -> Run
-- ============================================================

-- Tabla: un registro por usuario con todos sus datos del dashboard
create table if not exists public.dashboards (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Seguridad a nivel de fila: cada usuario solo puede ver y editar SUS datos
alter table public.dashboards enable row level security;

create policy "leer_propio" on public.dashboards
  for select using (auth.uid() = user_id);

create policy "crear_propio" on public.dashboards
  for insert with check (auth.uid() = user_id);

create policy "actualizar_propio" on public.dashboards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- REFERENCIA · Claves JSON del sistema de hábitos (dopamina)
-- La columna `data` es jsonb (sin esquema fijo): estas claves NO requieren
-- ALTER TABLE. Se documentan aquí para saber qué guarda la app.
--
--   data.focus.ritualEntrada         text    ritual de entrada antes de enfocarse
--   data.focus.environmentChecklist  text[]  ítems del checklist de entorno
--   data.current.goals[].started     bool    "solo el mínimo" (esfuerzo, no resultado)
--   data.current.goals[].microInicio text    micro-tarea de arranque del objetivo
--   data.recurring.goals[].microInicio text  plantilla del micro-inicio
--   data.current.dayClose            object  { done, note, at } cierre positivo del día
--
--   streak.effort  ->  NO se almacena; la app lo calcula (metEffort): días con
--                      >=1 ciclo de trabajo profundo o >=1 objetivo iniciado/cumplido.
-- ============================================================
