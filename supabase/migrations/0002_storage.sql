insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false);

create policy "anyone can upload a comprobante" on storage.objects for insert to anon with check (bucket_id = 'comprobantes');
-- no select policy for anon -> only service_role (used server-side) can read receipts back
