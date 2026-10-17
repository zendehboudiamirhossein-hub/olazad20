'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@/lib/client-auth'
import { User } from '../types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, UserPlus, ChevronLeft, ChevronRight, Phone, Hash, Eye, Ban, CheckCircle, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'

export function UsersView({ onOpenUser, onImpersonate }: { onOpenUser: (id: string) => void; onImpersonate: (id: string) => void }) {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState('')
  const [status, setStatus] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('pageSize', '20')
    if (search) params.set('q', search)
    if (plan) params.set('plan', plan)
    if (status) params.set('status', status)
    try {
      const data = await apiJson<{ users: User[]; total: number; totalPages: number }>(`/api/admin/users?${params}`)
      setUsers(data.users)
      setTotal(data.total)
      setTotalPages(data.totalPages)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [page, search, plan, status])

  async function toggleBan(u: User) {
    const newStatus = u.status === 'BANNED' ? 'ACTIVE' : 'BANNED'
    try {
      if (newStatus === 'ACTIVE') {
        await apiJson(`/api/admin/users/${u.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'ACTIVE' })
        })
      } else {
        await apiJson(`/api/admin/users/${u.id}/ban`, {
          method: 'POST',
          body: JSON.stringify({ status: 'BANNED' })
        })
      }
      toast.success(newStatus === 'BANNED' ? 'کاربر مسدود شد' : 'مسدودی برداشته شد')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">کاربران</h1>
          <p className="text-muted-foreground mt-1">مدیریت کاربران آزادگرام ({total} نفر)</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-primary hover:bg-primary/90">
              <UserPlus className="h-4 w-4 ml-2" />
              افزودن کاربر
            </Button>
          </DialogTrigger>
          <AddUserDialog onAdded={() => { setShowAdd(false); load() }} />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="جستجوی شماره، آیدی، نام..."
                value={search}
                onChange={e => { setPage(1); setSearch(e.target.value) }}
                className="pr-10"
              />
            </div>
            <Select value={plan} onValueChange={(v) => { setPage(1); setPlan(v === 'all' ? '' : v) }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="همه پلن‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه پلن‌ها</SelectItem>
                <SelectItem value="FREE">رایگان</SelectItem>
                <SelectItem value="PREMIUM">پریمیوم</SelectItem>
                <SelectItem value="VIP">ویژه</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setPage(1); setStatus(v === 'all' ? '' : v) }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="همه وضعیت‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه وضعیت‌ها</SelectItem>
                <SelectItem value="ACTIVE">فعال</SelectItem>
                <SelectItem value="SUSPENDED">معلق</SelectItem>
                <SelectItem value="BANNED">مسدود</SelectItem>
                <SelectItem value="EXPIRED">منقضی</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">کاربر</TableHead>
                  <TableHead className="text-right hidden md:table-cell">
                    <Hash className="h-3 w-3 ml-1 inline" />آیدی عددی
                  </TableHead>
                  <TableHead className="text-right">
                    <Phone className="h-3 w-3 ml-1 inline" />شماره موبایل
                  </TableHead>
                  <TableHead className="text-right hidden lg:table-cell">پلن</TableHead>
                  <TableHead className="text-right">ترافیک</TableHead>
                  <TableHead className="text-right">وضعیت</TableHead>
                  <TableHead className="text-right">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      در حال بارگذاری...
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      کاربری یافت نشد
                    </TableCell>
                  </TableRow>
                ) : users.map(u => (
                  <TableRow key={u.id} className="hover:bg-accent/30 cursor-pointer">
                    <TableCell onClick={() => onOpenUser(u.id)}>
                      <div className="flex items-center gap-3">
                        <div className="azadgram-logo w-9 h-9 text-sm shrink-0">
                          {u.firstName?.[0] ?? u.phoneNumber.slice(-2)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {u.firstName ?? 'بدون نام'} {u.lastName ?? ''}
                          </div>
                          {u.username && (
                            <div className="text-xs text-muted-foreground">@{u.username}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs hidden md:table-cell" onClick={() => onOpenUser(u.id)}>
                      {u.telegramId}
                    </TableCell>
                    <TableCell className="font-mono text-sm" onClick={() => onOpenUser(u.id)}>
                      {u.phoneNumber}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell" onClick={() => onOpenUser(u.id)}>
                      <PlanBadge plan={u.plan} />
                    </TableCell>
                    <TableCell onClick={() => onOpenUser(u.id)}>
                      <div className="text-xs">
                        {u.trafficUsedMB} / {u.trafficLimitMB} MB
                      </div>
                      <div className="w-20 bg-muted rounded-full h-1.5 mt-1">
                        <div
                          className="bg-primary h-1.5 rounded-full"
                          style={{ width: `${u.trafficLimitMB > 0 ? Math.min(100, (u.trafficUsedMB / u.trafficLimitMB) * 100) : 0}%` }}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={u.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" title="مشاهده جزئیات" onClick={() => onOpenUser(u.id)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="ورود به اکانت کاربر"
                          className="text-primary hover:text-primary"
                          disabled={u.status === 'BANNED'}
                          onClick={() => onImpersonate(u.id)}
                        >
                          <LogIn className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title={u.status === 'BANNED' ? 'رفع مسدودی' : 'مسدودسازی'}
                          className={u.status === 'BANNED' ? 'text-emerald-600' : 'text-rose-500'}
                          onClick={() => toggleBan(u)}
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                صفحه {page} از {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                  قبلی
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  بعدی
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function PlanBadge({ plan }: { plan: string }) {
  const labels: Record<string, string> = { FREE: 'رایگان', PREMIUM: 'پریمیوم', VIP: 'ویژه' }
  const styles: Record<string, string> = {
    FREE: 'bg-secondary text-secondary-foreground',
    PREMIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    VIP: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400'
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs ${styles[plan] ?? styles.FREE}`}>
      {labels[plan] ?? plan}
    </span>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ACTIVE: 'فعال', SUSPENDED: 'معلق', BANNED: 'مسدود', EXPIRED: 'منقضی'
  }
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
    SUSPENDED: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
    BANNED: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
    EXPIRED: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400'
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1 ${styles[status] ?? styles.ACTIVE}`}>
      <span className={`status-dot status-${status.toLowerCase()}`} />
      {labels[status] ?? status}
    </span>
  )
}

function AddUserDialog({ onAdded }: { onAdded: () => void }) {
  const [phoneNumber, setPhoneNumber] = useState('')
  const [telegramId, setTelegramId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [username, setUsername] = useState('')
  const [plan, setPlanValue] = useState('FREE')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (!phoneNumber || !telegramId) {
      toast.error('شماره موبایل و آیدی عددی الزامی است')
      return
    }
    setSaving(true)
    try {
      await apiJson('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber, telegramId, firstName, lastName, username, plan
        })
      })
      toast.success('کاربر اضافه شد')
      setPhoneNumber(''); setTelegramId(''); setFirstName(''); setLastName(''); setUsername('')
      onAdded()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>افزودن کاربر جدید</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>شماره موبایل *</Label>
          <Input value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} placeholder="98912xxxxxxx" />
        </div>
        <div className="space-y-1.5">
          <Label>آیدی عددی تلگرام *</Label>
          <Input value={telegramId} onChange={e => setTelegramId(e.target.value)} placeholder="123456789" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>نام</Label>
            <Input value={firstName} onChange={e => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>نام خانوادگی</Label>
            <Input value={lastName} onChange={e => setLastName(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>یوزرنیم تلگرام</Label>
          <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="username" />
        </div>
        <div className="space-y-1.5">
          <Label>پلن</Label>
          <Select value={plan} onValueChange={setPlanValue}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FREE">رایگان (۱۰GB)</SelectItem>
              <SelectItem value="PREMIUM">پریمیوم (۵۰GB)</SelectItem>
              <SelectItem value="VIP">ویژه (نامحدود)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'در حال ذخیره...' : 'ذخیره'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
