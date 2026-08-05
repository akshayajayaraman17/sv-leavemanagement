export function generateEmpCode(employees) {
  const existing = (employees || [])
    .map(e => e.employee_code)
    .filter(c => /^EMP\d+$/.test(c))
    .map(c => parseInt(c.replace('EMP', ''), 10))
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
  return `EMP${String(next).padStart(3, '0')}`
}
