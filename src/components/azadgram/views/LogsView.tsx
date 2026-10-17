'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@/lib/client-auth'
import { ConnectionLog } from '../types'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { StatusBadge } from './UsersView'

export function LogsView({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [logs, setLogs] = useState<ConnectionLog[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState('')
  const [userId, setUserId] = useState('')

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    params.set('page', String(page))
    if (status) params.set('status', status)
    if (userId) params.set('userId', userId)
    try {
      const data = await apiJson<{ logs: ConnectionLog[]; total: number; totalPages: number }>(`/api/admin/logs?${params}`)
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
  }, [page, status, userId])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">لاگ اتصال‌ها</h1>
        <p className="text-muted-foreground mt-1">تاریخچه اتصال کاربران به کانفیگ‌ها ({total})</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select value={status} onValueChange={(v) => { setPage(1); setStatus(v === 'all' ? '' : v) }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="همه وضعیت‌ها" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="CONNECTED">متصل</SelectItem>
                <SelectItem value="DISCONNECTED">قطع شده</SelectItem>
                <SelectItem value="FAILED">ناموفق</SelectItem>
                <SelectItem value="EXPIRED">منقضی</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="فیلتر با User ID"
              value={userId}
              onChange={e => { setPage(1); setUserId(e.target.value) }}
              className="w-64"
              dir="ltr"
            />
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">زمان</TableHead>
                  <TableHead className="text-right">کاربر</TableHead>
                  <TableHead className="text-right hidden md:table-cell">کانفیگ</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">IP</TableHead>
                  <TableHead className="text-right">مدت</TableHead>
                  <TableHead className="text-right">ترافیک</TableHead>
                  <TableHead className="text-right">وضعیت</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      در حال بارگذاری...
                    </TableCell>
                  </TableRow>
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      لاگی وجود ندارد
                    </TableCell>
                  </TableRow>
                ) : logs.map(log => (
                  <TableRow key={log.id} className="hover:bg-accent/30">
                    <TableCell className="text-xs">
                      {new Date(log.connectedAt).toLocaleString('fa-IR')}
                    </TableCell>
                    <TableCell>
                      <button
                        className="text-sm hover:underline"
                        onClick={() => log.userId && onOpenUser(log.userId)}
                      >
                        {log.user?.phoneNumber ?? log.userId.slice(-6)}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs hidden md:table-cell">
                      {log.config?.name ?? '—'}
                    </TableCell>
                    <TableCell className="font-mono text-xs hidden lg:table-cell">
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
                    <TableCell>
                      <StatusBadge status={log.status} />
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
                <Button size="sm" variant="outline" disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}>
                  <ChevronRight className="h-4 w-4" /> قبلی
                </Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
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
