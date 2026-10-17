'use client'

const TOKEN_KEY = 'azadgram_admin_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(TOKEN_KEY)
}

/**
 * Sends the token as Bearer header. The server also reads the HttpOnly
 * cookie (set on login), but for explicit API calls we send Bearer for compat.
 * If the caller provides their own Authorization header (e.g. an
 * impersonation token), it is respected and NOT overwritten.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>)
  }
  const hasCallerAuth = Object.keys(headers).some(k => k.toLowerCase() === 'authorization')
  if (token && !hasCallerAuth) headers['Authorization'] = `Bearer ${token}`
  // credentials: 'include' so the HttpOnly cookie is also sent
  return fetch(path, { ...init, headers, credentials: 'include' })
}

export async function apiJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as any)?.error || (data as any)?.message || `HTTP ${res.status}`)
  }
  return data as T
}

/**
 * Raw fetch with an explicit Bearer token — used by the impersonation view to
 * call the client API exactly as the Android app does.
 */
/**
 * Download an authenticated binary/attachment (CSV, JSON backup) from an API
 * path and trigger the browser's save-file flow.
 */
export async function apiDownload(path: string, fallbackName: string): Promise<void> {
  const res = await apiFetch(path)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any)?.error || `HTTP ${res.status}`)
  }
  const disposition = res.headers.get('content-disposition') ?? ''
  const m = /filename="?([^";]+)"?/i.exec(disposition)
  const name = m?.[1] ?? fallbackName
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function bearerJson<T = any>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
    'Authorization': `Bearer ${token}`
  }
  const res = await fetch(path, { ...init, headers })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((data as any)?.error || (data as any)?.message || `HTTP ${res.status}`)
  }
  return data as T
}
