import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { fetchEmployee } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session,  setSession]  = useState(null)
  const [employee, setEmployee] = useState(null)
  const [loading,  setLoading]  = useState(true)

  const loadEmployee = async (userId) => {
    const { data } = await fetchEmployee(userId)
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
      if (session?.user) loadEmployee(session.user.id)
      else setEmployee(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const value = { session, employee, loading, refreshEmployee: () => loadEmployee(session?.user?.id) }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
