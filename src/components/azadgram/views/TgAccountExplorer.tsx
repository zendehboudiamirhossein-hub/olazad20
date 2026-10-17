'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@/lib/client-auth'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Send, RefreshCw, MessagesSquare, Timer, LogIn, Loader2, ShieldAlert, Ban, User, Users, Radio, Bot, KeyRound
} from 'lucide-react'
import { toast } from 'sonner'

/**
 * TgAccountExplorer — "Complete login to the user's Telegram account" (2h).
 *
 * QR-login-token transfer: the user's app authorizes this panel session via
 * auth.acceptLoginToken; afterwards the admin can browse the account's
 * dialogs, read history and send messages — for exactly 2 hours.
 */

interface DialogItem {
  key: string
  id: string
  type: 'user' | 'group' | 'channel' | 'bot'
  title: string
  username?: string | null
  lastMessage?: string | null
  lastMessageAt?: string | null
  unreadCount: number
  verified?: boolean
}

interface MessageItem {
  id: number
  out: boolean
  date: string
  text: string
  sender?: string | null
}

interface SessionStatus {
  sessionId: string
  status: 'PENDING' | 'PENDING_PASSWORD' | 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'FAILED'
  remainingSeconds?: number | null
  user: { id: string; telegramId: string; firstName?: string | null; lastName?: string | null; username?: string | null }
}

const POLL_MS = 4000

function typeIcon(t: DialogItem['type']) {
  if (t === 'user') return <User className="h-3.5 w-3.5" />
  if (t === 'bot') return <Bot className="h-3.5 w-3.5" />
  if (t === 'channel') return <Radio className="h-3.5 w-3.5" />
  return <Users className="h-3.5 w-3.5" />
}

