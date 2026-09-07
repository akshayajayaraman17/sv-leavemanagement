-- ============================================================
-- BULK-SET COMPANY-WIDE APPROVER CHAIN — run in Supabase SQL Editor
-- ============================================================
-- Sets the same 3-person approver chain (in priority order) on every
-- CURRENT (is_active = true) employee's approver_config, replacing
-- whatever was there before. An employee who is themselves one of the
-- 3 is skipped as their own approver (kept out of their own chain) but
-- keeps the other two in priority order — never routes a request to
-- the requester.
--
-- Approvers, in priority order (#1 first): EMP-001, EMP-007, EMP-022.
-- Edit APPROVER_CODES below before running if this ever needs to change.

do $$
declare
  approver_codes text[] := array['EMP-001', 'EMP-007', 'EMP-022'];
  approver_ids   uuid[];
  emp            record;
  chain          uuid[];
  i              int;
begin
  select array_agg(id order by ord)
  into approver_ids
  from unnest(approver_codes) with ordinality as u(code, ord)
  join public.employees e on e.employee_code = u.code;

  if array_length(approver_ids, 1) is distinct from array_length(approver_codes, 1) then
    raise exception 'One or more approver_codes not found in employees — check % against employee_code',
      approver_codes;
  end if;

  for emp in select id from public.employees where is_active = true loop
    chain := array(select x from unnest(approver_ids) x where x <> emp.id);

    delete from public.approver_config where employee_id = emp.id;

    for i in 1 .. array_length(chain, 1) loop
      insert into public.approver_config (employee_id, approver_id, priority)
      values (emp.id, chain[i], i);
    end loop;
  end loop;
end $$;
