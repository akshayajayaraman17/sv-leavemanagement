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
  return { data, error }
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
