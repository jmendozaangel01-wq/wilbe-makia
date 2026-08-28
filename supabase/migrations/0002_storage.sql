insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false);

-- no insert/select policies for anon or authenticated -> deny by default, matching
-- the numeros/reservas tables. The app uploads receipts exclusively via the
-- service-role client (lib/supabase/admin.ts), which bypasses storage policies,
-- so an anon insert policy would only be a dead-code attack surface.
