import { supabase } from './supabase'
import { todayStr } from './dates'

// ─── Auth ────────────────────────────────────────────────────────────────────
export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const getSession = () => supabase.auth.getSession()

// ─── Employees ───────────────────────────────────────────────────────────────
// Unbounded selects on a growing table are a real cost eventually — this
// caps it well above any realistic roster size rather than leaving it
// truly open-ended.
export const fetchEmployees = async (limit = 2000) => {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('full_name')
    .limit(limit)
  return { data, error }
}

export const fetchEmployee = async (id) => {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .single()
  return { data, error }
}

// Every admin-only Edge Function (create/offboard/reset-password) returns
// errors the same way — this unwraps supabase-js's wrapped function-error
// shape down to the actual server message once, instead of each call site
// re-implementing it.
const invokeAdminFn = async (name, body) => {
  const { data, error } = await supabase.functions.invoke(name, { body })

  if (error) {
    let message = error.message || 'Request failed'
    if (typeof error.context?.json === 'function') {
      try {
        const errBody = await error.context.json()
        if (errBody?.error) message = errBody.error
      } catch { /* response body wasn't JSON — fall back to error.message */ }
    }
    return { data: null, error: message }
  }
  if (data?.error) return { data: null, error: data.error }

  return { data, error: null }
}

// Admin: create employee — delegates to the create-employee Edge Function,
// which verifies the caller is an admin and uses the service_role key to
// create the auth user + employee record atomically (rolling back the auth
// user if the employee insert fails).
export const createEmployee = (payload) => invokeAdminFn('create-employee', {
  email: payload.email,
  password: payload.password,
  full_name: payload.full_name,
  employee_code: payload.employee_code,
  phone: payload.phone || null,
  department: payload.department || null,
  designation: payload.designation || null,
  role: payload.role || 'employee',
  joining_date: payload.joining_date,
  date_of_birth: payload.date_of_birth || null,
  manager_id: payload.manager_id || null,
})

// Reassign every EMP-NNN code in joining-date order. Admin-only, enforced
// in the SECURITY DEFINER function. Call after adding a hire or changing an
// existing joining_date so codes stay in seniority order.
export const renumberEmployeeCodes = () => supabase.rpc('renumber_employee_codes')

