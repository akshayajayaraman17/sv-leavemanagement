function formatCurrency(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Opens a print-ready payslip in a new window (user can "Save as PDF" from
// the browser print dialog). No PDF library dependency, no statutory
// fields — this app doesn't collect company name/PF number/UAN, so it's a
// clean summary rather than a compliance document.
export function printPayslip({ employee, salary }) {
  const earnings = [
    ['Basic Salary', salary.basic_salary],
    ['HRA', salary.hra],
    ['Transport Allowance', salary.transport_allowance],
    ['Other Allowances', salary.other_allowances],
  ]
  const deductions = [
    ['Provident Fund', salary.pf_deduction],
    ['Tax (TDS)', salary.tax_deduction],
    ['Other Deductions', salary.other_deductions],
  ]
  const gross = earnings.reduce((s, [, v]) => s + (parseFloat(v) || 0), 0)
  const totalDeductions = deductions.reduce((s, [, v]) => s + (parseFloat(v) || 0), 0)
  const net = gross - totalDeductions

  const periodLabel = salary.effective_from
    ? new Date(salary.effective_from).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : '—'

  const rows = items => items.map(([label, val]) =>
    `<tr><td>${label}</td><td class="amt">${formatCurrency(val)}</td></tr>`
  ).join('')

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Payslip — ${employee.full_name}</title>
<style>
  body { font-family: 'DM Sans', Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 640px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #6b6a65; font-size: 13px; margin-bottom: 28px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin-bottom: 28px; font-size: 13px; }
  .meta div span { color: #6b6a65; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #6b6a65; border-bottom: 1px solid #ddd; padding: 6px 0; }
  td { padding: 7px 0; font-size: 13px; border-bottom: 1px solid #eee; }
  td.amt { text-align: right; }
  .total td { font-weight: 700; border-top: 1.5px solid #1a1a1a; border-bottom: none; }
  .net { display: flex; justify-content: space-between; align-items: center; background: #E1F5EE; border-radius: 8px; padding: 14px 18px; margin-top: 20px; font-size: 15px; font-weight: 700; }
  .footer { margin-top: 32px; font-size: 11px; color: #9e9d98; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Payslip</h1>
  <div class="sub">For the period of ${periodLabel}</div>
  <div class="meta">
    <div><span>Employee</span><br>${employee.full_name}</div>
    <div><span>Employee Code</span><br>${employee.employee_code || '—'}</div>
    <div><span>Designation</span><br>${employee.designation || '—'}</div>
    <div><span>Department</span><br>${employee.department || '—'}</div>
  </div>
  <table>
    <thead><tr><th>Earnings</th><th></th></tr></thead>
    <tbody>${rows(earnings)}<tr class="total"><td>Gross Earnings</td><td class="amt">${formatCurrency(gross)}</td></tr></tbody>
  </table>
  <table>
    <thead><tr><th>Deductions</th><th></th></tr></thead>
    <tbody>${rows(deductions)}<tr class="total"><td>Total Deductions</td><td class="amt">${formatCurrency(totalDeductions)}</td></tr></tbody>
  </table>
  <div class="net"><span>Net Pay</span><span>${formatCurrency(net)}</span></div>
  <div class="footer">Generated ${new Date().toLocaleString('en-IN')} · This is a system-generated summary, not a statutory pay stub.</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=680,height=800')
  if (!win) return false
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 300)
  return true
}
