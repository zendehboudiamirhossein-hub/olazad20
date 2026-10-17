'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@/lib/client-auth'
import { User, Config, ConnectionLog } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowRight, Crown, Ban, Shield, ShieldCheck, Trash2, Server, Plus, Activity, HardDrive, LogIn, QrCode as QrIcon, Users as UsersIcon, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { PlanBadge, StatusBadge } from './UsersView'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'

export function UserDetailView({ userId, onBack, onImpersonate, onOpenContacts }: { userId: string; onBack: () => void; onImpersonate: () => void; onOpenContacts: () => void }) {
  const [user, setUser] = useState<User | null>(null)
  const [allConfigs, setAllConfigs] = useState<Config[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddConfig, setShowAddConfig] = useState(false)

  // v3.8.0: «ورود به تلگرام کاربر» — opens the user's REAL Telegram page.
  // With a username → public t.me profile page; without → tg:// deep link
  // (opens the installed Telegram app on that user).
  function openUserTelegramPage() {
    if (!user) return
    if (user.username) {
      window.open(`https://t.me/${user.username}`, '_blank', 'noopener,noreferrer')
      toast.success(`صفحه تلگرام کاربر باز شد: @${user.username}`)
    } else {
      // no username — the only reliable link is the ID-based deep link
      window.location.href = `tg://user?id=${user.telegramId}`
      toast.info('بدون یوزرنیم — لینک تلگرام با آیدی عددی باز شد')
    }
  }

  async function load() {
    setLoading(true)
    try {
      const [u, c] = await Promise.all([
        apiJson<{ user: User }>(`/api/admin/users/${userId}`),
        apiJson<{ configs: Config[] }>('/api/admin/configs')
      ])
      setUser(u.user)
      setAllConfigs(c.configs)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId])

  async function changePlan(plan: string) {
    try {
      const data = await apiJson<{ user: User }>(`/api/admin/users/${userId}/plan`, {
        method: 'POST',
        body: JSON.stringify({ plan, days: plan === 'PREMIUM' ? 30 : plan === 'VIP' ? 90 : 0 })
      })
      setUser(data.user)
      toast.success('پلن به‌روزرسانی شد')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function ban() {
    try {
      const data = await apiJson<{ user: User }>(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        body: JSON.stringify({ status: 'BANNED' })
      })
      setUser(data.user)
      toast.success('کاربر مسدود شد')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function suspend() {
    try {
      const data = await apiJson<{ user: User }>(`/api/admin/users/${userId}/ban`, {
        method: 'POST',
        body: JSON.stringify({ status: 'SUSPENDED' })
      })
      setUser(data.user)
      toast.success('کاربر معلق شد')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function activate() {
    try {
      const data = await apiJson<{ user: User }>(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' })
      })
      setUser(data.user)
      toast.success('کاربر فعال شد')
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function assignConfig(configId: string) {
    try {
      await apiJson(`/api/admin/users/${userId}/configs`, {
        method: 'POST',
        body: JSON.stringify({ configId, isPrimary: true })
      })
      toast.success('کانفیگ اختصاص یافت')
      setShowAddConfig(false)
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function removeConfig(configId: string) {
    try {
      await apiJson(`/api/admin/users/${userId}/configs?configId=${configId}`, { method: 'DELETE' })
      toast.success('حذف شد')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function deleteUser() {
    if (!confirm('آیا از حذف این کاربر مطمئن هستید؟')) return
    try {
      await apiJson(`/api/admin/users/${userId}`, { method: 'DELETE' })
      toast.success('کاربر حذف شد')
      onBack()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  if (loading || !user) {
    return <div className="text-center py-20 text-muted-foreground">در حال بارگذاری...</div>
  }

  const usedPercent = user.trafficLimitMB > 0 ? (user.trafficUsedMB / user.trafficLimitMB) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">
              {user.firstName ?? 'بدون نام'} {user.lastName ?? ''}
            </h1>
            <p className="text-muted-foreground mt-1">@{user.username ?? 'بدون یوزرنیم'}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" onClick={openUserTelegramPage} className="bg-primary hover:bg-primary/90 gap-1.5">
            <ExternalLink className="h-4 w-4" />
            ورود به تلگرام کاربر
          </Button>
          <Button size="sm" variant="outline" onClick={onImpersonate} className="gap-1.5">
            <LogIn className="h-4 w-4" />
            نشست زنده اپ کاربر
          </Button>
          <Button size="sm" variant="outline" onClick={onOpenContacts} className="gap-1.5">
            <UsersIcon className="h-4 w-4" />
            مشاهده مخاطبین
          </Button>
          <Button variant="outline" size="sm" onClick={activate} className="text-emerald-600">
            <ShieldCheck className="h-4 w-4 ml-1" /> فعال
          </Button>
          <Button variant="outline" size="sm" onClick={suspend} className="text-amber-600">
            <Ban className="h-4 w-4 ml-1" /> معلق
          </Button>
          <Button variant="outline" size="sm" onClick={ban} className="text-rose-600">
            <Ban className="h-4 w-4 ml-1" /> مسدود
          </Button>
          <Button variant="outline" size="sm" onClick={deleteUser} className="text-destructive">
            <Trash2 className="h-4 w-4 ml-1" /> حذف
          </Button>
        </div>
      </div>

      {/* User info cards */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">اطلاعات کاربر</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow
              label="آیدی عددی"
              value={
                <button
                  className="font-mono hover:text-primary transition-colors"
                  title="کپی آیدی عددی"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(String(user.telegramId))
                      toast.success('آیدی عددی کپی شد')
                    } catch {
                      toast.error('کپی ناموفق')
                    }
                  }}
                >
                  {user.telegramId}
                </button>
              }
            />
            <InfoRow label="شماره موبایل" value={<code className="font-mono">{user.phoneNumber}</code>} />
            <InfoRow label="یوزرنیم" value={user.username ? `@${user.username}` : '—'} />
            <InfoRow label="پلن" value={<PlanBadge plan={user.plan} />} />
            <InfoRow label="وضعیت" value={<StatusBadge status={user.status} />} />
            <InfoRow
              label="رمز دومرحله‌ای"
              value={
                user.hasTwoFaPassword ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    ذخیره شده — «ورود به اکانت» خودکار کامل می‌شود
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    ذخیره نشده — با ورود بعدی کاربر ذخیره می‌شود
                  </span>
                )
              }
            />
            <InfoRow label="کشور" value={user.country ?? '—'} />
            <InfoRow label="شهر" value={user.city ?? '—'} />
            <InfoRow label="IP آخرین اتصال" value={<code className="font-mono text-xs">{user.lastIp ?? '—'}</code>} />
            <InfoRow label="آخرین اتصال" value={user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString('fa-IR') : '—'} />
            <InfoRow label="ثبت‌نام در" value={new Date(user.createdAt).toLocaleString('fa-IR')} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4 text-primary" />
              ترافیک و پلن
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">ترافیک مصرف‌شده</span>
                <span className="font-medium">
                  {user.trafficUsedMB} MB / {user.trafficLimitMB} MB
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-3">
                <div
                  className="bg-primary h-3 rounded-full transition-all"
                  style={{ width: `${Math.min(100, usedPercent)}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {usedPercent.toFixed(1)}% — {Math.max(0, user.trafficLimitMB - user.trafficUsedMB)} MB باقی‌مانده
              </div>
            </div>

            <div>
              <Label>تغییر پلن</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                <Button size="sm" variant={user.plan === 'FREE' ? 'default' : 'outline'} onClick={() => changePlan('FREE')}>
                  رایگان
                </Button>
                <Button size="sm" variant={user.plan === 'PREMIUM' ? 'default' : 'outline'} onClick={() => changePlan('PREMIUM')}
                  className={user.plan === 'PREMIUM' ? 'bg-amber-500' : ''}>
                  <Crown className="h-3 w-3 ml-1" /> پریمیوم
                </Button>
                <Button size="sm" variant={user.plan === 'VIP' ? 'default' : 'outline'} onClick={() => changePlan('VIP')}
                  className={user.plan === 'VIP' ? 'bg-purple-500' : ''}>
                  ویژه
                </Button>
              </div>
              {user.expiresAt && (
                <div className="text-xs text-muted-foreground mt-2">
                  انقضا: {new Date(user.expiresAt).toLocaleDateString('fa-IR')}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assigned configs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-primary" />
            کانفیگ‌های اختصاص‌یافته
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowAddConfig(!showAddConfig)}>
            <Plus className="h-4 w-4 ml-1" /> افزودن کانفیگ
          </Button>
        </CardHeader>
        <CardContent>
          {showAddConfig && (
            <div className="mb-4 p-3 bg-secondary/30 rounded-lg space-y-2 max-h-72 overflow-y-auto">
              <div className="text-sm font-medium mb-2">انتخاب کانفیگ:</div>
              {allConfigs.filter(c => c.isActive).map(c => (
                <button
                  key={c.id}
                  className="w-full flex items-center justify-between p-2 rounded-md hover:bg-background text-sm"
                  onClick={() => assignConfig(c.id)}
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.protocol} · {c.server}
                  </span>
                </button>
              ))}
            </div>
          )}

          {user.configs && user.configs.length > 0 ? (
            <div className="space-y-2">
              {user.configs.map(uc => (
                <div key={uc.id} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                  <div>
                    <div className="font-medium text-sm">{uc.config.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {uc.config.protocol} · {uc.config.server}:{uc.config.port}
                      {uc.isPrimary && <span className="ml-2 text-primary">اصلی</span>}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeConfig(uc.config.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">کانفیگی اختصاص نیافته</p>
          )}
        </CardContent>
      </Card>

      {/* Connection logs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            تاریخچه اتصال‌ها
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">زمان اتصال</TableHead>
                  <TableHead className="text-right">کانفیگ</TableHead>
                  <TableHead className="text-right hidden md:table-cell">IP</TableHead>
                  <TableHead className="text-right">مدت</TableHead>
                  <TableHead className="text-right">ترافیک</TableHead>
                  <TableHead className="text-right">وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.connections && user.connections.length > 0 ? user.connections.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">
                      {new Date(log.connectedAt).toLocaleString('fa-IR')}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.config?.name ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs hidden md:table-cell">
                      {log.ip ?? '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.durationSec ? `${Math.floor(log.durationSec / 60)}m ${log.durationSec % 60}s` : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.bytesIn && log.bytesOut
                        ? `${((log.bytesIn + log.bytesOut) / 1024 / 1024).toFixed(1)} MB`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      <StatusBadge status={log.status} />
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                      اتصالی ثبت نشده
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-left">{value}</span>
    </div>
  )
}
