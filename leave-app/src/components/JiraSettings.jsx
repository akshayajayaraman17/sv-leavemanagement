import { useEffect, useState } from 'react'
import { fetchJiraAccount, upsertJiraAccount, deleteJiraAccount } from '../lib/api'
import { C, Field, Spinner, btnStyle, card, inputStyle } from './UI'

export default function JiraSettings({ employee, onToast }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ jira_host: '', jira_email: '', jira_api_token: '' })
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchJiraAccount(employee.id)
      .then(({ data, error }) => {
        if (error) {
          onToast(error.message, 'error')
          return
        }
        if (data) {
          setForm({
            jira_host: data.jira_host || '',
            jira_email: data.jira_email || '',
            jira_api_token: data.jira_api_token || '',
          })
          setConnected(true)
        }
      })
      .finally(() => setLoading(false))
  }, [employee.id])

  const save = async () => {
    setSaving(true)
    const payload = {
      employee_id: employee.id,
      jira_host: form.jira_host.trim(),
      jira_email: form.jira_email.trim(),
      jira_api_token: form.jira_api_token.trim(),
    }
    const { error } = await upsertJiraAccount(payload)
    setSaving(false)
    if (error) {
      onToast(error.message, 'error')
      return
    }
    setConnected(true)
    onToast('Jira account connected successfully')
  }

  const disconnect = async () => {
    setSaving(true)
    const { error } = await deleteJiraAccount(employee.id)
    setSaving(false)
    if (error) {
      onToast(error.message, 'error')
      return
    }
    setForm({ jira_host: '', jira_email: '', jira_api_token: '' })
    setConnected(false)
    onToast('Jira account disconnected')
  }

  if (loading) return <Spinner />

  return (
    <div>
      <div style={{ ...card, background: C.bgSec, marginBottom: 18 }}>
        <div style={{ fontSize: 13, marginBottom: 8, fontWeight: 500 }}>Link your personal Jira account</div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
          When connected, worklogs are posted using your Jira user credentials. Use your Jira site URL, account email, and API token.
        </div>
      </div>

      {connected && (
        <div style={{ ...card, marginBottom: 16, padding: 14, background: '#EEF7FF', border: '1px solid #B8D9FF' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Connected Jira account</div>
          <div style={{ fontSize: 12, color: C.textSec }}>Host: {form.jira_host || '—'}</div>
          <div style={{ fontSize: 12, color: C.textSec }}>Email: {form.jira_email || '—'}</div>
          <button onClick={disconnect} disabled={saving} style={{ ...btnStyle(C.red, '#fff'), marginTop: 12 }}>
            {saving ? 'Disconnecting…' : 'Disconnect Jira'}
          </button>
        </div>
      )}

      <Field label="Jira site URL">
        <input
          type="url"
          value={form.jira_host}
          onChange={e => setForm(f => ({ ...f, jira_host: e.target.value }))}
          placeholder="https://your-domain.atlassian.net"
          style={inputStyle()}
        />
      </Field>
      <Field label="Jira account email">
        <input
          type="email"
          value={form.jira_email}
          onChange={e => setForm(f => ({ ...f, jira_email: e.target.value }))}
          placeholder="you@yourcompany.com"
          style={inputStyle()}
        />
      </Field>
      <Field label="Jira API token">
        <input
          type="password"
          value={form.jira_api_token}
          onChange={e => setForm(f => ({ ...f, jira_api_token: e.target.value }))}
          placeholder="API token"
          style={inputStyle()}
        />
      </Field>
      <button onClick={save} disabled={saving} style={{ ...btnStyle(C.green, '#fff'), width: '100%', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Saving…' : connected ? 'Update Jira account' : 'Connect Jira account'}
      </button>
    </div>
  )
}
