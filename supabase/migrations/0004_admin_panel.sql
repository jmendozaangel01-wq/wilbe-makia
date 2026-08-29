-- Admin panel: reject state, admin-only RPCs for confirm/reject/edit/reassign,
-- read-only RLS for the authenticated (admin) role so the panel's Realtime
-- subscription and range/search queries can read reservas/numeros directly,
-- and indexes to keep those admin queries and the RPCs' row locks fast.

alter table reservas drop constraint if exists reservas_estado_check;
alter table reservas add constraint reservas_estado_check
  check (estado in ('pendiente_pago', 'en_verificacion', 'confirmado', 'expirado', 'rechazado'));

create index if not exists numeros_estado_idx on numeros (estado);
create index if not exists reservas_estado_idx on reservas (estado);
create index if not exists reservas_creado_en_idx on reservas (creado_en desc);

-- Read-only access for the admin's authenticated session. This project has no
-- public sign-up flow -- the only Supabase Auth users are admin accounts
-- created via supabase.auth.admin.createUser, so "authenticated" here is
-- equivalent to "admin". Writes still go exclusively through the
-- SECURITY DEFINER RPCs below via the service-role client.
create policy "authenticated_read_reservas" on reservas for select to authenticated using (true);
create policy "authenticated_read_numeros" on numeros for select to authenticated using (true);

-- Needed for the admin panel's Realtime subscription (Reservas tab). Only
-- `reservas` is published -- `numeros` can have up to 200 rows change per
-- reservation, so the panel refetches the visible numero range/counts when a
-- reservas change comes in instead of subscribing to numeros directly.
-- Guarded so this migration stays re-runnable (ALTER PUBLICATION ... ADD
-- TABLE errors if the table is already a member).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservas'
  ) then
    alter publication supabase_realtime add table reservas;
  end if;
end $$;

-- Approve a reservation: numbers become sold, reservation closes out.
create or replace function confirmar_pago_admin(p_reserva_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_estado text;
  v_comprobante text;
begin
  select estado, comprobante_url into v_estado, v_comprobante from reservas where id = p_reserva_id for update;

  if v_estado is null then
    raise exception 'Reserva no encontrada';
  end if;

  if v_estado not in ('pendiente_pago', 'en_verificacion') then
    raise exception 'Solo se puede confirmar una reserva pendiente o en verificación';
  end if;

  if v_comprobante is null then
    raise exception 'La reserva no tiene comprobante de pago';
  end if;

  update reservas set estado = 'confirmado' where id = p_reserva_id;
  update numeros set estado = 'vendido' where reserva_id = p_reserva_id;
end;
$$;

revoke execute on function confirmar_pago_admin(uuid) from public, anon, authenticated;

-- Reject a reservation: free its numbers back to the pool.
create or replace function rechazar_reserva_admin(p_reserva_id uuid)
returns void
language plpgsql security definer as $$
declare
  v_estado text;
begin
  select estado into v_estado from reservas where id = p_reserva_id for update;

  if v_estado is null then
    raise exception 'Reserva no encontrada';
  end if;

  if v_estado not in ('pendiente_pago', 'en_verificacion') then
    raise exception 'Solo se puede rechazar una reserva pendiente o en verificación';
  end if;

  update numeros set estado = 'disponible', reserva_id = null where reserva_id = p_reserva_id;
  update reservas set estado = 'rechazado' where id = p_reserva_id;
end;
$$;

revoke execute on function rechazar_reserva_admin(uuid) from public, anon, authenticated;

-- Swap one manually-assigned number for another specific number the admin picked.
create or replace function editar_numero_admin(p_reserva_id uuid, p_numero_anterior integer, p_numero_nuevo integer)
returns void
language plpgsql security definer as $$
declare
  v_estado text;
  v_nuevo_estado text;
begin
  select estado into v_estado from reservas where id = p_reserva_id for update;

  if v_estado is null then
    raise exception 'Reserva no encontrada';
  end if;

  if v_estado not in ('pendiente_pago', 'en_verificacion') then
    raise exception 'Solo se pueden editar números de una reserva pendiente o en verificación';
  end if;

  if p_numero_anterior = p_numero_nuevo then
    return;
  end if;

  select estado into v_nuevo_estado from numeros where numero = p_numero_nuevo for update;

  if v_nuevo_estado is null then
    raise exception 'El número % no existe', p_numero_nuevo;
  end if;

  if v_nuevo_estado <> 'disponible' then
    raise exception 'El número % no está disponible', p_numero_nuevo;
  end if;

  perform 1 from numeros where numero = p_numero_anterior and reserva_id = p_reserva_id for update;
  if not found then
    raise exception 'El número % no pertenece a esta reserva', p_numero_anterior;
  end if;

  update numeros set estado = 'disponible', reserva_id = null where numero = p_numero_anterior;
  update numeros set estado = 'reservado', reserva_id = p_reserva_id where numero = p_numero_nuevo;
  update reservas set numeros_asignados = array_replace(numeros_asignados, p_numero_anterior, p_numero_nuevo)
  where id = p_reserva_id;
end;
$$;

revoke execute on function editar_numero_admin(uuid, integer, integer) from public, anon, authenticated;

-- Release all of a reservation's numbers and draw a fresh random set of the same size.
create or replace function reasignar_numeros_admin(p_reserva_id uuid)
returns integer[]
language plpgsql security definer as $$
declare
  v_estado text;
  v_cantidad integer;
  v_numeros integer[];
begin
  select estado, array_length(numeros_asignados, 1) into v_estado, v_cantidad
  from reservas where id = p_reserva_id for update;

  if v_estado is null then
    raise exception 'Reserva no encontrada';
  end if;

  if v_estado not in ('pendiente_pago', 'en_verificacion') then
    raise exception 'Solo se pueden reasignar números de una reserva pendiente o en verificación';
  end if;

  update numeros set estado = 'disponible', reserva_id = null where reserva_id = p_reserva_id;

  select array_agg(numero) into v_numeros from (
    select numero from numeros
    where estado = 'disponible'
    order by random()
    limit v_cantidad
    for update skip locked
  ) sub;

  if v_numeros is null or array_length(v_numeros, 1) < v_cantidad then
    raise exception 'No hay suficientes números disponibles para reasignar';
  end if;

  update numeros set estado = 'reservado', reserva_id = p_reserva_id where numero = any(v_numeros);
  update reservas set numeros_asignados = v_numeros where id = p_reserva_id;

  return v_numeros;
end;
$$;

revoke execute on function reasignar_numeros_admin(uuid) from public, anon, authenticated;
