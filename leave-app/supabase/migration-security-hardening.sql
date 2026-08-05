-- ============================================================
-- SECURITY HARDENING — run in Supabase SQL Editor
-- ============================================================
-- Fixes:
--   1. leave_requests was missing medical_certificate_url (schema drift —
--      the column was referenced by the app but never added to a tracked
--      migration; sick-leave submissions with a certificate could fail).
--   2. approver_id on leave_requests / comp_off_requests /
--      attendance_regularizations was accepted as client-supplied input on
--      insert. A user could set approver_id to their own id (or anyone
--      else's) and later approve their own request, since the update
--      policies trust approver_id = auth.uid(). This is now computed
--      server-side on every insert, ignoring whatever the client sent.
--   3. jira_accounts let admins read every employee's raw Jira API token.
--      Admins have no legitimate need to see another user's personal
--      token, so the select policy is narrowed to the owner only.
--   4. medical-certificates storage bucket is switched to private with
--      RLS-backed access instead of permanent public URLs. Existing public
--      links will stop working after this runs — the app now generates
--      short-lived signed URLs on demand instead.

-- ── 1. Schema drift fix ─────────────────────────────────────────────────────
alter table public.leave_requests
  add column if not exists medical_certificate_url text;

-- ── 2. Enforce approver_id server-side ──────────────────────────────────────
create or replace function public.enforce_approver_id()
returns trigger language plpgsql as $$
begin
  new.approver_id := public.get_approver(new.employee_id);
  return new;
end;
$$;

drop trigger if exists trg_leave_requests_approver on public.leave_requests;
create trigger trg_leave_requests_approver
  before insert on public.leave_requests
  for each row execute function public.enforce_approver_id();

drop trigger if exists trg_comp_off_requests_approver on public.comp_off_requests;
create trigger trg_comp_off_requests_approver
  before insert on public.comp_off_requests
  for each row execute function public.enforce_approver_id();

drop trigger if exists trg_attendance_regularizations_approver on public.attendance_regularizations;
create trigger trg_attendance_regularizations_approver
  before insert on public.attendance_regularizations
  for each row execute function public.enforce_approver_id();

-- ── 3. Jira token RLS: owner-only ───────────────────────────────────────────
drop policy if exists "jira_accounts_select_own_or_admin" on public.jira_accounts;
drop policy if exists "jira_accounts_select_own" on public.jira_accounts;
create policy "jira_accounts_select_own" on public.jira_accounts for select using (
  auth.uid() = employee_id
);

-- ── 4. Medical certificates: private bucket + RLS ───────────────────────────
insert into storage.buckets (id, name, public)
values ('medical-certificates', 'medical-certificates', false)
on conflict (id) do update set public = false;

drop policy if exists "medical_certs_insert_own" on storage.objects;
create policy "medical_certs_insert_own" on storage.objects for insert
  with check (
    bucket_id = 'medical-certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "medical_certs_select_own_or_reviewer" on storage.objects;
create policy "medical_certs_select_own_or_reviewer" on storage.objects for select
  using (
    bucket_id = 'medical-certificates'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_manager()
    )
  );
