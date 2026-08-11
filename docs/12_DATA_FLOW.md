# 12. Data Flow

## 1. General Request Pattern

Every screen follows the same shape: component mounts → `useEffect` fires one or more `api.js` calls in parallel via `Promise.all` → local `useState` holds the result → user interacts → a mutation call fires → local state is optimistically or re-fetch-updated → `onToast()` reports success/failure. There is no global cache/store, so navigating away and back always re-fetches from scratch.

## 2. Leave Application — Data Flow

```mermaid
sequenceDiagram
    participant U as Employee (browser)
    participant PG as Postgres (PostgREST/RLS)
    participant TR as DB Triggers

    U->>PG: rpc get_leave_balance(emp_id)
    PG-->>U: per-type total/used/remaining
    U->>PG: rpc get_approver(emp_id)
    PG-->>U: approver_id
    U->>PG: select company_holidays
    Note over U: workingDays() computed client-side<br/>validate(): balance, dates, certificate
    U->>PG: [if sick] Storage upload medical-certificates/{uid}/...
    U->>PG: insert leave_requests {employee_id, leave_type, from_date, to_date, days, reason, approver_id, medical_certificate_url}
    PG->>TR: enforce_approver_id() BEFORE INSERT
    TR-->>PG: approver_id overwritten via get_approver()
    PG->>PG: no_overlapping_leave GiST exclusion check
    alt overlap exists
        PG-->>U: error (constraint name no_overlapping_leave)
        Note over U: friendly message shown
    else no overlap
        PG-->>U: row created, status=pending
    end
```

## 3. Leave/Comp-Off/Timesheet/Regularization Approval — Data Flow

```mermaid
sequenceDiagram
    participant M as Manager/Admin (browser)
    participant PG as Postgres (PostgREST/RLS)
    participant EF as send-notification (Edge Fn)
    participant R as Resend API
    participant E as Requesting Employee

    M->>PG: select pending rows where approver_id=self (RLS-scoped)
    M->>PG: update status='approved'|'rejected', decided_on, reject_reason
    Note over PG: RLS: approver_id=auth.uid() OR is_admin()
    PG-->>M: row updated
    M->>EF: functions.invoke send-notification {table, recordId}  (fire-and-forget)
    EF->>PG: re-select row using caller's OWN JWT (re-validates via RLS)
    alt status not approved/rejected
        EF-->>M: 400 (silently ignored by caller)
    else valid
        EF->>R: send email to employee.email
        R-->>EF: sent
    end
    Note over M: failure only console.error'd — approver never sees a failed-notification warning
    E->>PG: (next visit) select own leave_requests — sees new status/reject_reason
```

## 4. Attendance Check-In/Out — Data Flow

```mermaid
sequenceDiagram
    participant U as Employee (browser)
    participant GEO as Browser Geolocation API
    participant OSM as OpenStreetMap Nominatim (public, keyless)
    participant PG as Postgres

    U->>GEO: getCurrentPosition()
    alt denied/unsupported
        GEO-->>U: error — check-in blocked entirely, no manual fallback
    else granted
        GEO-->>U: {lat, lng}
        U->>OSM: reverse geocode lat,lng  (direct browser call, no proxy)
        OSM-->>U: address (or raw lat/lng string on failure)
        U->>PG: upsert attendance (employee_id,date) {check_in_time, lat, lng, address, status:'present'}
        U->>PG: insert attendance_punches {punch_type:'check_in', ...}
        PG-->>U: row upserted
    end
    Note over U: Check-out repeats the geolocation+geocode steps,<br/>then recalculates total_hours client-side via calcHoursFromPunches()
```

## 5. Employee Onboarding (Single Add) — Data Flow

```mermaid
sequenceDiagram
    participant A as Admin (browser)
    participant EF as create-employee (Edge Fn, service role)
    participant AU as Supabase Auth (GoTrue)
    participant PG as Postgres

    A->>EF: functions.invoke create-employee {email, password, full_name, ...}
    EF->>PG: select employees.role where id = caller (using caller's JWT)
    alt caller not admin
        EF-->>A: 403
    else caller is admin
        EF->>AU: adminClient.auth.admin.createUser({email, password, email_confirm:true})
        AU-->>EF: new auth user id
        EF->>PG: insert employees {..., must_change_password:true} (service-role client, bypasses RLS)
        alt insert fails
            EF->>AU: adminClient.auth.admin.deleteUser(newUserId)  (rollback)
            EF-->>A: 500
        else success
            EF-->>A: 201 {id, ...employeeRow}
        end
    end
    Note over A: Admin then separately upserts salary_details, approver_config, leave_adjustments — 3 more direct PostgREST calls, not part of the Edge Function
```

## 6. Notifications Feed — Data Flow (client-side synthesis, no dedicated table)

```mermaid
flowchart LR
    LR[leave_requests] --> N[Notifications.jsx client synthesis]
    CR[comp_off_requests] --> N
    TS[timesheets] --> N
    AR[attendance_regularizations] --> N
    LA[leave_adjustments] --> N
    N --> F[Reverse-chronological feed<br/>+ pinned 'N pending your approval' banner for approvers]
```

No `notifications` table exists — every visit re-fetches all 5 source tables and re-derives the feed client-side. No read/unread state; nothing is server-persisted about what a user has seen.

## 7. Cross-Cutting Observations

- **No server-side recomputation of client-computed values** in the leave/comp-off/attendance/timesheet flows — `days`, `earned_days`, `total_hours` are all trusted as sent by the client (see `08_BUSINESS_RULES.md` for the full UI-only-vs-DB-enforced breakdown).
- **Notifications are best-effort and invisible on failure** — the only place a network failure to a third party (Resend) is silently swallowed rather than surfaced to the user who took the action.
- **Nominatim is the only third-party call made directly from the browser** rather than proxied through an Edge Function — every other external call (Resend, Jira) goes through a Deno function that holds the actual secret.
