-- F-50 피드백 미응답 리마인드: once the feedback request is older than the set hours and there is still no
-- feedback, send one reminder (and never a second). Only people who were asked (real events) get it;
-- people who gave notice of absence or were no-shows are left out. It never blocks the next application.
insert into public.app_settings (key, value, description)
values ('feedback_remind_hours', '24'::jsonb, '피드백 요청 후 리마인드까지 시간')
on conflict (key) do nothing;

create or replace function public.send_feedback_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_hours int := coalesce((select value::text::int from app_settings where key = 'feedback_remind_hours'), 24);
  v_count int;
begin
  insert into notifications (profile_id, type, title, body, link, dedupe_key)
  select a.profile_id, 'FEEDBACK_REMIND', '지난 식탁, 어떠셨는지 들려주세요',
         '1분이면 충분해요. 남겨 주신 피드백은 다음 식탁을 고를 때 반영돼요.',
         '/applications/' || a.id || '/feedback', 'feedback-remind:' || a.id
  from notifications n
  join applications a on n.dedupe_key = 'feedback:' || a.id
  where n.created_at < now() - make_interval(hours => v_hours)
    and a.attendance_status in ('ATTENDED', 'SCHEDULED')
    and not exists (select 1 from feedbacks f where f.application_id = a.id)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.send_feedback_reminders() from public, anon, authenticated;
