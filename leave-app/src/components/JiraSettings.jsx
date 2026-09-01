import { useEffect, useState } from 'react'
import { fetchJiraAccount, upsertJiraAccount, deleteJiraAccount } from '../lib/api'
import { Btn, C, Confirm, Field, Panel, Spinner, card, inputStyle } from './UI'

export default function JiraSettings({ employee, onToast }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ jira_host: '', jira_email: '', jira_api_token: '' })
  const [connected, setConnected] = useState(false)
  const [tokenLast4, setTokenLast4] = useState('')
  const [editingToken, setEditingToken] = useState(true)
  const [showDisconnect, setShowDisconnect] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchJiraAccount(employee.id).then(({ data, error }) => {
      if (error) { onToast(error.message, 'error'); return }
      if (data) {
        setForm({ jira_host: data.jira_host || '', jira_email: data.jira_email || '', jira_api_token: '' })
        setTokenLast4((data.jira_api_token || '').slice(-4))
        setConnected(true); setEditingToken(false)
      }
    }).finally(() => setLoading(false))
  }, [employee.id])

  const save = async () => {
    if (!connected && !form.jira_api_token.trim()) { onToast('API token is required to connect', 'error'); return }
    setSaving(true)
    const payload = { employee_id: employee.id, jira_host: form.jira_host.trim(), jira_email: form.jira_email.trim() }
    const newToken = form.jira_api_token.trim()
    if (newToken) payload.jira_api_token = newToken
    const { error } = await upsertJiraAccount(payload)
    setSaving(false)
    if (error) { onToast(error.message, 'error'); return }
    if (newToken) setTokenLast4(newToken.slice(-4))
    setForm(f => ({ ...f, jira_api_token: '' })); setConnected(true); setEditingToken(false)
    onToast('Jira account connected')
  }

  const disconnect = async () => {
    setSaving(true)
    const { error } = await deleteJiraAccount(employee.id)
    setSaving(false); setShowDisconnect(false)
    if (error) { onToast(error.message, 'error'); return }
    setForm({ jira_host: '', jira_email: '', jira_api_token: '' }); setTokenLast4('')
    setConnected(false); setEditingToken(true)
    onToast('Jira account disconnected')
  }

  if (loading) return <Spinner />

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ ...card, background: C.bgSec, marginBottom: 16, fontSize: 12.5, color: C.sub, lineHeight: 1.6 }}>
        When connected, timesheet worklogs post using your personal Jira credentials — your site URL, account email, and an API token.
      </div>

      {connected && (
        <div style={{ ...card, marginBottom: 16, background: '#f4f8fd', border: `1px solid #d9e6f3` }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Connected</div>
          <div style={{ fontSize: 12, color: C.sub }}>Host: {form.jira_host || '—'}</div>
          <div style={{ fontSize: 12, color: C.sub }}>Email: {form.jira_email || '—'}</div>
          <Btn variant="danger" sm style={{ marginTop: 12 }} disabled={saving} onClick={() => setShowDisconnect(true)}>Disconnect Jira</Btn>
        </div>
      )}

      <Panel>
        <Field label="Jira site URL"><input type="url" value={form.jira_host} onChange={e => setForm(f => ({ ...f, jira_host: e.target.value }))} placeholder="https://your-domain.atlassian.net" style={inputStyle()} /></Field>
        <Field label="Jira account email"><input type="email" value={form.jira_email} onChange={e => setForm(f => ({ ...f, jira_email: e.target.value }))} placeholder="you@yourcompany.com" style={inputStyle()} /></Field>
        <Field label="Jira API token" hint="Only the last 4 characters of a saved token are shown. Enter a new value to replace it.">
          {editingToken ? (
            <input type="password" value={form.jira_api_token} onChange={e => setForm(f => ({ ...f, jira_api_token: e.target.value }))} placeholder="Paste your Jira API token" style={inputStyle()} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, boxSizing: 'border-box', padding: '9px 12px', border: `1px solid #d8e0ea`, borderRadius: 9, fontSize: 13.5, fontFamily: C.mono, color: C.sub, background: C.bgSec }}>••••••••••••{tokenLast4}</div>
              <Btn variant="ghost" sm onClick={() => setEditingToken(true)}>Replace</Btn>
            </div>
          )}
        </Field>
        <Btn full disabled={saving} onClick={save}>{saving ? 'Saving…' : connected ? 'Update Jira account' : 'Connect Jira account'}</Btn>
      </Panel>

      {showDisconnect && (
        <Confirm msg="Disconnect Jira? You'll need to re-enter your API token to reconnect." yesLabel="Disconnect" onYes={disconnect} onNo={() => setShowDisconnect(false)} />
      )}
    </div>
  )
}
