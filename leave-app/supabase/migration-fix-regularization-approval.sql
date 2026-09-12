-- Fix: approving an attendance regularization did not actually resolve the
-- attendance day for approvers who are configured via approver_config but
-- aren't role='manager'/'admin' — the client's follow-up update to
-- attendance.status was silently rejected by attendance_update's RLS policy
-- (its error wasn't even checked). It also never applied the employee's
-- proposed check-out time or recomputed hours.
--
-- Run this once against the live Supabase project (SQL Editor). Safe to
-- re-run: create-or-replace / drop-if-exists throughout.

create or replace function public.apply_regularization_decision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date      date;
  v_check_in  timestamptz;
  v_check_out timestamptz;
begin
  if new.status = 'approved' then
    select date, check_in_time into v_date, v_check_in
    from public.attendance where id = new.attendance_id;

    v_check_out := coalesce(new.check_out_time, v_check_in);

    insert into public.attendance_punches (attendance_id, employee_id, punch_type, punch_time, address)
    values (new.attendance_id, new.employee_id, 'check_out', v_check_out, 'Regularized');

    update public.attendance
    set status = 'present',
        check_out_time = v_check_out,
        check_out_address = 'Regularized',
        total_hours = round((extract(epoch from (v_check_out - v_check_in)) / 3600.0)::numeric, 2)
    where id = new.attendance_id;

  elsif new.status = 'rejected' then
    update public.attendance set status = 'incomplete' where id = new.attendance_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_apply_regularization_decision on public.attendance_regularizations;
create trigger trg_apply_regularization_decision
  after update on public.attendance_regularizations
  for each row
  when (old.status is distinct from new.status)
  execute function public.apply_regularization_decision();
