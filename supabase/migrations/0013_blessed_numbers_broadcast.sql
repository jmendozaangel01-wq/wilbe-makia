-- Phase 4 / Unit 4. Broadcast-from-Database for anon blessed-numbers live
-- updates (design D8, Round 2 redesign -- replaces the rejected
-- db-pre-request GUC mechanism from the original Round 1 design). See D8 for
-- the full rationale: the browser talks directly to the Supabase project
-- host for Realtime, so a Host-resolved tenant never reaches PostgREST, and
-- Realtime's postgres_changes authorization path doesn't invoke
-- db-pre-request at all.
--
-- The trigger lives on numeros ONLY -- there is no trigger on reservas.
-- es_bendecido is a column on numeros alone (0001_init.sql), and every RPC
-- that can change blessed-number status (reservar_numeros[_rifa],
-- confirmar_pago_[admin|rifa], rechazar_reserva_[admin|rifa],
-- editar_numero_[admin|rifa], reasignar_numeros_[admin|rifa],
-- liberar_reservas_expiradas) performs a direct UPDATE numeros in the same
-- transaction -- so numeros is the single, sufficient source of truth and no
-- reservas trigger is needed.
--
-- Split into TWO separate triggers, not one WHEN clause spanning both
-- INSERT and UPDATE: Postgres rejects an OLD reference in an INSERT
-- trigger's WHEN clause (there is no OLD row on INSERT), so a single
-- combined trigger referencing OLD.estado would fail to even create.
--
-- Runs at trigger (elevated/definer) privilege -- invoked by a trigger, not
-- a client request -- so it needs no RLS grant to decide what to publish; it
-- publishes exactly the row it fired for, for the organization that owns
-- it. RLS on numeros stays exactly as-is (defense-in-depth for direct
-- authenticated/service-role reads); it is simply not in this Broadcast
-- path at all.
--
-- Channel left non-private (realtime.send's 4th argument = false) by
-- deliberate v1 decision -- see design D8's "Security posture" note:
-- blessed-number status is intentionally public information already
-- rendered in that tenant's own public page HTML. The property actually
-- relied on is spoofing-resistance of organization_id in the topic string
-- (always server-resolved via Host per D6, never client-suppliable) -- not
-- secrecy of the topic name itself.

create or replace function notify_blessed_number_broadcast() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Defensive guard only -- numeros.raffle_id is NOT NULL as of
  -- 0009_tenant_constraints.sql, and the numeros_organization_id_consistency
  -- trigger (0010_tenant_rpcs.sql) already rejects any insert/update that
  -- sets raffle_id without a matching organization_id, so in practice this
  -- never short-circuits on any row this trigger's WHEN clause lets through.
  if new.organization_id is null then
    return new;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'numero', new.numero,
      'estado', new.estado,
      'raffle_id', new.raffle_id,
      'organization_id', new.organization_id
    ),
    'blessed_number_changed',
    'org:' || new.organization_id || ':blessed-numbers',
    false
  );

  return new;
end;
$$;

-- Fires on every INSERT of a row that is already blessed at insert time
-- (e.g. crear_rifa's seeding insert, or any future admin "mark as blessed"
-- path) -- there is no OLD row to compare against on INSERT, so this can
-- only ever gate on NEW.
create trigger blessed_number_insert_broadcast
  after insert on numeros
  for each row
  when (new.es_bendecido = true)
  execute function notify_blessed_number_broadcast();

-- Fires on UPDATE only when the row is (still) blessed AND its estado
-- actually changed -- so it does not fire on unrelated column edits that
-- leave es_bendecido and estado untouched.
create trigger blessed_number_update_broadcast
  after update on numeros
  for each row
  when (new.es_bendecido = true and old.estado is distinct from new.estado)
  execute function notify_blessed_number_broadcast();
