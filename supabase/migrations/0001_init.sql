-- Wilber Makia raffle schema.
-- If `create extension if not exists pg_cron;` below fails due to permissions,
-- enable the pg_cron extension manually via Supabase Dashboard -> Database ->
-- Extensions, then re-run just the `select cron.schedule(...)` statement at
-- the bottom of this file.

-- reservas must exist before numeros, since numeros.reserva_id references it.
create table reservas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  apellido text not null,
  correo text not null,
  whatsapp text not null,
  direccion text not null,
  ciudad text not null,
  paquete_tipo text not null check (paquete_tipo in ('paquete_65', 'paquete_100', 'paquete_120', 'custom')),
  numeros_asignados integer[] not null,
  comprobante_url text,
  estado text not null default 'pendiente_pago' check (estado in ('pendiente_pago', 'en_verificacion', 'confirmado', 'expirado')),
  creado_en timestamptz not null default now(),
  expira_en timestamptz not null
);

-- numeros: one row per raffle number 00000-99999
create table numeros (
  numero integer primary key check (numero >= 0 and numero <= 99999),
  estado text not null default 'disponible' check (estado in ('disponible', 'reservado', 'vendido')),
  reserva_id uuid references reservas(id),
  es_bendecido boolean not null default false
);

-- seed all 100,000 numbers 00000-99999, mark the 15 blessed numbers
insert into numeros (numero, es_bendecido)
select n, n in (7734, 12583, 29461, 33780, 41256, 50912, 62347, 70594, 81023, 92468, 10357, 23689, 34781, 45902, 56134)
from generate_series(0, 99999) as n;

-- RLS: deny all direct client access; only SECURITY DEFINER RPCs may touch these tables
alter table numeros enable row level security;
alter table reservas enable row level security;
-- (no policies added = default deny for anon/authenticated; service_role bypasses RLS)

-- atomic, collision-free reservation RPC
create or replace function reservar_numeros(
  p_cantidad integer,
  p_nombre text, p_apellido text, p_correo text, p_whatsapp text,
  p_direccion text, p_ciudad text, p_paquete_tipo text
) returns table(reserva_id uuid, numeros_asignados integer[])
language plpgsql security definer as $$
declare
  v_reserva_id uuid;
  v_numeros integer[];
begin
  -- keep in sync with MAX_CUSTOM_QTY in lib/constants.ts
  if p_cantidad < 1 or p_cantidad > 200 then
    raise exception 'Cantidad inválida';
  end if;

  select array_agg(numero) into v_numeros from (
    select numero from numeros
    where estado = 'disponible'
    order by numero
    limit p_cantidad
    for update skip locked
  ) sub;

  if v_numeros is null or array_length(v_numeros, 1) < p_cantidad then
    raise exception 'No hay suficientes números disponibles';
  end if;

  insert into reservas (nombre, apellido, correo, whatsapp, direccion, ciudad, paquete_tipo, numeros_asignados, estado, expira_en)
  values (p_nombre, p_apellido, p_correo, p_whatsapp, p_direccion, p_ciudad, p_paquete_tipo, v_numeros, 'pendiente_pago', now() + interval '10 minutes')
  returning id into v_reserva_id;

  update numeros set estado = 'reservado', reserva_id = v_reserva_id where numero = any(v_numeros);

  return query select v_reserva_id, v_numeros;
end;
$$;

-- security definer functions default to a PUBLIC execute grant; revoke it so
-- only the service-role client (used server-side) can invoke these via
-- PostgREST's RPC endpoint — anon/authenticated must never call them directly.
revoke execute on function reservar_numeros(integer, text, text, text, text, text, text, text) from public, anon, authenticated;

-- expire stale pending reservations, release their numbers
create or replace function liberar_reservas_expiradas() returns void
language plpgsql security definer as $$
begin
  update numeros set estado = 'disponible', reserva_id = null
  where reserva_id in (select id from reservas where estado = 'pendiente_pago' and expira_en < now());

  update reservas set estado = 'expirado'
  where estado = 'pendiente_pago' and expira_en < now();
end;
$$;

revoke execute on function liberar_reservas_expiradas() from public, anon, authenticated;

-- mark a reservation as awaiting manual verification once a receipt is uploaded
create or replace function marcar_en_verificacion(p_reserva_id uuid, p_comprobante_url text) returns void
language plpgsql security definer as $$
begin
  update reservas set estado = 'en_verificacion', comprobante_url = p_comprobante_url
  where id = p_reserva_id and estado = 'pendiente_pago';
end;
$$;

revoke execute on function marcar_en_verificacion(uuid, text) from public, anon, authenticated;

-- run the expiration sweep every minute via pg_cron (Supabase supports this extension)
create extension if not exists pg_cron;
select cron.schedule('liberar-reservas-expiradas', '* * * * *', $$select liberar_reservas_expiradas();$$);
