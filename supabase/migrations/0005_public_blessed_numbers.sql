-- Public landing page shows live status for the 15 "blessed" numbers (grayed
-- out once vendido, instead of the default gold) — needs anon read access on
-- numeros, scoped tightly to just those 15 rows. reservas stays fully locked
-- down; this policy never touches it, so no customer data is exposed.
create policy "anon_read_blessed_numeros" on numeros for select to anon using (es_bendecido = true);

-- Needed so the landing page's Realtime subscription picks up a number
-- flipping to vendido without a page refresh. RLS above already limits what
-- an anon subscriber can see to the 15 blessed rows, regardless of how many
-- other rows in the table change.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'numeros'
  ) then
    alter publication supabase_realtime add table numeros;
  end if;
end $$;
