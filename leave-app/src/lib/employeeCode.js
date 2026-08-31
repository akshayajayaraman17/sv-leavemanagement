// Existing codes in this roster are "EMP-006", "EMP-021", etc. — hyphenated.
// The regex accepts a bare "EMPNNN" too so any legacy no-hyphen code still
// counts toward the running max instead of being silently ignored.
export function generateEmpCode(employees) {
  const existing = (employees || [])
    .map(e => (e.employee_code || '').match(/^EMP-?(\d+)$/))
    .filter(Boolean)
    .map(m => parseInt(m[1], 10))
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
  return `EMP-${String(next).padStart(3, '0')}`
}
