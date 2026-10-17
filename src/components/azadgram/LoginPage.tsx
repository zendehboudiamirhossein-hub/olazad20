'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { apiJson } from '@/lib/client-auth'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2, Lock, ShieldCheck, User } from 'lucide-react'
import { useTheme } from 'next-themes'

export function LoginPage({ onLogin }: { onLogin: (token: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const { theme, setTheme } = useTheme()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!username || !password) {
      toast.error('نام کاربری و رمز عبور را وارد کنید')
      return
    }
    setLoading(true)
    try {
      const data = await apiJson<{ token: string }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      })
      onLogin(data.token)
    } catch (e: any) {
      toast.error(e.message || 'ورود ناموفق')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 azadgram-login-bg relative overflow-hidden">
      {/* Floating decorative orbs */}
      <div className="orb w-72 h-72 bg-teal-300/40 dark:bg-teal-500/20" style={{ top: '8%', right: '10%' }} />
      <div className="orb w-56 h-56 bg-emerald-300/40 dark:bg-emerald-500/15" style={{ bottom: '12%', left: '8%', animationDelay: '2s' }} />
      <div className="orb w-40 h-40 bg-cyan-200/50 dark:bg-cyan-500/10" style={{ top: '55%', left: '45%', animationDelay: '4s' }} />

      {/* Theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="absolute top-4 left-4 rounded-full z-10"
        aria-label="تغییر تم"
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </Button>

      <div className="w-full max-w-md relative z-[1] fade-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center azadgram-logo w-24 h-24 text-5xl mb-4 pulse-teal">
            آ
          </div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight">آزادگرام</h1>
          <p className="text-muted-foreground mt-1.5 flex items-center justify-center gap-1.5 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            پنل مدیریت — دسترسی محدود
          </p>
        </div>

        <Card className="glass-card shadow-2xl border-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-xl">ورود به پنل مدیریت</CardTitle>
            <CardDescription>
              برای مدیریت کاربران، کانفیگ‌ها و آمار وارد شوید
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">نام کاربری</Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="username"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="admin"
                    autoComplete="username"
                    disabled={loading}
                    className="pr-10 h-11"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">رمز عبور</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                    className="pr-10 pl-10 h-11"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="نمایش رمز"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-11 text-base pulse-teal"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    در حال ورود...
                  </>
                ) : 'ورود'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-muted-foreground/70 mt-6">
          آزادگرام پنل — نسخه ۳.۰
        </p>
      </div>
    </div>
  )
}
