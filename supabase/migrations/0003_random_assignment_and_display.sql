-- Additive migration on top of 0001_init.sql and 0002_storage.sql (does not
-- replace them). Two changes:
--
-- 1. Adds a generated, zero-padded display column on `numeros` so raffle
--    numbers read as e.g. "00052" when browsed in Supabase Studio, without
--    changing the underlying `numero integer` column — that column stays a
--    plain integer on purpose, for correct locking/ordering/indexing.
--
-- 2. Re-creates `reservar_numeros` (originally defined in 0001_init.sql) so
--    it assigns numbers randomly instead of always taking the lowest
--    available ones. Only `order by numero` becomes `order by random()` in
--    the inner `for update skip locked` subquery; every other part of the
--    function (validation, exception messages, insert into reservas, update
--    numeros, return) is unchanged from the current version.

alter table numeros add column numero_display text
  generated always as (lpad(numero::text, 5, '0')) stored;

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

-- CREATE OR REPLACE preserves the previously-granted/revoked privileges on
-- this function signature, but revoke again anyway as cheap defensive
-- insurance — harmless if already revoked, matches the signature already
-- used in 0001_init.sql.
revoke execute on function reservar_numeros(integer, text, text, text, text, text, text, text) from public, anon, authenticated;
