-- Application and mock payment (기능 명세서 F-09, F-10, F-11, F-13, F-14).
-- Both run as one transaction each and are called by server actions with the
-- service role after the session user is checked.

-- Profiles are edited through a server action that whitelists fields; a direct
-- update from the browser could also change role or restriction.
drop policy if exists own_update on public.profiles;

-- F-14: an unpaid application past its deadline stops being active (payment stays
-- PENDING), so it leaves the matching pool and no longer blocks a new application.
create or replace function public.expire_unpaid_applications(p_profile uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  with expired as (
    update applications set is_active = false, reason_code = 'PAYMENT_EXPIRED', updated_at = now()
    where is_active and payment_status = 'PENDING' and payment_due_at < now()
      and (p_profile is null or profile_id = p_profile)
    returning id
  )
  insert into status_history (application_id, field, from_value, to_value, actor_type, reason)
  select id, 'APPLICATION', 'SUBMITTED', 'SUBMITTED', 'SYSTEM', 'PAYMENT_EXPIRED' from expired;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.submit_application(p_profile uuid, p_choices jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles;
  v_app uuid;
  v_valid int;
  v_total int := jsonb_array_length(coalesce(p_choices, '[]'::jsonb));
  v_due timestamptz;
begin
  select * into v_profile from profiles where id = p_profile for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_profile.restriction = 'BANNED'
     or (v_profile.restriction = 'RESTRICTED' and (v_profile.restricted_until is null or v_profile.restricted_until >= current_date)) then
    raise exception 'RESTRICTED';
  end if;
  if v_profile.privacy_agreed_at is null or v_profile.policy_agreed_at is null
     or cardinality(v_profile.interests) = 0 or cardinality(v_profile.self_traits) = 0
     or cardinality(v_profile.wanted_traits) = 0 or cardinality(v_profile.price_ranges) = 0 then
    raise exception 'PROFILE_INCOMPLETE';
  end if;
  perform expire_unpaid_applications(p_profile);
  if exists (select 1 from applications where profile_id = p_profile and is_active) then
    raise exception 'ALREADY_APPLIED';
  end if;
  if v_total = 0 then raise exception 'NO_CHOICE'; end if;

  -- Every choice must be an open round still taking applications, in a served region.
  select count(*) into v_valid
  from jsonb_to_recordset(p_choices) c(round_id uuid, region_code text)
  join rounds r on r.id = c.round_id and r.status = 'OPEN' and r.apply_deadline_at > now()
  join round_regions rr on rr.round_id = c.round_id and rr.region_code = c.region_code and rr.capacity > 0
  where c.region_code <> 'ETC';
  if v_valid <> v_total then raise exception 'INVALID_CHOICE'; end if;

  -- Pay within 24 hours, but never later than the earliest matching run (F-14).
  select least(now() + interval '24 hours', min(r.match_run_at)) into v_due
  from jsonb_to_recordset(p_choices) c(round_id uuid, region_code text) join rounds r on r.id = c.round_id;

  insert into applications (profile_id, application_status, payment_status, match_status, payment_due_at, submitted_at)
  values (p_profile, 'SUBMITTED', 'PENDING', 'WAITING', v_due, now())
  returning id into v_app;

  insert into application_choices (application_id, round_id, region_code)
  select distinct v_app, c.round_id, c.region_code from jsonb_to_recordset(p_choices) c(round_id uuid, region_code text);

  insert into status_history (application_id, field, from_value, to_value, actor_type, actor_id, reason)
  values (v_app, 'APPLICATION', null, 'SUBMITTED', 'PARTICIPANT', p_profile, 'SUBMIT'),
         (v_app, 'PAYMENT', null, 'PENDING', 'PARTICIPANT', p_profile, 'SUBMIT');
  return v_app;
end;
$$;

-- p_option: 'TICKET' (use p_ticket) or a product code to buy (SINGLE, PACK3, PACK4).
create or replace function public.pay_application(p_profile uuid, p_app uuid, p_option text, p_ticket uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_app applications;
  v_ticket user_tickets;
  v_product ticket_products;
  v_coupon coupons;
  v_payment uuid;
  v_discount int := 0;
  v_last_date date;
begin
  select * into v_app from applications where id = p_app and profile_id = p_profile for update;
  if not found then raise exception 'APPLICATION_NOT_FOUND'; end if;
  if v_app.payment_status = 'PAID' then
    return jsonb_build_object('already_paid', true);
  end if;
  if not v_app.is_active or v_app.application_status <> 'SUBMITTED' or v_app.payment_status <> 'PENDING' then
    raise exception 'NOT_PAYABLE';
  end if;
  if v_app.payment_due_at is not null and v_app.payment_due_at < now() then
    raise exception 'PAYMENT_EXPIRED';
  end if;
  select max(r.event_date) into v_last_date from application_choices c join rounds r on r.id = c.round_id where c.application_id = p_app;

  if p_option = 'TICKET' then
    select * into v_ticket from user_tickets
    where id = p_ticket and profile_id = p_profile and status = 'ACTIVE' and remaining_uses > 0
      and (valid_until is null or valid_until >= v_last_date)
    for update;
    if not found then raise exception 'TICKET_NOT_USABLE'; end if;
  else
    select * into v_product from ticket_products where code = p_option and active;
    if not found then raise exception 'UNKNOWN_PRODUCT'; end if;

    -- Best unused compensation coupon is applied automatically (F-13).
    select * into v_coupon from coupons
    where profile_id = p_profile and status = 'ISSUED' and (valid_until is null or valid_until >= current_date)
    order by discount_rate desc nulls last, issued_at limit 1 for update;
    if found then v_discount := round(v_product.price * coalesce(v_coupon.discount_rate, 0) / 100.0); end if;

    insert into payments (profile_id, application_id, product_code, amount, discount_amount, coupon_id, status, idempotency_key, paid_at)
    values (p_profile, p_app, v_product.code, v_product.price - v_discount, v_discount, v_coupon.id, 'PAID', 'pay:' || p_app, now())
    returning id into v_payment;
    if v_coupon.id is not null then update coupons set status = 'USED' where id = v_coupon.id; end if;

    insert into user_tickets (profile_id, product_code, source, total_uses, remaining_uses, valid_until, payment_id)
    values (p_profile, v_product.code, 'PURCHASE', v_product.uses, v_product.uses,
            case when v_product.valid_days is null then null else current_date + v_product.valid_days end, v_payment)
    returning * into v_ticket;
    insert into ticket_ledger (user_ticket_id, application_id, delta, reason) values (v_ticket.id, null, v_product.uses, 'PURCHASE');
  end if;

  update user_tickets set remaining_uses = remaining_uses - 1,
         status = case when remaining_uses - 1 = 0 then 'USED_UP' else status end
  where id = v_ticket.id;
  insert into ticket_ledger (user_ticket_id, application_id, delta, reason) values (v_ticket.id, p_app, -1, 'USE');

  update applications set payment_status = 'PAID', ticket_product_code = v_ticket.product_code, user_ticket_id = v_ticket.id, updated_at = now()
  where id = p_app;
  insert into status_history (application_id, field, from_value, to_value, actor_type, actor_id, reason)
  values (p_app, 'PAYMENT', 'PENDING', 'PAID', 'PARTICIPANT', p_profile, case when p_option = 'TICKET' then 'TICKET_USE' else 'MOCK_PAYMENT' end);

  return jsonb_build_object(
    'already_paid', false, 'payment_id', v_payment, 'product', v_ticket.product_code,
    'amount', case when v_payment is null then 0 else v_product.price - v_discount end,
    'discount', v_discount, 'remaining_uses', v_ticket.remaining_uses - 1);
end;
$$;

revoke all on function public.expire_unpaid_applications(uuid) from public, anon, authenticated;
revoke all on function public.submit_application(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.pay_application(uuid, uuid, text, uuid) from public, anon, authenticated;
