-- Match failure resolution (기능 명세서 F-18~F-21, 상태 전이 4.5).
-- One choice per failed application (match_resolutions primary key), in one transaction:
--   MOVE   — keep the payment, open a new application for an offered round (old one TRANSFERRED)
--   KEEP   — give the used ticket back for a later application
--   REFUND — 1회권 is refunded (mock, REQUESTED → PROCESSING → REFUNDED); 구독권 gets 1 use back instead

create or replace function public.resolve_match_failure(
  p_profile uuid, p_app uuid, p_choice text, p_round uuid default null, p_region text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_existing match_resolutions;
  v_new uuid;
  v_payment payments;
  v_refund uuid;
  v_is_sub boolean;
begin
  select * into v_app from applications where id = p_app and profile_id = p_profile for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;

  select * into v_existing from match_resolutions where application_id = p_app;
  if found then
    return jsonb_build_object('already_resolved', true, 'choice', v_existing.choice, 'new_application_id', v_existing.new_application_id);
  end if;
  if v_app.match_status not in ('ALTERNATIVE_OFFERED', 'EXCEPTION') or v_app.payment_status <> 'REFUND_AVAILABLE' then
    raise exception 'NOT_RESOLVABLE';
  end if;
  v_is_sub := coalesce(v_app.ticket_product_code, 'SINGLE') <> 'SINGLE';

  if p_choice = 'MOVE' then
    if not exists (
      select 1 from alternative_offers o join rounds r on r.id = o.round_id
      where o.application_id = p_app and o.round_id = p_round and o.region_code = p_region
        and r.status = 'OPEN' and r.apply_deadline_at > now()
    ) then
      raise exception 'OFFER_NOT_AVAILABLE';
    end if;

    -- The old application stops being active first (one active application per person).
    update applications set application_status = 'CANCELED', match_status = 'TRANSFERRED', payment_status = 'PAID',
           is_active = false, canceled_at = now(), updated_at = now()
    where id = p_app;
    insert into applications (profile_id, application_status, payment_status, match_status, ticket_product_code, user_ticket_id,
                              transferred_from, submitted_at)
    values (p_profile, 'SUBMITTED', 'PAID', 'WAITING', v_app.ticket_product_code, v_app.user_ticket_id, p_app, now())
    returning id into v_new;
    insert into application_choices (application_id, round_id, region_code) values (v_new, p_round, p_region);

    insert into status_history (application_id, field, from_value, to_value, actor_type, actor_id, reason) values
      (p_app, 'MATCH', v_app.match_status, 'TRANSFERRED', 'PARTICIPANT', p_profile, 'MOVE'),
      (p_app, 'PAYMENT', 'REFUND_AVAILABLE', 'PAID', 'PARTICIPANT', p_profile, 'MOVE'),
      (v_new, 'APPLICATION', null, 'SUBMITTED', 'PARTICIPANT', p_profile, 'TRANSFERRED_FROM:' || p_app),
      (v_new, 'PAYMENT', null, 'PAID', 'PARTICIPANT', p_profile, 'TRANSFERRED_FROM:' || p_app);

  elsif p_choice = 'KEEP' then
    if v_app.user_ticket_id is null then raise exception 'NO_TICKET'; end if;
    update user_tickets set remaining_uses = remaining_uses + 1, status = 'ACTIVE' where id = v_app.user_ticket_id;
    insert into ticket_ledger (user_ticket_id, application_id, delta, reason) values (v_app.user_ticket_id, p_app, 1, 'KEEP');
    update applications set application_status = 'CANCELED', payment_status = 'PAID', is_active = false, canceled_at = now(), updated_at = now()
    where id = p_app;
    insert into status_history (application_id, field, from_value, to_value, actor_type, actor_id, reason) values
      (p_app, 'APPLICATION', 'SUBMITTED', 'CANCELED', 'PARTICIPANT', p_profile, 'KEEP'),
      (p_app, 'PAYMENT', 'REFUND_AVAILABLE', 'PAID', 'PARTICIPANT', p_profile, 'KEEP');

  elsif p_choice = 'REFUND' then
    if v_is_sub then
      -- 구독권은 돈 대신 1회 복원 (F-11).
      update user_tickets set remaining_uses = remaining_uses + 1, status = 'ACTIVE' where id = v_app.user_ticket_id;
      insert into ticket_ledger (user_ticket_id, application_id, delta, reason) values (v_app.user_ticket_id, p_app, 1, 'RESTORE');
    else
      select * into v_payment from payments where application_id = p_app and status = 'PAID' order by paid_at desc limit 1;
      if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
      insert into refunds (payment_id, application_id, amount, reason, status, completed_at)
      values (v_payment.id, p_app, v_payment.amount, 'MATCH_FAILED', 'REFUNDED', now())
      returning id into v_refund;
      update user_tickets set status = 'USED_UP' where id = v_app.user_ticket_id;
    end if;
    update applications set application_status = 'CANCELED', payment_status = 'REFUNDED', is_active = false, canceled_at = now(),
           reason_code = case when v_is_sub then 'TICKET_RESTORED' else reason_code end, updated_at = now()
    where id = p_app;
    insert into status_history (application_id, field, from_value, to_value, actor_type, actor_id, reason) values
      (p_app, 'APPLICATION', 'SUBMITTED', 'CANCELED', 'PARTICIPANT', p_profile, 'REFUND'),
      (p_app, 'PAYMENT', 'REFUND_AVAILABLE', 'REFUND_REQUESTED', 'PARTICIPANT', p_profile, 'REFUND'),
      (p_app, 'PAYMENT', 'REFUND_REQUESTED', 'REFUND_PROCESSING', 'SYSTEM', null, 'MOCK_REFUND'),
      (p_app, 'PAYMENT', 'REFUND_PROCESSING', 'REFUNDED', 'SYSTEM', null, case when v_is_sub then 'TICKET_RESTORED' else 'MOCK_REFUND' end);
  else
    raise exception 'UNKNOWN_CHOICE';
  end if;

  insert into match_resolutions (application_id, choice, target_round_id, target_region_code, new_application_id, user_ticket_id, refund_id)
  values (p_app, p_choice, p_round, p_region, v_new, v_app.user_ticket_id, v_refund);

  return jsonb_build_object('already_resolved', false, 'choice', p_choice, 'new_application_id', v_new, 'refund_id', v_refund,
                            'ticket_restored', p_choice = 'KEEP' or (p_choice = 'REFUND' and v_is_sub));
end;
$$;

revoke all on function public.resolve_match_failure(uuid, uuid, text, uuid, text) from public, anon, authenticated;

-- Participants read their own offers, resolution and refund (S-06).
create policy own_read on public.alternative_offers for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.profile_id = auth.uid()));
create policy own_read on public.match_resolutions for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.profile_id = auth.uid()));
create policy own_read on public.refunds for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.profile_id = auth.uid()));
