-- One retry setting, as in the functional spec (2.4 발송·배정 재시도 최대 3회): retry_max_attempts.
-- 001500 had added a second key, delivery_max_attempts, for the same thing; deliveries now read the spec's key.
update public.app_settings set description = '발송·배정 자동 재시도 횟수(넘으면 예외 처리함)' where key = 'retry_max_attempts';
delete from public.app_settings where key = 'delivery_max_attempts';

create or replace function public.finish_delivery(p_id uuid, p_result text, p_error text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  d deliveries;
  v_max int := coalesce((select value::text::int from app_settings where key = 'retry_max_attempts'), 3);
  n notifications;
begin
  select * into d from deliveries where id = p_id for update;
  if not found then return 'GONE'; end if;
  if p_result = 'SENT' then
    update deliveries set status = 'SENT', attempts = least(attempts + 1, 10), sent_at = now(), next_retry_at = null, last_error = null where id = p_id;
    update exceptions set status = 'RESOLVED', resolved_at = now(), resolution_note = '재시도로 발송됨'
    where dedupe_key = 'delivery:' || p_id and status <> 'RESOLVED';
    return 'SENT';
  elsif p_result = 'SKIPPED' then
    update deliveries set status = 'SKIPPED', next_retry_at = null, last_error = p_error where id = p_id;
    return 'SKIPPED';
  end if;
  if d.attempts + 1 >= v_max then
    update deliveries set status = 'FAILED', attempts = least(attempts + 1, 10), next_retry_at = null, last_error = p_error where id = p_id;
    select * into n from notifications where id = d.notification_id;
    insert into exceptions (type, application_id, reason, detail, dedupe_key)
    values ('DELIVERY_FAILED',
            case when n.link ~ '^/applications/[0-9a-f-]{36}' then substr(n.link, 15, 36)::uuid end,
            case d.channel when 'PUSH' then '웹 푸시' else '이메일' end || ' 발송 ' || (d.attempts + 1) || '회 실패',
            jsonb_build_object('delivery_id', p_id, 'channel', d.channel, 'notification', n.title, 'profile_id', n.profile_id, 'error', p_error),
            'delivery:' || p_id)
    on conflict (dedupe_key) do update set status = 'OPEN', resolved_at = null, reason = excluded.reason, detail = excluded.detail;
    return 'FAILED';
  end if;
  -- 1, 2, 4 ... minutes between tries.
  update deliveries set attempts = attempts + 1, last_error = p_error,
         next_retry_at = now() + interval '1 minute' * power(2, d.attempts)
  where id = p_id;
  return 'RETRY';
end;
$$;
revoke all on function public.finish_delivery(uuid, text, text) from public, anon, authenticated;
