'use client'

import { useEffect, useState } from 'react'
import { apiJson, getToken, setToken, clearToken } from '@/lib/client-auth'
import { LoginPage } from '@/components/azadgram/LoginPage'
import { AdminShell } from '@/components/azadgram/AdminShell'
import { toast } from 'sonner'

export default function Home() {
  const [ready, setReady] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const token = getToken()
      if (!token) {
        if (!cancelled) { setReady(true); setLoggedIn(false) }
        return
      }
      try {
        await apiJson('/api/admin/me')
        if (!cancelled) { setLoggedIn(true) }
      } catch {
        clearToken()
        if (!cancelled) { setLoggedIn(false) }
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    check()
    return () => { cancelled = true }
  }, [])

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center azadgram-soft-bg">
        <div className="text-center">
          <div className="azadgram-logo w-16 h-16 text-3xl mx-auto mb-4 animate-pulse">آ</div>
          <div className="text-muted-foreground">در حال بارگذاری...</div>
        </div>
      </div>
    )
  }

  return (
    <>
      {loggedIn ? (
        <AdminShell onLogout={async () => {
          try { await apiJson('/api/admin/logout', { method: 'POST' }) } catch {}
          clearToken()
          setLoggedIn(false)
          toast.success('خارج شدید')
        }} />
      ) : (
        <LoginPage onLogin={(token) => {
          setToken(token)
          setLoggedIn(true)
          toast.success('خوش آمدید!')
        }} />
      )}
    </>
  )
}
