import { useEffect, useState } from 'react'
import { fetchJiraAccount, upsertJiraAccount, deleteJiraAccount } from '../lib/api'
import { C, Confirm, Field, Spinner, btnStyle, card, inputStyle } from './UI'

export default function JiraSettings({ employee, onToast }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // jira_api_token only ever holds what the user is actively typing —
  // the saved token is never round-tripped into this form. tokenLast4 is
  // a harmless derived display value, computed once from the fetch and
  // then discarded from anywhere an input could expose it.
  const [form, setForm] = useState({ jira_host: '', jira_email: '', jira_api_token: '' })
  const [connected, setConnected] = useState(false)
  const [tokenLast4, setTokenLast4] = useState('')
  const [editingToken, setEditingToken] = useState(true)
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false)

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
            jira_api_token: '',
          })
          setTokenLast4((data.jira_api_token || '').slice(-4))
          setConnected(true)
          setEditingToken(false)
        }
      })
      .finally(() => setLoading(false))
  }, [employee.id])

  const save = async () => {
    if (!connected && !form.jira_api_token.trim()) {
      onToast('API token is required to connect', 'error')
      return
    }
    setSaving(true)
    const payload = {
      employee_id: employee.id,
      jira_host: form.jira_host.trim(),
      jira_email: form.jira_email.trim(),
    }
    // Only send a token if the user actually typed a replacement — an
    // existing connection's token is left untouched by the upsert
    // otherwise, instead of overwriting it with a blank value.
    const newToken = form.jira_api_token.trim()
    if (newToken) payload.jira_api_token = newToken

    const { error } = await upsertJiraAccount(payload)
    setSaving(false)
    if (error) {
      onToast(error.message, 'error')
      return
    }
    if (newToken) setTokenLast4(newToken.slice(-4))
    setForm(f => ({ ...f, jira_api_token: '' }))
    setConnected(true)
    setEditingToken(false)
    onToast('Jira account connected successfully')
  }

  const disconnect = async () => {
    setSaving(true)
    const { error } = await deleteJiraAccount(employee.id)
    setSaving(false)
    setShowDisconnectConfirm(false)
    if (error) {
      onToast(error.message, 'error')
      return
    }
    setForm({ jira_host: '', jira_email: '', jira_api_token: '' })
    setTokenLast4('')
    setConnected(false)
    setEditingToken(true)
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
          <button onClick={() => setShowDisconnectConfirm(true)} disabled={saving} style={{ ...btnStyle(C.red, '#fff'), marginTop: 12 }}>
            Disconnect Jira
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
        {editingToken ? (
          <input
            type="password"
            value={form.jira_api_token}
            onChange={e => setForm(f => ({ ...f, jira_api_token: e.target.value }))}
            placeholder="Paste your Jira API token"
            style={inputStyle()}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              flex: 1, boxSizing: 'border-box', padding: '9px 12px',
              border: `0.5px solid ${C.borderMed}`, borderRadius: 8,
              fontSize: 14, fontFamily: 'ui-monospace, monospace',
              color: C.textSec, background: C.bgSec,
            }}>
              ••••••••••••{tokenLast4}
            </div>
            <button onClick={() => setEditingToken(true)} style={{ ...btnStyle(C.bgSec, C.textSec), padding: '9px 14px', fontSize: 12, whiteSpace: 'nowrap' }}>
              Replace
            </button>
          </div>
        )}
        <div style={{ fontSize: 11, color: C.textTert, marginTop: 4 }}>
          Only the last 4 characters of a saved token are ever shown. Enter a new value to replace it.
        </div>
      </Field>
      <button onClick={save} disabled={saving} style={{ ...btnStyle(C.green, '#fff'), width: '100%', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Saving…' : connected ? 'Update Jira account' : 'Connect Jira account'}
      </button>

      {showDisconnectConfirm && (
        <Confirm
          msg="Disconnect Jira? You'll need to re-enter your API token to reconnect."
          onYes={disconnect}
          onNo={() => setShowDisconnectConfirm(false)}
        />
      )}
    </div>
  )
}