export function TgAccountExplorer({ userId }: { userId: string }) {
  const [session, setSession] = useState<SessionStatus | null>(null)
  const [starting, setStarting] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [remaining, setRemaining] = useState<number | null>(null)

  const [dialogs, setDialogs] = useState<DialogItem[]>([])
  const [dialogsLoading, setDialogsLoading] = useState(false)
  const [activePeer, setActivePeer] = useState<DialogItem | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const sessionRef = useRef<string | null>(null)

  // ---------- lifecycle ----------

  const start = useCallback(async () => {
    setStarting(true)
    try {
      const res = await apiJson<{ sessionId: string }>(`/api/admin/users/${userId}/tg-impersonate`, { method: 'POST' })
      setSession({ sessionId: res.sessionId, status: 'PENDING', remainingSeconds: null, user: null as any })
      setElapsed(0)
      setDialogs([])
      setActivePeer(null)
      setMessages([])
      toast.success('درخواست ورود ثبت شد — در انتظار تأیید توسط اپلیکیشن کاربر')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setStarting(false)
    }
  }, [userId])

  // status poller
  useEffect(() => {
    if (!session || session.status === 'ACTIVE' || session.status === 'EXPIRED' || session.status === 'REVOKED' || session.status === 'FAILED') return
    const t = setInterval(async () => {
      setElapsed(e => e + POLL_MS / 1000)
      try {
        const s = await apiJson<SessionStatus>(`/api/admin/tg-impersonate/${session.sessionId}`)
        setSession(s)
      } catch {
        /* keep polling */
      }
    }, POLL_MS)
    return () => clearInterval(t)
  }, [session?.sessionId, session?.status])

  // countdown while ACTIVE
  useEffect(() => {
    if (session?.status !== 'ACTIVE' || session.remainingSeconds == null) return
    setRemaining(session.remainingSeconds)
    const t = setInterval(() => {
      setRemaining(r => (r == null ? null : Math.max(0, r - 1)))
    }, 1000)
    return () => clearInterval(t)
  }, [session?.sessionId, session?.status, session?.remainingSeconds])

  // load dialogs when ACTIVE
  useEffect(() => {
    if (session?.status === 'ACTIVE' && session.sessionId !== sessionRef.current) {
      sessionRef.current = session.sessionId
      loadDialogs(session.sessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.status, session?.sessionId])

  async function loadDialogs(sessionId: string) {
    setDialogsLoading(true)
    try {
      const res = await apiJson<{ dialogs: DialogItem[] }>(`/api/admin/tg-impersonate/${sessionId}/dialogs`)
      setDialogs(res.dialogs ?? [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setDialogsLoading(false)
    }
  }

  async function openDialog(d: DialogItem) {
    if (!session || session.status !== 'ACTIVE') return
    setActivePeer(d)
    setMessagesLoading(true)
    setMessages([])
    try {
      const res = await apiJson<{ messages: MessageItem[] }>(
        `/api/admin/tg-impersonate/${session.sessionId}/messages?peer=${encodeURIComponent(d.key)}`
      )
      setMessages(res.messages ?? [])
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setMessagesLoading(false)
    }
  }

  async function send() {
    if (!session || !activePeer || !draft.trim()) return
    setSending(true)
    try {
      await apiJson(`/api/admin/tg-impersonate/${session.sessionId}/send`, {
        method: 'POST',
        body: JSON.stringify({ peer: activePeer.key, text: draft.trim() })
      })
      setDraft('')
      toast.success('پیام ارسال شد')
      openDialog(activePeer)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSending(false)
    }
  }

  async function revoke() {
    if (!session) return
    try {
      await apiJson(`/api/admin/tg-impersonate/${session.sessionId}`, { method: 'DELETE' })
      setSession(s => (s ? { ...s, status: 'REVOKED' } : s))
      setDialogs([])
      setActivePeer(null)
      toast.success('دسترسی پایان یافت')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  // ---------- render ----------

  const mm = remaining != null ? Math.floor(remaining / 60) : null
  const ss = remaining != null ? remaining % 60 : null

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* header band */}
        <div className="azadgram-gradient px-5 py-4 flex flex-wrap items-center gap-3">
          <MessagesSquare className="h-6 w-6 text-white" />
          <div className="flex-1 min-w-[200px]">
            <div className="text-white font-bold">ورود کامل به اکانت تلگرام</div>
            <div className="text-white/80 text-xs">
              دسترسی کامل به گفتگوها و پیام‌های کاربر — حداکثر ۲ ساعت
            </div>
          </div>
          {session?.status === 'ACTIVE' ? (
            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 text-white border-white/30 font-mono">
                <Timer className="h-3.5 w-3.5 ml-1" />
                {mm}:{String(ss ?? 0).padStart(2, '0')}
              </Badge>
              <Button size="sm" variant="secondary" className="gap-1.5 h-8" onClick={revoke}>
                <Ban className="h-3.5 w-3.5" /> پایان دسترسی
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-8 gap-1.5"
                onClick={() => session && loadDialogs(session.sessionId)}
                disabled={dialogsLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${dialogsLoading ? 'animate-spin' : ''}`} />
                بروزرسانی
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5 h-9 bg-white text-primary-foreground"
              onClick={start}
              disabled={starting || session?.status === 'PENDING' || session?.status === 'PENDING_PASSWORD'}
            >
              {starting || session?.status === 'PENDING' || session?.status === 'PENDING_PASSWORD' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {session?.status === 'PENDING'
                ? 'در انتظار تأیید اپ کاربر…'
                : session?.status === 'PENDING_PASSWORD'
                  ? 'در انتظار رمز دومرحله‌ای…'
                  : 'شروع دسترسی (۲ ساعت)'}
            </Button>
          )}
        </div>

        {/* body */}
        {!session || session.status === 'EXPIRED' || session.status === 'REVOKED' || session.status === 'FAILED' ? (
          <div className="p-6 text-center space-y-3">
            {session && session.status !== undefined && session.status !== 'PENDING' && session.status !== 'PENDING_PASSWORD' && session.status !== 'ACTIVE' ? (
              <>
                <ShieldAlert className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">
                  {session.status === 'EXPIRED'
                    ? 'مهلت تأیید یا مدت دسترسی به پایان رسید. برای شروع دوباره دکمه بالا را بزنید.'
                    : session.status === 'REVOKED'
                      ? 'دسترسی پایان یافت.'
                      : 'اپلیکیشن کاربر توکن ورود را نپذیرفت. دوباره تلاش کنید.'}
                </p>
              </>
            ) : (
              <>
                <MessagesSquare className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  با زدن دکمه بالا، اپلیکیشن آزادگرامِ کاربر در اولین ضربان (حداکثر ۱ دقیقه با VPN روشن / چند دقیقه بدون آن)
                  توکن ورود را تأیید می‌کند و نشست ۲ ساعته فعال می‌شود.
                </p>
              </>
            )}
          </div>
        ) : session.status === 'PENDING' ? (
          <div className="p-8 text-center space-y-3">
            <Loader2 className="h-7 w-7 animate-spin text-primary mx-auto" />
            <p className="text-sm font-medium">در انتظار تأیید توسط دستگاه کاربر…</p>
            <p className="text-xs text-muted-foreground">
              {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')} گذشته — اپ کاربر به‌محض آنلاین شدن
              این درخواست را می‌پذیرد
            </p>
          </div>
        ) : session.status === 'PENDING_PASSWORD' ? (
          <div className="p-8 text-center space-y-3">
            <KeyRound className="h-7 w-7 text-primary mx-auto" />
            <p className="text-sm font-medium">اکانت کاربر رمز دومرحله‌ای (2FA) دارد</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              تأیید اولیه انجام شد؛ برای فعال‌سازی نشست ۲ ساعته، اپلیکیشن کاربر باید رمز دومرحله‌ای
              اکانت را برای پنل ارسال کند.
            </p>
            <p className="text-[11px] text-muted-foreground font-mono">
              {Math.floor(elapsed / 60)}:{String(Math.floor(elapsed % 60)).padStart(2, '0')} گذشته از مهلت ۱۵ دقیقه‌ای
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-[280px_1fr] min-h-[380px]">
            {/* dialog list */}
            <div className="border-l" dir="rtl">
              <div className="px-3 py-2 text-xs text-muted-foreground border-b flex items-center justify-between">
                <span>گفتگوها ({dialogs.length})</span>
              </div>
              <ScrollArea className="h-[420px]">
                {dialogsLoading ? (
                  <div className="p-6 flex justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : dialogs.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted-foreground">گفتگویی یافت نشد</div>
                ) : (
                  dialogs.map(d => (
                    <button
                      key={d.key}
                      onClick={() => openDialog(d)}
                      className={`w-full text-right px-3 py-2.5 flex gap-2 items-start hover:bg-secondary/60 transition-colors ${
                        activePeer?.key === d.key ? 'bg-secondary' : ''
                      }`}
                    >
                      <span className="mt-1 text-muted-foreground shrink-0">{typeIcon(d.type)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1">
                          <span className="font-medium text-sm truncate">{d.title}</span>
                          {d.verified && <Badge className="text-[8px] h-3.5 px-1 bg-sky-100 text-sky-700">تأیید</Badge>}
                        </span>
                        <span className="block text-[11px] text-muted-foreground truncate">
                          {d.lastMessage ?? '—'}
                        </span>
                      </span>
                      {d.unreadCount > 0 && (
                        <span className="shrink-0 bg-primary text-primary-foreground text-[9px] rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
                          {d.unreadCount > 99 ? '99+' : d.unreadCount}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </ScrollArea>
            </div>

            {/* message view */}
            <div className="flex flex-col">
              {activePeer ? (
                <>
                  <div className="px-4 py-2 border-b flex items-center gap-2">
                    <span className="text-muted-foreground">{typeIcon(activePeer.type)}</span>
                    <span className="font-bold text-sm truncate">{activePeer.title}</span>
                    {activePeer.username && (
                      <span className="text-xs text-muted-foreground">@{activePeer.username}</span>
                    )}
                  </div>
                  <ScrollArea className="flex-1 h-[352px] p-4 space-y-2">
                    {messagesLoading ? (
                      <div className="h-full flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                        پیامی نیست
                      </div>
                    ) : (
                      messages.map(m => (
                        <div
                          key={m.id}
                          className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                            m.out
                              ? 'bg-primary text-primary-foreground mr-auto'
                              : 'bg-secondary ml-auto'
                          }`}
                          dir="auto"
                        >
                          {m.text}
                          <div
                            className={`text-[9px] mt-1 ${m.out ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}
                            dir="ltr"
                          >
                            {new Date(m.date).toLocaleString('fa-IR')}
                          </div>
                        </div>
                      ))
                    )}
                  </ScrollArea>
                  <div className="p-3 border-t flex gap-2">
                    <Input
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                      placeholder="نوشتن پیام به‌عنوان کاربر…"
                      dir="auto"
                    />
                    <Button size="icon" onClick={send} disabled={sending || !draft.trim()} aria-label="ارسال">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-6">
                  یک گفتگو را برای مشاهده پیام‌ها انتخاب کنید
                </div>
              )}
            </div>
          </div>
        )}

        {session?.status === 'ACTIVE' && (
          <div className="px-5 py-2 border-t text-[10px] text-muted-foreground flex items-center gap-1.5">
            <ShieldAlert className="h-3 w-3 text-primary" />
            همه‌ی فعالیت‌ها (از جمله ارسال پیام) در لاگ ممیزی ثبت می‌شود؛ نشست پس از ۲ ساعت به‌طور خودکار بسته می‌شود.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
