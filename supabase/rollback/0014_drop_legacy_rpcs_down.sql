-- Down-script for supabase/migrations/0014_drop_legacy_rpcs.sql. Recreates the
-- five dropped legacy RPCs with their last pre-0014 definitions
-- (reservar_numeros from 0003, the four *_admin functions from 0004).
-- NOTE: these bodies target the pre-0009 single-tenant schema; against the
-- current tenant schema they will not run successfully (raffle_id NOT NULL,
-- numeros PK includes raffle_id). Restored for schema fidelity only.

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
    order by random()
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

revoke execute on function reservar_numeros(integer, text, text, text, text, text, text, text) from public, anon, authenticated;

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
