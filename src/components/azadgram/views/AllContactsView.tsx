'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiJson, apiDownload } from '@/lib/client-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Users, UserCheck, RefreshCw, Download, ChevronRight, ChevronLeft, BookUser, Phone } from 'lucide-react'
import { toast } from 'sonner'

interface MiniUser {
  id: string
  telegramId: string
  phoneNumber: string
  username?: string | null
  firstName?: string | null
  lastName?: string | null
  plan: string
  status: string
  lastSeenAt?: string | null
}

interface GlobalContact {
  id: string
  phoneNumber?: string | null
  firstName?: string | null
  lastName?: string | null
  telegramId?: string | null
  username?: string | null
  isRegistered: boolean
  isMutual: boolean
  lastSyncedAt: string
  owner: MiniUser | null
  contactUser: MiniUser | null
}

interface GlobalContactsResponse {
  total: number
  page: number
  pages: number
  stats: { total: number; registered: number; owners: number }
  contacts: GlobalContact[]
}

/**
 * "مخاطبین همه کاربران" — global search across every user's synced contact
 * list, with CSV export.
 */
export function AllContactsView({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [data, setData] = useState<GlobalContactsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async (q: string, p: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: '50' })
      if (q) params.set('q', q)
      const d = await apiJson<GlobalContactsResponse>(`/api/admin/contacts?${params}`)
      setData(d)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(query, page) }, [load, query, page])

  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault()
    setPage(1)
    setQuery(search.trim())
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      if (query) params.set('q', query)
      await apiDownload(`/api/admin/contacts/export?${params}`, 'azadgram-all-contacts.csv')
      toast.success('فایل CSV دانلود شد')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <BookUser className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">مخاطبین همه کاربران</h1>
            <p className="text-muted-foreground mt-1">
              {data
                ? `${data.stats.total.toLocaleString('fa-IR')} مخاطب از ${data.stats.owners.toLocaleString('fa-IR')} کاربر — ${data.stats.registered.toLocaleString('fa-IR')} آزادگرامی`
                : 'در حال بارگذاری...'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load(query, page)} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-1.5 ${loading ? 'animate-spin' : ''}`} />
            به‌روزرسانی
          </Button>
          <Button size="sm" onClick={exportCsv} disabled={exporting} className="bg-primary">
            <Download className="h-4 w-4 ml-1.5" />
            {exporting ? 'در حال آماده‌سازی...' : 'دانلود CSV'}
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {data && (
        <div className="grid gap-4 grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary text-secondary-foreground">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xl font-bold">{data.stats.total.toLocaleString('fa-IR')}</div>
                <div className="text-[11px] text-muted-foreground">کل مخاطبین</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                <UserCheck className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xl font-bold">{data.stats.registered.toLocaleString('fa-IR')}</div>
                <div className="text-[11px] text-muted-foreground">کاربر آزادگرام</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
                <Users className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xl font-bold">{data.stats.owners.toLocaleString('fa-IR')}</div>
                <div className="text-[11px] text-muted-foreground">کاربر سینک‌شده</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            جستجو در مخاطبین همه کاربران
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submitSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="نام، شماره موبایل، یوزرنیم یا آیدی — در مخاطبین و صاحبان لیست‌ها..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            <Button type="submit" variant="secondary">جستجو</Button>
          </form>

          {loading ? (
            <p className="text-center py-8 text-muted-foreground">در حال بارگذاری...</p>
          ) : !data || data.contacts.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">مخاطبی یافت نشد</p>
          ) : (
            <ScrollArea className="max-h-[55vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">مخاطب</TableHead>
                    <TableHead className="text-right">
                      <Phone className="h-3 w-3 ml-1 inline" />
                      شماره
                    </TableHead>
                    <TableHead className="text-right">صاحب لیست</TableHead>
                    <TableHead className="text-right hidden md:table-cell">وضعیت</TableHead>
                    <TableHead className="text-right hidden lg:table-cell">آخرین سینک</TableHead>
                    <TableHead className="text-right">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.contacts.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className={c.isRegistered ? 'bg-primary/10 text-primary' : 'bg-muted'}>
                              {(c.firstName ?? c.username ?? c.phoneNumber?.slice(-2) ?? c.telegramId?.slice(-2) ?? '؟').slice(0, 1)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">
                              {[c.firstName, c.lastName].filter(Boolean).join(' ') || 'بدون نام'}
                            </div>
                            {c.contactUser?.username && (
                              <div className="text-xs text-muted-foreground">@{c.contactUser.username}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs" dir="ltr">
                        {c.phoneNumber
                          ? c.phoneNumber
                          : <span className="text-muted-foreground">— بدون شماره —</span>}
                        {c.telegramId && (
                          <div className="text-[10px] text-muted-foreground mt-0.5" dir="ltr">
                            TG ID: {c.telegramId}{c.username ? ` · @${c.username}` : ''}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.owner ? (
                          <button
                            className="text-sm text-primary hover:underline text-right"
                            onClick={() => onOpenUser(c.owner!.id)}
                          >
                            {[c.owner.firstName, c.owner.lastName].filter(Boolean).join(' ') || c.owner.telegramId}
                            <span className="block text-[10px] text-muted-foreground font-mono" dir="ltr">
                              {c.owner.phoneNumber}
                            </span>
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {c.isRegistered ? (
                          <div className="flex flex-col gap-1">
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 w-fit">ثبت‌شده</Badge>
                            {c.isMutual && (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-700 w-fit">دوطرفه</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">غیرثبت‌شده</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">
                        {new Date(c.lastSyncedAt).toLocaleDateString('fa-IR')}
                      </TableCell>
                      <TableCell>
                        {c.contactUser && (
                          <Button size="sm" variant="ghost" onClick={() => onOpenUser(c.contactUser!.id)}>
                            پروفایل
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          {/* Pagination */}
          {data && data.pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">
                صفحه {data.page.toLocaleString('fa-IR')} از {data.pages.toLocaleString('fa-IR')} — {data.total.toLocaleString('fa-IR')} نتیجه
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm" variant="outline"
                  disabled={data.page <= 1 || loading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  size="sm" variant="outline"
                  disabled={data.page >= data.pages || loading}
                  onClick={() => setPage(p => p + 1)}
                >
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
