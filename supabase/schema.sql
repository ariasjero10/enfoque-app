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
