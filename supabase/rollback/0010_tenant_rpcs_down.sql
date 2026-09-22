-- Down-script for supabase/migrations/0010_tenant_rpcs.sql. Safe to run any
-- time before 0011_rls_rewrite.sql -- drops only what 0010 added; the old
-- 0001/0004 RPCs and legacy RLS policies are untouched by this file.

drop trigger if exists numeros_organization_id_consistency on numeros;
drop trigger if exists reservas_organization_id_consistency on reservas;
drop function if exists enforce_organization_id_matches_raffle();

drop function if exists reasignar_numeros_rifa(uuid, uuid, uuid);
drop function if exists editar_numero_rifa(uuid, uuid, uuid, integer, integer);
drop function if exists rechazar_reserva_rifa(uuid, uuid);
drop function if exists confirmar_pago_rifa(uuid, uuid);
drop function if exists reservar_numeros_rifa(uuid, integer, text, text, text, text, text, text, text);
drop function if exists crear_rifa(uuid, text, integer, integer, jsonb, integer[], text, text, text);
drop function if exists crear_organizacion(text, text);