export const updateEmployee = async (id, updates) => {
  const { data, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// Admin: deactivate/reactivate — delegates to the offboard-employee Edge
// Function, which uses the service_role key to actually ban/unban the
// Supabase Auth account. A bare is_active update never blocked sign-in —
// nothing at the Auth layer or in RLS ever checked it.
export const deactivateEmployee = (id, { exitDate, exitReason } = {}) =>
  invokeAdminFn('offboard-employee', { id, action: 'deactivate', exit_date: exitDate || null, exit_reason: exitReason || null })

export const reactivateEmployee = (id) =>
  invokeAdminFn('offboard-employee', { id, action: 'reactivate' })

// Admin: set an employee's password directly (no email involved) —
// delegates to the reset-employee-password Edge Function. Exists as a
// way to unblock someone that doesn't depend on the Forgot Password
// flow's SMTP being correctly configured. Forces a password change on
// their next login, same as any other admin-set password.
export const resetEmployeePassword = (id, password) =>
  invokeAdminFn('reset-employee-password', { id, password })

// ─── Jira integration ─────────────────────────────────────────────────────────
export const fetchJiraAccount = async (employeeId) => {
  const { data, error } = await supabase
    .from('jira_accounts')
    .select('*')
    .eq('employee_id', employeeId)
    .maybeSingle()
  return { data, error }
}

export const upsertJiraAccount = async (payload) => {
  const { data, error } = await supabase
    .from('jira_accounts')
    .upsert(payload, { onConflict: 'employee_id' })
    .select()
    .single()
  return { data, error }
}

export const deleteJiraAccount = async (employeeId) => {
  const { data, error } = await supabase
    .from('jira_accounts')
    .delete()
    .eq('employee_id', employeeId)
  return { data, error }
}

export const postJiraWorklog = async (payload) => {
  const { data, error } = await supabase.functions.invoke('post-jira-worklog', {
    body: payload,
  })
  return { data, error }
}

// ─── Salary ──────────────────────────────────────────────────────────────────
export const fetchSalary = async (employeeId) => {
  const { data, error } = await supabase
    .from('salary_details')
    .select('*')
    .eq('employee_id', employeeId)
    .order('effective_from', { ascending: false })
    .limit(1)
    .single()
  return { data, error }
}

export const upsertSalary = async (payload) => {
  const { data, error } = await supabase
    .from('salary_details')
    .upsert(payload, { onConflict: 'employee_id' })
    .select()
    .single()
  return { data, error }
}

// ─── Approver Config ─────────────────────────────────────────────────────────
export const fetchApprovers = async (employeeId) => {
  const { data, error } = await supabase
    .from('approver_config')
    .select('*, approver:approver_id(id, full_name, avatar_initials, role)')
    .eq('employee_id', employeeId)
    .order('priority')
  return { data, error }
}

export const setApprovers = async (employeeId, approverIds) => {
  // Delete existing then insert new
  await supabase.from('approver_config').delete().eq('employee_id', employeeId)
  if (!approverIds.length) return { data: [], error: null }
  const rows = approverIds.map((id, i) => ({
    employee_id: employeeId,
    approver_id: id,
    priority: i + 1,
  }))
  const { data, error } = await supabase
    .from('approver_config')
    .insert(rows)
    .select()
  return { data, error }
}

// ─── Leave Balance ────────────────────────────────────────────────────────────
export const fetchLeaveBalance = async (employeeId) => {
  const { data, error } = await supabase
    .rpc('get_leave_balance', { emp_id: employeeId })
  return { data, error }
}

// ─── Leave Requests ───────────────────────────────────────────────────────────
export const fetchMyLeaves = async (employeeId) => {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .order('applied_on', { ascending: false })
  return { data, error }
}

// Admin-only (relies on the leave_requests_read RLS policy's is_admin() clause)
export const fetchAllLeaveRequests = async ({ from, to } = {}) => {
  let query = supabase
    .from('leave_requests')
    .select('*, employee:employee_id(full_name, employee_code, department)')
    .order('applied_on', { ascending: false })
  if (from) query = query.gte('from_date', from)
  if (to)   query = query.lte('from_date', to)
  const { data, error } = await query
  return { data, error }
}

export const fetchPendingForApprover = async (approverId) => {
  const { data, error } = await supabase
    .from('leave_requests')
    .select('*, employee:employee_id(full_name, avatar_initials, department)')
    .eq('approver_id', approverId)
    .eq('status', 'pending')
    .order('applied_on')
  return { data, error }
}

export const applyLeave = async (payload) => {
  const { data, error } = await supabase
    .from('leave_requests')
    .insert(payload)
    .select()
    .single()
  if (!error && data) notifyNewRequest('leave_requests', data.id)
  return { data, error }
}

// Admin: record a leave directly, pre-approved — for backdating or
// regularizing something an employee never applied for themselves.
// Needs the admin-insert RLS policy from migration-admin-add-leave.sql;
// approver_id is still computed server-side by the usual trigger.
export const adminAddLeave = async (payload) => {
  const { data, error } = await supabase
    .from('leave_requests')
    .insert({ ...payload, status: 'approved', decided_on: new Date().toISOString() })
    .select()
    .single()
  return { data, error }
}

// Best-effort decision-email notification — fire-and-forget, never blocks
// or fails the caller's approve/reject flow (the DB update already
// succeeded by the time this is called; email delivery is a side effect).
const notifyDecision = (table, id) => {
  supabase.functions.invoke('send-notification', { body: { table, recordId: id } })
    .then(({ error }) => { if (error) console.error('Notification failed:', error) })
    .catch(err => console.error('Notification failed:', err))
}

// Best-effort "a new request needs your approval" email to the assigned
// approver — fire-and-forget, same rationale as notifyDecision. Silently
// skipped server-side if the record has no approver (get_approver returned
// null), so this never surfaces that as an error to the requester.
const notifyNewRequest = (table, id) => {
  supabase.functions.invoke('send-notification', { body: { table, recordId: id, event: 'submitted' } })
    .then(({ error }) => { if (error) console.error('Notification failed:', error) })
    .catch(err => console.error('Notification failed:', err))
}

export const cancelLeave = async (id) => {
  const { data, error } = await supabase
    .from('leave_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const decideLeave = async (id, status, rejectReason = null) => {
  const { data, error } = await supabase
    .from('leave_requests')
    .update({ status, decided_on: new Date().toISOString(), reject_reason: rejectReason })
    .eq('id', id)
    .select()
    .single()
  if (!error) notifyDecision('leave_requests', id)
  return { data, error }
}

// ─── Comp Off Requests ────────────────────────────────────────────────────────
export const fetchMyCompRequests = async (employeeId) => {
  const { data, error } = await supabase
    .from('comp_off_requests')
    .select('*')
    .eq('employee_id', employeeId)
    .order('applied_on', { ascending: false })
  return { data, error }
}

export const fetchPendingCompForApprover = async (approverId) => {
  const { data, error } = await supabase
    .from('comp_off_requests')
    .select('*, employee:employee_id(full_name, avatar_initials, department)')
    .eq('approver_id', approverId)
    .eq('status', 'pending')
    .order('applied_on')
  return { data, error }
}

export const applyCompOff = async (payload) => {
  const { data, error } = await supabase
    .from('comp_off_requests')
    .insert(payload)
    .select()
    .single()
  if (!error && data) notifyNewRequest('comp_off_requests', data.id)
  return { data, error }
}

export const decideCompOff = async (id, status) => {
  const { data, error } = await supabase
    .from('comp_off_requests')
    .update({ status, decided_on: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (!error) notifyDecision('comp_off_requests', id)
  return { data, error }
}

export const grantCompOff = async (payload) => {
  const { data, error } = await supabase
    .from('comp_off_requests')
    .insert({
      ...payload,
      status: 'approved',
      decided_on: new Date().toISOString(),
    })
    .select()
    .single()
  return { data, error }
}

// ─── Get effective approver for an employee ───────────────────────────────────
export const getApproverForEmployee = async (employeeId) => {
  const { data, error } = await supabase
    .rpc('get_approver', { emp_id: employeeId })
  return { data, error }
}

// ─── Attendance ───────────────────────────────────────────────────────────────
export const fetchTodayAttendance = async (employeeId) => {
  const today = todayStr()
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', today)
    .maybeSingle()
  return { data, error }
}

export const fetchAttendanceForDate = async (employeeId, date) => {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', date)
    .maybeSingle()
  return { data, error }
}

export const fetchAttendanceHistory = async (employeeId, limit = 20) => {
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .order('date', { ascending: false })
    .limit(limit)
  return { data, error }
}

export const fetchAllAttendance = async (limit = 100, { from, to } = {}) => {
  let query = supabase
    .from('attendance')
    .select('*, employee:employee_id(full_name, avatar_initials, department)')
    .order('date', { ascending: false })
  if (from) query = query.gte('date', from)
  if (to)   query = query.lte('date', to)
  const { data, error } = await query.limit(limit)
  return { data, error }
}

export const checkIn = async (payload) => {
  const { data, error } = await supabase
    .from('attendance')
    .upsert(payload, { onConflict: 'employee_id,date' })
    .select()
    .single()
  return { data, error }
}

export const checkOut = async (id, payload) => {
  const { data, error } = await supabase
    .from('attendance')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ─── Attendance Punches ──────────────────────────────────────────────────────
export const fetchPunches = async (attendanceId) => {
  const { data, error } = await supabase
    .from('attendance_punches')
    .select('*')
    .eq('attendance_id', attendanceId)
    .order('punch_time', { ascending: true })
  return { data, error }
}

export const addPunch = async (payload) => {
  const { data, error } = await supabase
    .from('attendance_punches')
    .insert(payload)
    .select()
    .single()
  return { data, error }
}

// ─── Attendance Regularizations ──────────────────────────────────────────────
export const fetchMyRegularizations = async (employeeId) => {
  const { data, error } = await supabase
    .from('attendance_regularizations')
    .select('*, attendance:attendance_id(date)')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
  return { data, error }
}

export const createRegularization = async (payload) => {
  const { data, error } = await supabase
    .from('attendance_regularizations')
    .insert(payload)
    .select()
    .single()
  if (!error && data) notifyNewRequest('attendance_regularizations', data.id)
  return { data, error }
}

export const fetchPendingRegularizations = async (approverId) => {
  const { data, error } = await supabase
    .from('attendance_regularizations')
    .select('*, attendance:attendance_id(date, check_in_time, total_hours), employee:employee_id(full_name, avatar_initials, department)')
    .eq('approver_id', approverId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return { data, error }
}

export const decideRegularization = async (id, status, rejectReason = null) => {
  const updates = { status, decided_at: new Date().toISOString() }
  if (rejectReason) updates.reject_reason = rejectReason
  const { data, error } = await supabase
    .from('attendance_regularizations')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (!error) notifyDecision('attendance_regularizations', id)
  return { data, error }
}

// Finalize the placeholder attendance row a self-reported comp-off claim
// created. The row is written status='incomplete' (so it stays out of the
// eligible-days list and weekly totals) and flipped to 'present' only when
// the approver approves the comp off. Scoped to status='incomplete' so it
// can never downgrade a real, punched attendance record. Approver has the
// manager update grant on attendance.
export const finalizeSelfReportedAttendance = async (employeeId, date) => {
  const { data, error } = await supabase
    .from('attendance')
    .update({ status: 'present' })
    .eq('employee_id', employeeId)
    .eq('date', date)
    .eq('status', 'incomplete')
    .select()
  return { data, error }
}

export const updateAttendanceStatus = async (id, status) => {
  const { data, error } = await supabase
    .from('attendance')
    .update({ status })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ─── Timesheets ───────────────────────────────────────────────────────────────
export const fetchOrCreateTimesheet = async (employeeId, weekStart) => {
  const { data: existing } = await supabase
    .from('timesheets')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('week_start', weekStart)
    .maybeSingle()
  if (existing) return { data: existing, error: null }

  const { data: approverId } = await supabase.rpc('get_approver', { emp_id: employeeId })
  const { data, error } = await supabase
    .from('timesheets')
    .insert({ employee_id: employeeId, week_start: weekStart, approver_id: approverId || null })
    .select()
    .single()
  return { data, error }
}

export const fetchTimesheetEntries = async (timesheetId) => {
  const { data, error } = await supabase
    .from('timesheet_entries')
    .select('*')
    .eq('timesheet_id', timesheetId)
    .order('date')
    .order('created_at')
  return { data, error }
}

export const addTimesheetEntry = async (payload) => {
  const { data, error } = await supabase
    .from('timesheet_entries')
    .insert(payload)
    .select()
    .single()
  return { data, error }
}

export const deleteTimesheetEntry = async (id) => {
  const { error } = await supabase
    .from('timesheet_entries')
    .delete()
    .eq('id', id)
  return { error }
}

// Unlocks a locked (past-deadline) timesheet back to draft with the late
// reason recorded, so the employee can add entries and resubmit.
export const requestLateTimesheetSubmission = async (id, reason) => {
  const { error } = await supabase
    .from('timesheets')
    .update({ status: 'draft', reject_reason: `Late submission: ${reason}` })
    .eq('id', id)
  return { error }
}

export const submitTimesheet = async (id, totalHours) => {
  const { data, error } = await supabase
    .from('timesheets')
    .update({ status: 'submitted', submitted_at: new Date().toISOString(), total_hours: totalHours })
    .eq('id', id)
    .select()
    .single()
  if (!error && data) notifyNewRequest('timesheets', data.id)
  return { data, error }
}

export const fetchPendingTimesheets = async (approverId) => {
  const { data, error } = await supabase
    .from('timesheets')
    .select('*, employee:employee_id(full_name, avatar_initials, department, designation)')
    .eq('approver_id', approverId)
    .eq('status', 'submitted')
    .order('week_start', { ascending: false })
  return { data, error }
}

export const decideTimesheet = async (id, status, rejectReason = null) => {
  const { data, error } = await supabase
    .from('timesheets')
    .update({ status, approved_at: new Date().toISOString(), reject_reason: rejectReason })
    .eq('id', id)
    .select()
    .single()
  if (!error) notifyDecision('timesheets', id)
  return { data, error }
}

export const fetchTimesheetHistory = async (employeeId) => {
  const { data, error } = await supabase
    .from('timesheets')
    .select('*')
    .eq('employee_id', employeeId)
    .order('week_start', { ascending: false })
    .limit(12)
  return { data, error }
}

export const markEntriesJiraSynced = async (ids) => {
  const { error } = await supabase
    .from('timesheet_entries')
    .update({ jira_synced: true })
    .in('id', ids)
  return { error }
}

// ─── Profile ──────────────────────────────────────────────────────────────────
export const updateProfile = async (id, updates) => {
  const { data, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const clearMustChangePassword = async (id) => {
  const { data, error } = await supabase
    .from('employees')
    .update({ must_change_password: false })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

// ─── Leave types ──────────────────────────────────────────────────────────────
export const fetchLeaveTypes = async () => {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('is_active', true)
    .order('annual_days', { ascending: false })
  return { data, error }
}

// ─── Team calendar ─────────────────────────────────────────────────────────────
export const fetchTeamCalendar = async (fromDate, toDate) => {
  const { data, error } = await supabase
    .rpc('get_team_calendar', { p_from: fromDate, p_to: toDate })
  return { data, error }
}

// ─── Audit log (admin) ─────────────────────────────────────────────────────────
export const fetchAuditLog = async (limit = 100) => {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*, actor:actor_id(full_name, avatar_initials)')
    .order('created_at', { ascending: false })
    .limit(limit)
  return { data, error }
}

// ─── Company holidays ──────────────────────────────────────────────────────────
export const fetchHolidays = async () => {
  const { data, error } = await supabase
    .from('company_holidays')
    .select('*')
    .order('holiday_date')
  return { data, error }
}

export const createHoliday = async (payload) => {
  const { data, error } = await supabase
    .from('company_holidays')
    .insert(payload)
    .select()
    .single()
  return { data, error }
}

export const deleteHoliday = async (id) => {
  const { error } = await supabase
    .from('company_holidays')
    .delete()
    .eq('id', id)
  return { error }
}

// ─── Birthdays ──────────────────────────────────────────────────────────────
export const fetchBirthdays = async () => {
  const { data, error } = await supabase
    .from('employees')
    .select('id, full_name, avatar_initials, date_of_birth')
    .eq('is_active', true)
    .not('date_of_birth', 'is', null)
  return { data, error }
}

// ─── Leave adjustments (admin) ────────────────────────────────────────────────
export const fetchLeaveAdjustments = async (employeeId) => {
  const { data, error } = await supabase
    .from('leave_adjustments')
    .select('*')
    .eq('employee_id', employeeId)
  return { data, error }
}

export const upsertLeaveAdjustment = async (payload) => {
  const { data, error } = await supabase
    .from('leave_adjustments')
    .upsert(payload, { onConflict: 'employee_id,type_code' })
    .select()
    .single()
  return { data, error }
}

// ─── Medical certificate upload ───────────────────────────────────────────────
// The bucket is private — we store the storage path (not a public URL) and
// mint short-lived signed URLs on demand for viewing.
export const uploadMedicalCertificate = async (employeeId, file) => {
  const ext  = file.name.split('.').pop()
  const path = `${employeeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage
    .from('medical-certificates')
    .upload(path, file, { upsert: false })
  if (error) return { url: null, error }
  return { url: path, error: null }
}

// Accepts either a bare storage path (new records) or a legacy full public
// URL (records uploaded before the bucket was made private) and returns a
// signed URL valid for 60 seconds.
export const getMedicalCertificateUrl = async (value) => {
  if (!value) return { url: null, error: null }
  const marker = '/medical-certificates/'
  const path = value.includes(marker) ? value.split(marker)[1] : value
  const { data, error } = await supabase.storage
    .from('medical-certificates')
    .createSignedUrl(path, 60)
  return { url: data?.signedUrl || null, error }
}
