import { supabase } from './supabase'

// ─── Auth ────────────────────────────────────────────────────────────────────
export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const getSession = () => supabase.auth.getSession()

// ─── Employees ───────────────────────────────────────────────────────────────
export const fetchEmployees = async () => {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .order('full_name')
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

// Admin: create employee + auth user via Supabase Admin (uses service role)
// We use a Supabase Edge Function for this (see /supabase/functions/create-employee)
export const createEmployee = async (payload) => {
  const { data, error } = await supabase.functions.invoke('create-employee', {
    body: payload,
  })
  if (error) {
    // FunctionsHttpError — parse the actual message from the response body
    const msg = error.context?.body
      ? await error.context.json().then(b => b.error).catch(() => error.message)
      : error.message
    return { data: null, error: msg || 'Failed to create employee' }
  }
  // Edge function may return error in the data body for non-2xx responses
  if (data?.error) return { data: null, error: data.error }
  return { data, error: null }
}

export const updateEmployee = async (id, updates) => {
  const { data, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

export const deactivateEmployee = async (id) => {
  const { data, error } = await supabase
    .from('employees')
    .update({ is_active: false })
    .eq('id', id)
    .select()
    .single()
  return { data, error }
}

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
  return { data, error }
}

export const decideLeave = async (id, status, rejectReason = null) => {
  const { data, error } = await supabase
    .from('leave_requests')
    .update({ status, decided_on: new Date().toISOString(), reject_reason: rejectReason })
    .eq('id', id)
    .select()
    .single()
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
  return { data, error }
}

export const decideCompOff = async (id, status) => {
  const { data, error } = await supabase
    .from('comp_off_requests')
    .update({ status, decided_on: new Date().toISOString() })
    .eq('id', id)
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
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('attendance')
    .select('*')
    .eq('employee_id', employeeId)
    .eq('date', today)
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

export const fetchAllAttendance = async (limit = 100) => {
  const { data, error } = await supabase
    .from('attendance')
    .select('*, employee:employee_id(full_name, avatar_initials, department)')
    .order('date', { ascending: false })
    .limit(limit)
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

export const submitTimesheet = async (id, totalHours) => {
  const { data, error } = await supabase
    .from('timesheets')
    .update({ status: 'submitted', submitted_at: new Date().toISOString(), total_hours: totalHours })
    .eq('id', id)
    .select()
    .single()
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

// ─── Leave types ──────────────────────────────────────────────────────────────
export const fetchLeaveTypes = async () => {
  const { data, error } = await supabase
    .from('leave_types')
    .select('*')
    .eq('is_active', true)
    .order('annual_days', { ascending: false })
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
export const uploadMedicalCertificate = async (employeeId, file) => {
  const ext  = file.name.split('.').pop()
  const path = `${employeeId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error } = await supabase.storage
    .from('medical-certificates')
    .upload(path, file, { upsert: false })
  if (error) return { url: null, error }
  const { data: { publicUrl } } = supabase.storage
    .from('medical-certificates')
    .getPublicUrl(path)
  return { url: publicUrl, error: null }
}
