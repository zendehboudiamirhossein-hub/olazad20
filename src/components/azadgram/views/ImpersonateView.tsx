'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiJson, bearerJson } from '@/lib/client-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { QrCode } from '@/components/azadgram/QrCode'
import { TgAccountExplorer } from './TgAccountExplorer'
import {
  ArrowRight, RefreshCw, Copy, Check, Smartphone, Wifi, TrafficCone,
  ShieldAlert, Crown, Loader2, Globe, Signal, LogIn, Timer
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * ImpersonateView — "ورود به اکانت کاربر"
 *
 * Opens a live session on behalf of a user using a short-lived impersonation
 * token, then calls the REAL client API (/api/client/*) — the exact same
 * endpoints the AzadGram Android app uses. The admin sees precisely what the
 * user's app sees: plan, traffic, assigned configs and share URIs/QRs.
 */

interface ImpersonateState {
  token: string
  expiresInSeconds: number
  user: {
    id: string
    telegramId: string
    phoneNumber: string
    username?: string | null
    firstName?: string | null
    lastName?: string | null
    plan: string
    status: string
    trafficLimitMB: number
    trafficUsedMB: number
    expiresAt?: string | null
  }
}

interface ClientConfig {
  id: string
  name: string
  protocol: string
  server: string
  port: number
  country?: string | null
  city?: string | null
  flag?: string | null
  ping?: number | null
  loadPercent?: number | null
  isPremium: boolean
  shareUri: string
}

interface ClientTraffic {
  plan: string
  trafficLimitMB: number
  trafficUsedMB: number
  trafficRemainingMB: number
  expiresAt?: string | null
  status: string
}

const PROTOCOL_COLORS: Record<string, string> = {
  VLESS: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  VMESS: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  SHADOWSOCKS: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  TROJAN: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  MTPROTO: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  SOCKS5: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  WIREGUARD: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
}

export function ImpersonateView({ userId, onBack }: { userId: string; onBack: () => void }) {
  const [state, setState] = useState<ImpersonateState | null>(null)
  const [configs, setConfigs] = useState<ClientConfig[]>([])
  const [traffic, setTraffic] = useState<ClientTraffic | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [qrId, setQrId] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number>(0)

  const openSession = useCallback(async () => {
    setLoading(true)
    setClientError(null)
    try {
      const imp = await apiJson<ImpersonateState>(`/api/admin/users/${userId}/impersonate`, { method: 'POST' })
      setState(imp)
      setSecondsLeft(imp.expiresInSeconds)
      await loadClientData(imp.token)
    } catch (e: any) {
      toast.error(e.message)
      setClientError(e.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  async function loadClientData(token: string) {
    setRefreshing(true)
    try {
      const [cfg, tr] = await Promise.all([
        bearerJson<{ configs: ClientConfig[] }>('/api/client/configs', token),
        bearerJson<ClientTraffic>('/api/client/traffic', token).catch(() => null)
      ])
      setConfigs(cfg.configs ?? [])
      setTraffic(tr)
      setClientError(null)
    } catch (e: any) {
      // The client API returned an error — show it exactly like the app would
      setClientError(e.message)
      setConfigs([])
    } finally {
      setRefreshing(false)
    }
  }

  // Session countdown
  useEffect(() => {
    if (!state) return
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [state])

  useEffect(() => { openSession() }, [openSession])

  async function copyUri(c: ClientConfig) {
    try {
      await navigator.clipboard.writeText(c.shareUri)
      setCopiedId(c.id)
      setTimeout(() => setCopiedId(null), 1500)
      toast.success('لینک کپی شد')
    } catch {
      toast.error('کپی ناموفق')
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowRight className="h-4 w-4" /> بازگشت
        </Button>
        <div className="text-center py-24 text-muted-foreground flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          در حال باز کردن نشست کاربر...
        </div>
      </div>
    )
  }

  if (!state) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowRight className="h-4 w-4" /> بازگشت
        </Button>
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-muted-foreground">{clientError ?? 'باز کردن نشست ناموفق بود'}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const u = state.user
  const usedPct = u.trafficLimitMB > 0 ? Math.min(100, (u.trafficUsedMB / u.trafficLimitMB) * 100) : 0
  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  return (
    <div className="space-y-5 fade-up">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="بازگشت">
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <LogIn className="h-5 w-5 text-primary" />
              ورود به اکانت کاربر
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              نمایش زنده — دقیقاً همان چیزی که اپلیکیشن کاربر می‌بیند
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 h-8 px-3 font-mono">
            <Timer className="h-3.5 w-3.5 text-primary" />
            {minutes}:{String(seconds).padStart(2, '0')}
          </Badge>
          <Button size="sm" variant="outline" onClick={() => loadClientData(state.token)} disabled={refreshing} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            بروزرسانی
          </Button>
        </div>
      </div>

      {/* User identity strip */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="azadgram-gradient px-5 py-4 flex flex-wrap items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/25 backdrop-blur flex items-center justify-center text-white text-xl font-extrabold">
              {u.firstName?.[0] ?? u.phoneNumber.slice(-2)}
            </div>
            <div className="flex-1 min-w-[180px]">
              <div className="text-white font-bold text-lg">
                {u.firstName ?? 'بدون نام'} {u.lastName ?? ''}
              </div>
              <div className="text-white/80 text-xs font-mono ltr-island">
                {u.phoneNumber} · ID {u.telegramId}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/20">
                {u.plan === 'FREE' ? 'رایگان' : u.plan === 'PREMIUM' ? <><Crown className="h-3 w-3 ml-1" />پریمیوم</> : 'ویژه'}
              </Badge>
              <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/20">
                {u.status === 'ACTIVE' ? 'فعال' : u.status === 'BANNED' ? 'مسدود' : u.status === 'SUSPENDED' ? 'معلق' : u.status}
              </Badge>
            </div>
          </div>

          {/* Traffic gauge */}
          <div className="p-5 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <TrafficCone className="h-4 w-4 text-primary" />
                ترافیک مصرفی
              </span>
              <span className="font-bold font-mono">
                {(u.trafficUsedMB / 1024).toFixed(2)} GB / {(u.trafficLimitMB / 1024).toFixed(0)} GB
              </span>
            </div>
            <Progress value={usedPct} className="h-2.5" />
            <div className="text-xs text-muted-foreground">
              {usedPct.toFixed(1)}٪ مصرف شده — {(Math.max(0, u.trafficLimitMB - u.trafficUsedMB) / 1024).toFixed(2)} GB باقی‌مانده
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Client API error (as the app sees it) */}
      {clientError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm text-destructive">خطای API کلاینت</div>
              <div className="text-sm text-muted-foreground mt-0.5">
                اپلیکیشن کاربر این خطا را می‌بیند: «{clientError}»
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full Telegram account access (2h) — v3.6 */}
      <TgAccountExplorer userId={userId} />

      {/* Configs — what the app displays */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold flex items-center gap-2">
            <Smartphone className="h-4.5 w-4.5 text-primary" />
            کانفیگ‌های قابل استفاده ({configs.length})
          </h2>
          <span className="text-xs text-muted-foreground">از API واقعی کلاینت خوانده شد</span>
        </div>

        {configs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground space-y-2">
              <Wifi className="h-8 w-8 mx-auto opacity-40" />
              هیچ کانفیگی برای این کاربر در دسترس نیست — اپ او خالی است
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {configs.map((c, idx) => (
              <Card key={c.id} className={`fade-up fade-up-${Math.min(4, idx + 1)} overflow-hidden`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                        <Globe className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground ltr-island">
                          {c.flag ?? ''} {c.country ?? ''} {c.city ? `· ${c.city}` : ''}
                        </div>
                      </div>
                    </div>
                    <Badge className={`text-[10px] ${PROTOCOL_COLORS[c.protocol] ?? PROTOCOL_COLORS.SOCKS5}`}>
                      {c.protocol}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground ltr-island">
                    <span className="flex items-center gap-1">
                      <Signal className="h-3 w-3" />
                      {c.ping != null ? `${c.ping}ms` : '—'}
                    </span>
                    <span className="truncate font-mono">{c.server}:{c.port}</span>
                  </div>

                  {/* QR + URI */}
                  <div className="flex items-center gap-3 bg-secondary/40 rounded-xl p-3">
                    <button
                      onClick={() => setQrId(qrId === c.id ? null : c.id)}
                      className="shrink-0 transition-transform hover:scale-105"
                      title="نمایش/پنهان QR"
                    >
                      <QrCode value={c.shareUri} size={72} />
                    </button>
                    <div className="flex-1 min-w-0 space-y-2">
                      <code className="block text-[10px] leading-relaxed text-muted-foreground break-all line-clamp-2 ltr-island" dir="ltr">
                        {c.shareUri}
                      </code>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => copyUri(c)}>
                          {copiedId === c.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                          کپی لینک
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => setQrId(qrId === c.id ? null : c.id)}
                        >
                          {qrId === c.id ? 'پنهان QR' : 'نمایش QR'}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {qrId === c.id && (
                    <div className="flex justify-center py-2 fade-up">
                      <div className="bg-white p-3 rounded-2xl shadow-lg">
                        <QrCode value={c.shareUri} size={200} />
                        <p className="text-center text-[10px] text-gray-500 mt-1.5">اسکن در اپلیکیشن آزادگرام</p>
                      </div>
                    </div>
                  )}

                  {c.isPremium && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300 gap-1">
                      <Crown className="h-3 w-3" /> ویژه اعضای پریمیوم
                    </Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Session footer */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-primary" />
            این نشست ۲ ساعته است، فقط در لاگ ممیزی ثبت می‌شود و به اکانت اصلی کاربر آسیبی نمی‌زند.
          </span>
          <Button size="sm" variant="outline" onClick={openSession} className="gap-1.5 h-8">
            <RefreshCw className="h-3 w-3" />
            نشست تازه
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
