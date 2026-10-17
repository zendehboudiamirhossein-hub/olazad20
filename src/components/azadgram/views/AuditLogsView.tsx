'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@/lib/client-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'

interface AuditLog {
  id: string
  action: string
  targetType: string
  targetId?: string | null
  meta?: any
  ip?: string | null
  createdAt: string
  admin?: { username: string; role: string } | null
}

const ACTION_LABELS: Record<string, string> = {
  'admin.login': 'ورود ادمین',
  'admin.logout': 'خروج ادمین',
  'admin.password_change': 'تغییر رمز',
  'user.create': 'ایجاد کاربر',
  'user.update': 'ویرایش کاربر',
  'user.delete': 'حذف کاربر',
  'user.ban': 'مسدودسازی',
  'user.suspend': 'تعلیق',
  'user.activate': 'فعال‌سازی',
  'user.plan_change': 'تغییر پلن',
  'user.config_assign': 'تخصیص کانفیگ',
  'user.config_remove': 'حذف کانفیگ',
  'config.create': 'ایجاد کانفیگ',
  'config.update': 'ویرایش کانفیگ',
  'config.delete': 'حذف کانفیگ',
  'release.create': 'انتشار نسخه',
  'release.update': 'ویرایش نسخه',
  'release.delete': 'حذف نسخه',
  'settings.update': 'تغییر تنظیمات',
  'client.login': 'ورود کلاینت',
  'client.otp_failopen': 'ارسال نشدن کد (ورود آزاد)',
  'user.impersonate': 'ورود به اکانت کاربر'
}

export function AuditLogsView() {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [action, setAction] = useState('')
  const [targetType, setTargetType] = useState('')

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    if (action) params.set('action', action)
    if (targetType) params.set('targetType', targetType)
    try {
      const data = await apiJson<{ logs: AuditLog[]; total: number; totalPages: number }>(`/api/admin/audit-logs?${params}`)
      setLogs(data.logs)
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
  }, [page, action, targetType])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">لاگ ممیزی</h1>
        <p className="text-muted-foreground mt-1">تاریخچه‌ی تمام عملیات ادمین‌ها ({total})</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={action} onValueChange={(v) => { setPage(1); setAction(v === 'all' ? '' : v) }}>
              <SelectTrigger className="w-56"><SelectValue placeholder="همه عملیات‌ها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه عملیات</SelectItem>
                {Object.entries(ACTION_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={targetType} onValueChange={(v) => { setPage(1); setTargetType(v === 'all' ? '' : v) }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="همه نوع‌ها" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="USER">کاربر</SelectItem>
                <SelectItem value="CONFIG">کانفیگ</SelectItem>
                <SelectItem value="RELEASE">نسخه</SelectItem>
                <SelectItem value="SETTING">تنظیم</SelectItem>
                <SelectItem value="ADMIN">ادمین</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">زمان</TableHead>
                  <TableHead className="text-right">ادمین</TableHead>
                  <TableHead className="text-right">عملیات</TableHead>
                  <TableHead className="text-right">نوع هدف</TableHead>
                  <TableHead className="text-right hidden md:table-cell">شناسه هدف</TableHead>
                  <TableHead className="text-right hidden md:table-cell">IP</TableHead>
                  <TableHead className="text-right">جزئیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">در حال بارگذاری...</TableCell></TableRow>
                ) : logs.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">موردی یافت نشد</TableCell></TableRow>
                ) : logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">{new Date(log.createdAt).toLocaleString('fa-IR')}</TableCell>
                    <TableCell className="text-xs">
                      {log.admin ? `${log.admin.username}` : 'سیستم'}
                    </TableCell>
                    <TableCell className="text-xs">{ACTION_LABELS[log.action] ?? log.action}</TableCell>
                    <TableCell className="text-xs">{log.targetType}</TableCell>
                    <TableCell className="font-mono text-xs hidden md:table-cell">{log.targetId?.slice(-8) ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs hidden md:table-cell">{log.ip ?? '—'}</TableCell>
                    <TableCell className="text-xs">
                      {log.meta ? (
                        <code className="text-[10px] block max-w-xs overflow-hidden text-ellipsis whitespace-nowrap" dir="ltr">
                          {JSON.stringify(log.meta).slice(0, 80)}
                        </code>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">صفحه {page} از {totalPages}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronRight className="h-4 w-4" /> قبلی
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
                  بعدی <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
