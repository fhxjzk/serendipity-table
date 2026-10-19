-- RLS policies. Writes that change matching, payment or status go through
-- server actions with the service role; the browser only reads its own rows,
-- reference data, and the chat room of its own table.

create or replace function public.is_operator() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'OPERATOR');
$$;

create or replace function public.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_rooms r
    join public.table_members m on m.table_id = r.table_id and m.left_at is null
    where r.id = p_room_id and m.profile_id = auth.uid()
  );
$$;

-- Operators can read and write everything.
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create policy operator_all on public.%I for all to authenticated using (public.is_operator()) with check (public.is_operator())', t);
  end loop;
end $$;

-- Reference data readable by any signed-in user.
create policy read_all on public.code_values for select to authenticated using (true);
create policy read_all on public.rounds for select to authenticated using (true);
create policy read_all on public.round_regions for select to authenticated using (true);
create policy read_all on public.ticket_products for select to authenticated using (true);
create policy read_all on public.faq_items for select to authenticated using (true);
create policy read_all on public.content_items for select to authenticated using (true);
create policy read_anon on public.code_values for select to anon using (true);

-- Own rows.
create policy own_read on public.profiles for select to authenticated using (id = auth.uid());
create policy own_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = 'PARTICIPANT');
create policy own_all on public.notification_settings for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy own_all on public.push_subscriptions for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy own_read on public.applications for select to authenticated using (profile_id = auth.uid());
create policy own_read on public.application_choices for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.profile_id = auth.uid()));
create policy own_read on public.user_tickets for select to authenticated using (profile_id = auth.uid());
create policy own_read on public.payments for select to authenticated using (profile_id = auth.uid());
create policy own_read on public.coupons for select to authenticated using (profile_id = auth.uid());
create policy own_read on public.notifications for select to authenticated using (profile_id = auth.uid());
create policy own_update on public.notifications for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy own_read on public.feedbacks for select to authenticated using (profile_id = auth.uid());
create policy own_read on public.inquiries for select to authenticated using (profile_id = auth.uid());
create policy own_read on public.sanctions for select to authenticated using (profile_id = auth.uid());
create policy own_all on public.balance_answers for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy own_read on public.table_members for select to authenticated using (profile_id = auth.uid());

-- Chat: members of the table read and post in their room.
create policy member_read on public.chat_rooms for select to authenticated using (public.is_room_member(id));
create policy member_read on public.chat_messages for select to authenticated using (public.is_room_member(room_id));
create policy member_post on public.chat_messages for insert to authenticated
  with check (public.is_room_member(room_id) and sender_id = auth.uid() and kind = 'USER');
