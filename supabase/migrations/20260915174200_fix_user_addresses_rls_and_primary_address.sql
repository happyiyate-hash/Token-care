-- Keep the address table aligned with the frontend's canonical user address path.
create unique index if not exists user_addresses_one_primary_per_chain
  on public.user_addresses (user_id, chain_id)
  where is_primary = true;

create policy "Users can view own addresses"
on public.user_addresses
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own addresses"
on public.user_addresses
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own addresses"
on public.user_addresses
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own addresses"
on public.user_addresses
for delete
to authenticated
using (auth.uid() = user_id);
