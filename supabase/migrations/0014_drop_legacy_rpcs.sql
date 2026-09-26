-- 0014: drop the legacy single-tenant RPCs superseded by the tenant-scoped
-- *_rifa functions in 0010_tenant_rpcs.sql.
--
--   reservar_numeros(...)      -> reservar_numeros_rifa(...)
--   confirmar_pago_admin       -> confirmar_pago_rifa
--   rechazar_reserva_admin     -> rechazar_reserva_rifa
--   editar_numero_admin        -> editar_numero_rifa
--   reasignar_numeros_admin    -> reasignar_numeros_rifa
--
-- Safe to drop: none is called from app code (app/, lib/, components/), from
-- another SQL function, policy or trigger, or from pg_cron. They were also
-- already unusable since 0009 (numeros PK swap, reservas.raffle_id NOT NULL).
--
-- Deliberately KEPT (still referenced):
--   liberar_reservas_expiradas()   -- pg_cron job 'liberar-reservas-expiradas' (0009)
--   marcar_en_verificacion(...)    -- called by submitReservation in app/actions.ts
--
-- Rollback: supabase/rollback/0014_drop_legacy_rpcs_down.sql

drop function if exists reservar_numeros(integer, text, text, text, text, text, text, text);
drop function if exists confirmar_pago_admin(uuid);
drop function if exists rechazar_reserva_admin(uuid);
drop function if exists editar_numero_admin(uuid, integer, integer);
drop function if exists reasignar_numeros_admin(uuid);
