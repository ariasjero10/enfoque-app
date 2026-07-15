-- ============================================================
-- ENFOQUE · Recordatorios con la app cerrada
-- Ejecuta este script UNA sola vez en:
-- Supabase -> SQL Editor -> New query -> pegar -> Run
-- No toca ni borra nada de lo que ya tienes.
-- ============================================================

-- Un registro por dispositivo (PC, celular) al que quieres que te llegue el aviso
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Cada quien administra solo sus propios dispositivos
drop policy if exists "push_leer_propio" on public.push_subscriptions;
create policy "push_leer_propio" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "push_crear_propio" on public.push_subscriptions;
create policy "push_crear_propio" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "push_actualizar_propio" on public.push_subscriptions;
create policy "push_actualizar_propio" on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "push_borrar_propio" on public.push_subscriptions;
create policy "push_borrar_propio" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- Evita que te llegue el mismo recordatorio varias veces el mismo día
create table if not exists public.notif_state (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  last_notified date
);

alter table public.notif_state enable row level security;

drop policy if exists "notif_leer_propio" on public.notif_state;
create policy "notif_leer_propio" on public.notif_state
  for select using (auth.uid() = user_id);
