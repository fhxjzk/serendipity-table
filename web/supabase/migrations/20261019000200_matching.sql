-- Matching persistence (기능 명세서 F-25, F-29~F-32, F-34).
-- The engine runs in the app server; this function re-validates and saves its
-- result in one transaction, so a run is applied fully or not at all, and a
-- run_key that already exists returns the earlier run instead of matching twice.

insert into public.app_settings (key, value, description)
values ('coupon', '{"discount_rate":30,"valid_days":60}'::jsonb, '보상 쿠폰 할인율(%)과 유효기간(일)')
on conflict (key) do nothing;

create or replace function public.apply_match_run(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round public.rounds;
  v_run_id uuid;
  v_existing uuid;
  v_size jsonb := (select value from app_settings where key = 'table_size');
  v_gap int := (select value::text::int from app_settings where key = 'max_age_gap');
  v_coupon jsonb := (select value from app_settings where key = 'coupon');
  v_table jsonb;
  v_table_ids uuid[] := '{}';
  v_table_id uuid;
  v_members uuid[];
  v_fail jsonb;
  v_ev jsonb;
  v_bad int;
  v_offers int;
begin
  select * into v_round from rounds where id = (p->>'round_id')::uuid for update;
  if not found then raise exception 'round not found'; end if;

  select id into v_existing from match_runs where run_key = p->>'run_key';
  if found then
    return jsonb_build_object('run_id', v_existing, 'already_applied', true);
  end if;
  if v_round.status <> 'OPEN' then
    raise exception 'round % is %, not OPEN', v_round.id, v_round.status;
  end if;

  insert into match_runs (round_id, run_key, trigger, algorithm_version, settings_snapshot)
  values (v_round.id, p->>'run_key', p->>'trigger', p->>'algorithm_version', p->'settings_snapshot')
  returning id into v_run_id;

  -- Tables: re-check every hard rule right before confirming.
  for v_table in select * from jsonb_array_elements(p->'tables') loop
    select array_agg(x::uuid) into v_members from jsonb_array_elements_text(v_table->'members') x;

    if cardinality(v_members) < (v_size->>'min')::int or cardinality(v_members) > (v_size->>'max')::int then
      raise exception 'table size % out of range', cardinality(v_members);
    end if;

    select count(*) into v_bad
    from applications a
    where a.id = any(v_members)
      and a.is_active and a.application_status = 'SUBMITTED' and a.payment_status = 'PAID'
      and a.match_status in ('WAITING', 'MATCHING', 'REALLOCATING')
      and exists (select 1 from application_choices c where c.application_id = a.id
                  and c.round_id = v_round.id and c.region_code = v_table->>'region_code');
    if v_bad <> cardinality(v_members) then
      raise exception 'table has members that are not matchable for this round and region';
    end if;

    select max(pr.birth_year) - min(pr.birth_year) into v_bad
    from applications a join profiles pr on pr.id = a.profile_id where a.id = any(v_members);
    if v_bad > v_gap then raise exception 'age gap % exceeds %', v_bad, v_gap; end if;

    select count(*) into v_bad
    from relations r
    where r.type in ('DISLIKE', 'BLOCK', 'REPORT')
      and r.from_profile_id in (select a.profile_id from applications a where a.id = any(v_members))
      and r.to_profile_id in (select a.profile_id from applications a where a.id = any(v_members));
    if v_bad > 0 then raise exception 'table contains a blocked, reported or disliked pair'; end if;

    insert into dining_tables (round_id, region_code, match_run_id, status, score, score_detail, confirmed_at)
    values (v_round.id, v_table->>'region_code', v_run_id, 'CONFIRMED', (v_table->>'score')::numeric, v_table->'score_detail', now())
    returning id into v_table_id;
    v_table_ids := v_table_ids || v_table_id;

    insert into table_members (table_id, round_id, application_id, profile_id)
    select v_table_id, v_round.id, a.id, a.profile_id from applications a where a.id = any(v_members);
    insert into status_history (application_id, field, from_value, to_value, actor_type, reason)
    select a.id, 'MATCH', a.match_status, 'CONFIRMED', 'SYSTEM', 'AUTO_CONFIRM' from applications a where a.id = any(v_members);
    update applications set match_status = 'CONFIRMED', table_id = v_table_id, reason_code = 'AUTO_CONFIRM', updated_at = now()
    where id = any(v_members);
  end loop;

  -- Failures: wait for a later chosen round, or offer alternatives + refund + coupon.
  for v_fail in select * from jsonb_array_elements(p->'failures') loop
    if (v_fail->>'waits')::boolean then
      update applications set reason_code = 'WAIT_NEXT_ROUND', updated_at = now() where id = (v_fail->>'application_id')::uuid;
      continue;
    end if;

    insert into alternative_offers (application_id, round_id, region_code, rank)
    select (v_fail->>'application_id')::uuid, (o->>'round_id')::uuid, o->>'region_code', (o->>'rank')::int
    from jsonb_array_elements(coalesce(v_fail->'offers', '[]'::jsonb)) o
    on conflict do nothing;
    get diagnostics v_offers = row_count;

    insert into status_history (application_id, field, from_value, to_value, actor_type, reason)
    select a.id, 'MATCH', a.match_status, case when v_offers > 0 then 'ALTERNATIVE_OFFERED' else 'EXCEPTION' end, 'SYSTEM', v_fail->>'reason'
    from applications a where a.id = (v_fail->>'application_id')::uuid
    union all
    select a.id, 'PAYMENT', a.payment_status, 'REFUND_AVAILABLE', 'SYSTEM', v_fail->>'reason'
    from applications a where a.id = (v_fail->>'application_id')::uuid;

    update applications
    set match_status = case when v_offers > 0 then 'ALTERNATIVE_OFFERED' else 'EXCEPTION' end,
        payment_status = 'REFUND_AVAILABLE', reason_code = v_fail->>'reason', updated_at = now()
    where id = (v_fail->>'application_id')::uuid;

    insert into coupons (profile_id, reason, discount_rate, valid_until)
    select a.profile_id, 'REALLOC_FAILED', (v_coupon->>'discount_rate')::int, current_date + (v_coupon->>'valid_days')::int
    from applications a where a.id = (v_fail->>'application_id')::uuid;

    if v_offers = 0 then
      insert into exceptions (type, round_id, application_id, reason, detail, dedupe_key)
      values ('MATCH_FAILED_ALL', v_round.id, (v_fail->>'application_id')::uuid, v_fail->>'reason', '{}'::jsonb,
              'match_failed_all:' || (v_fail->>'application_id'))
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;

  -- Processing log for the operator monitor (F-63).
  for v_ev in select * from jsonb_array_elements(p->'events') loop
    insert into match_events (match_run_id, application_id, event_type, to_table_id, reason_code, detail)
    values (v_run_id, (v_ev->>'application_id')::uuid, v_ev->>'type',
            case when v_ev ? 'table_index' then v_table_ids[(v_ev->>'table_index')::int + 1] end,
            v_ev->>'reason', coalesce(v_ev->'detail', '{}'::jsonb));
  end loop;

  update rounds set status = 'MATCHED' where id = v_round.id;
  update match_runs set status = 'DONE', stats = p->'stats', finished_at = now() where id = v_run_id;
  return jsonb_build_object('run_id', v_run_id, 'already_applied', false, 'tables', to_jsonb(v_table_ids));
end;
$$;

-- Demo only (F-76): undo a round's matching so the same data can be matched again.
create or replace function public.reset_round_matching(p_round_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz := (select min(started_at) from match_runs where round_id = p_round_id);
  v_apps uuid[] := (select array_agg(distinct application_id) from application_choices where round_id = p_round_id);
begin
  if v_since is null then return; end if;
  delete from match_events where match_run_id in (select id from match_runs where round_id = p_round_id);
  delete from coupons where reason = 'REALLOC_FAILED' and source_table_id is null and issued_at >= v_since
    and profile_id in (select profile_id from applications where id = any(v_apps));
  delete from alternative_offers where application_id = any(v_apps);
  delete from exceptions where round_id = p_round_id and type = 'MATCH_FAILED_ALL';
  delete from status_history where actor_type = 'SYSTEM' and field in ('MATCH', 'PAYMENT')
    and application_id = any(v_apps) and created_at >= v_since;
  update applications set match_status = 'WAITING', payment_status = 'PAID', table_id = null, reason_code = null, updated_at = now()
  where id = any(v_apps) and is_active;
  delete from table_members where round_id = p_round_id;
  delete from chat_messages where room_id in (select r.id from chat_rooms r join dining_tables t on t.id = r.table_id where t.round_id = p_round_id);
  delete from chat_rooms where table_id in (select id from dining_tables where round_id = p_round_id);
  delete from dining_tables where round_id = p_round_id;
  delete from match_runs where round_id = p_round_id;
  update rounds set status = 'OPEN' where id = p_round_id and status = 'MATCHED';
end;
$$;

revoke all on function public.apply_match_run(jsonb) from public, anon, authenticated;
revoke all on function public.reset_round_matching(uuid) from public, anon, authenticated;
