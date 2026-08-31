import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchEmployee } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,  setSession]  = useState(null)
  const [employee, setEmployee] = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [blockedMessage, setBlockedMessage] = useState('')

  const loadEmployee = async (userId) => {
    const { data } = await fetchEmployee(userId)
    if (data && data.is_active === false) {
      // Banning at the Auth layer (offboard-employee Edge Function) only
      // reliably stops *new* sign-ins/token refreshes — an already-live
      // session's access token still verifies until it expires. This
      // catches it on the next employee-record load instead of leaving
      // an already-signed-in, deactivated employee in the app.
      setBlockedMessage('This account has been deactivated. Contact your admin.')
      await supabase.auth.signOut()
      setEmployee(null)
      return
    }
    setEmployee(data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) loadEmployee(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) { setBlockedMessage(''); loadEmployee(session.user.id) }
      else setEmployee(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const value = { session, employee, loading, blockedMessage, refreshEmployee: () => loadEmployee(session?.user?.id) }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
