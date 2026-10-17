'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiJson } from '@/lib/client-auth'
import { compareReleaseRank, parseSemVer } from '@/lib/version-compare'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Package, Plus, Trash2, ExternalLink, BadgeCheck } from 'lucide-react'
import { toast } from 'sonner'

interface AppRelease {
  id: string
  version: string
  versionCode: number
  downloadUrl: string
  changelog?: string | null
  minAndroid?: number | null
  isActive: boolean
  forceUpdate: boolean
  releasedAt: string
}

/** 1.9.7 → 10907 (major*10000 + minor*100 + patch) — panel-internal code scheme. */
function versionCodeFromVersion(version: string): string {
  const v = parseSemVer(version)
  if (!v) return ''
  return String(v.major * 10000 + v.minor * 100 + v.patch)
}

export function ReleasesView() {
  const [releases, setReleases] = useState<AppRelease[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await apiJson<{ releases: AppRelease[] }>('/api/admin/releases')
      setReleases(data.releases)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function del(id: string) {
    if (!confirm('حذف این نسخه؟')) return
    try {
      await apiJson(`/api/admin/releases/${id}`, { method: 'DELETE' })
      toast.success('نسخه حذف شد')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  /** PATCH an existing release (forceUpdate / isActive toggles). */
  async function patch(id: string, changes: Record<string, unknown>) {
    try {
      await apiJson(`/api/admin/releases/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(changes)
      })
      setReleases(prev => prev.map(r => (r.id === id ? { ...r, ...changes } as AppRelease : r)))
    } catch (e: any) {
      toast.error(e.message)
      load() // revert optimistic state on failure
    }
  }

  // Newest first; same ranking the client version endpoint uses to pick the
  // release it serves (semantic version, then code, then date).
  const sorted = useMemo(
    () => [...releases].sort((a, b) =>
      compareReleaseRank(
        { ...b, releasedAt: new Date(b.releasedAt) },
        { ...a, releasedAt: new Date(a.releasedAt) }
      )
    ),
    [releases]
  )
  const servingId = sorted.find(r => r.isActive)?.id

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">نسخه‌های اپلیکیشن</h1>
          <p className="text-muted-foreground mt-1">مدیریت نسخه‌های آزادگرام کلاینت</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="bg-primary">
              <Plus className="h-4 w-4 ml-2" /> انتشار نسخه جدید
            </Button>
          </DialogTrigger>
          <ReleaseDialog onSaved={() => { setShowAdd(false); load() }} />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">نسخه</TableHead>
                <TableHead className="text-right">کد</TableHead>
                <TableHead className="text-right hidden md:table-cell">تاریخ انتشار</TableHead>
                <TableHead className="text-right">آپدیت اجباری</TableHead>
                <TableHead className="text-right">فعال</TableHead>
                <TableHead className="text-right">لینک</TableHead>
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
              ) : sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    نسخه‌ای منتشر نشده
                  </TableCell>
                </TableRow>
              ) : sorted.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-medium whitespace-nowrap">
                    v{r.version}{' '}
                    {r.id === servingId && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-primary align-middle">
                        <BadgeCheck className="h-3.5 w-3.5" /> در حال سرویس
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.versionCode}</TableCell>
                  <TableCell className="text-xs hidden md:table-cell">
                    {new Date(r.releasedAt).toLocaleDateString('fa-IR')}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={r.forceUpdate}
                      onCheckedChange={v => patch(r.id, { forceUpdate: v })}
                      title="آپدیت اجباری برای کاربران نسخه‌های قدیمی‌تر"
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={r.isActive}
                      onCheckedChange={v => patch(r.id, { isActive: v })}
                      title="نسخه فعال در بررسی به‌روزرسانی کلاینت"
                    />
                  </TableCell>
                  <TableCell>
                    <a
                      href={r.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      دانلود <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" title="حذف نسخه" onClick={() => del(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm space-y-2">
            <div className="font-medium">نحوه‌ی عملکرد به‌روزرسانی:</div>
            <ul className="list-disc pr-5 space-y-1.5 text-muted-foreground leading-relaxed">
              <li>
                کلاینت هنگام اجرای برنامه به‌صورت خودکار نسخه را با پنل مقایسه می‌کند و دکمه‌ی
                «بررسی به‌روزرسانی» در تنظیمات پیشرفته‌ی برنامه هم همین بررسی را انجام می‌دهد.
              </li>
              <li>
                مقایسه بر اساس <b>شماره‌ی نسخه</b> انجام می‌شود (مثلاً 1.9.7 &gt; 1.9.6)؛ کد نسخه
                فقط جنبه‌ی اطلاعاتی دارد و اگر خالی باشد به‌طور خودکار از شماره‌ی نسخه محاسبه می‌شود.
              </li>
              <li>
                در صورت وجود نسخه‌ی جدیدتر، به کاربر نوتیفیکیشن دانلود نشان داده می‌شود؛ اگر
                «آپدیت اجباری» فعال باشد عنوان نوتیفیکیشن «الزامی» خواهد بود.
              </li>
              <li>
                سوییچ «آپدیت اجباری» و «فعال» را می‌توانید بعداً هم از همین جدول برای هر نسخه تغییر دهید.
              </li>
              <li>
                برای آنکه کاربرانِ همان نسخه هم آپدیت بگیرند، شماره‌ی نسخه‌ی جدید را
                <b> بزرگ‌تر</b> از نسخه‌ی قبل منتشر کنید (مثلاً 1.9.7).
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function ReleaseDialog({ onSaved }: { onSaved: () => void }) {
  const [version, setVersion] = useState('1.0.0')
  const [versionCode, setVersionCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState('')
  const [changelog, setChangelog] = useState('')
  const [minAndroid, setMinAndroid] = useState('26')
  const [forceUpdate, setForceUpdate] = useState(false)
  const [saving, setSaving] = useState(false)

  // Auto-derive the code from the version string until the admin edits it manually.
  const effectiveCode = codeTouched ? versionCode : versionCodeFromVersion(version)

  function onVersionChange(v: string) {
    setVersion(v)
    if (!codeTouched) setVersionCode(versionCodeFromVersion(v))
  }

  async function save() {
    if (!version || !effectiveCode || !downloadUrl) {
      toast.error('نسخه، کد و لینک الزامی هستند')
      return
    }
    setSaving(true)
    try {
      await apiJson('/api/admin/releases', {
        method: 'POST',
        body: JSON.stringify({
          version, versionCode: parseInt(effectiveCode), downloadUrl,
          changelog, minAndroid: parseInt(minAndroid), forceUpdate,
          isActive: true
        })
      })
      toast.success('نسخه منتشر شد')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>انتشار نسخه جدید آزادگرام</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>شماره نسخه</Label>
            <Input value={version} onChange={e => onVersionChange(e.target.value)} placeholder="1.9.7" dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label>کد نسخه (اختیاری)</Label>
            <Input
              type="number"
              value={effectiveCode}
              onChange={e => { setCodeTouched(true); setVersionCode(e.target.value) }}
              placeholder="خودکار"
              dir="ltr"
            />
            <p className="text-[11px] text-muted-foreground">خالی بگذارید تا از شماره نسخه محاسبه شود</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>لینک دانلود APK *</Label>
          <Input value={downloadUrl} onChange={e => setDownloadUrl(e.target.value)} placeholder="https://.../azadgram-1.9.7.apk" dir="ltr" />
        </div>
        <div className="space-y-1.5">
          <Label>چنجلاگ (تغییرات)</Label>
          <Textarea value={changelog} onChange={e => setChangelog(e.target.value)} rows={4}
            placeholder="✓ اضافه شدن قابلیت..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>حداقل نسخه اندروید (API)</Label>
            <Input type="number" value={minAndroid} onChange={e => setMinAndroid(e.target.value)} dir="ltr" />
          </div>
          <div className="flex items-center gap-2 pt-7">
            <Switch checked={forceUpdate} onCheckedChange={setForceUpdate} />
            <Label>آپدیت اجباری</Label>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button onClick={save} disabled={saving} className="bg-primary">
          <Package className="h-4 w-4 ml-2" />
          {saving ? 'در حال انتشار...' : 'انتشار'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
