'use client'

import { useEffect, useState } from 'react'
import { apiJson, apiDownload } from '@/lib/client-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ArrowRight, Search, Users, UserCheck, RefreshCw, Mail, Phone, Download } from 'lucide-react'
import { toast } from 'sonner'

interface Contact {
  id: string
  phoneNumber?: string | null
  firstName?: string | null
  lastName?: string | null
  telegramId?: string | null
  username?: string | null
  isTelegramSource?: boolean
  isRegistered: boolean
  isMutual: boolean
  lastSyncedAt: string
  contactUser?: {
    id: string
    telegramId: string
    phoneNumber: string
    username?: string | null
    firstName?: string | null
    lastName?: string | null
    plan: string
    status: string
    lastSeenAt?: string | null
    avatarUrl?: string | null
  } | null
}

interface ContactsResponse {
  total: number
  registered: number
  mutual: number
  contacts: Contact[]
}

export function ContactsView({ userId, onBack, onOpenUser }: {
  userId: string
  onBack: () => void
  onOpenUser: (id: string) => void
}) {
  const [data, setData] = useState<ContactsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)

  async function exportCsv() {
    setExporting(true)
    try {
      await apiDownload(`/api/admin/users/${userId}/contacts/export`, 'azadgram-contacts.csv')
      toast.success('فایل CSV مخاطبین دانلود شد')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setExporting(false)
    }
  }

  async function load() {
    setLoading(true)
    try {
      const d = await apiJson<ContactsResponse>(`/api/admin/users/${userId}/contacts`)
      setData(d)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [userId])

  const filtered = data?.contacts.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (c.phoneNumber ?? '').includes(q) ||
      (c.telegramId ?? '').includes(q) ||
      (c.username ?? '').toLowerCase().includes(q) ||
      (c.firstName ?? '').toLowerCase().includes(q) ||
      (c.lastName ?? '').toLowerCase().includes(q) ||
      (c.contactUser?.username ?? '').toLowerCase().includes(q)
    )
  }) ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">مخاطبین کاربر</h1>
            <p className="text-muted-foreground mt-1">
              {data ? `${data.total} مخاطب — ${data.registered} آزادگرامی — ${data.mutual} دوطرفه` : 'در حال بارگذاری...'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={exportCsv} disabled={exporting} className="bg-primary">
            <Download className="h-4 w-4 ml-1.5" />
            {exporting ? 'در حال آماده‌سازی...' : 'دانلود CSV'}
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ml-1.5 ${loading ? 'animate-spin' : ''}`} />
            به‌روزرسانی
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
                <div className="text-xl font-bold">{data.total}</div>
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
                <div className="text-xl font-bold">{data.registered}</div>
                <div className="text-[11px] text-muted-foreground">کاربر آزادگرام</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xl font-bold">{data.mutual}</div>
                <div className="text-[11px] text-muted-foreground">مخاطبین دوطرفه</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            لیست مخاطبین
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="جستجوی شماره، نام..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>

          {loading ? (
            <p className="text-center py-8 text-muted-foreground">در حال بارگذاری...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">مخاطبی یافت نشد</p>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">نام</TableHead>
                    <TableHead className="text-right">
                      <Phone className="h-3 w-3 ml-1 inline" />
                      شماره موبایل
                    </TableHead>
                    <TableHead className="text-right">وضعیت آزادگرام</TableHead>
                    <TableHead className="text-right hidden md:table-cell">آخرین سینک</TableHead>
                    <TableHead className="text-right">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => (
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
                            {!c.contactUser && c.username && (
                              <div className="text-xs text-muted-foreground">@{c.username}</div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs" dir="ltr">
                        {c.phoneNumber ? (
                          c.phoneNumber
                        ) : (
                          <span className="text-muted-foreground">— بدون شماره (مخاطب تلگرام) —</span>
                        )}
                        {c.telegramId && (
                          <div className="text-[10px] text-muted-foreground mt-0.5" dir="ltr">
                            TG ID: {c.telegramId}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
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
                      <TableCell className="text-xs hidden md:table-cell">
                        {new Date(c.lastSyncedAt).toLocaleDateString('fa-IR')}
                      </TableCell>
                      <TableCell>
                        {c.contactUser && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onOpenUser(c.contactUser!.id)}
                          >
                            مشاهده پروفایل
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
