'use client'

import { useEffect, useRef, useState } from 'react'
import { apiJson, apiDownload } from '@/lib/client-auth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import { Save, Server, Globe, Lock, DatabaseBackup, Upload, Download, Megaphone, TriangleAlert } from 'lucide-react'

export function SettingsView() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreFile, setRestoreFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    apiJson<{ settings: Record<string, string> }>('/api/admin/settings')
      .then(d => setSettings(d.settings))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try {
      await apiJson('/api/admin/settings', { method: 'PUT', body: JSON.stringify(settings) })
      toast.success('تنظیمات ذخیره شد')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function changePassword() {
    setChangingPassword(true)
    try {
      await apiJson('/api/admin/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      })
      toast.success('رمز تغییر کرد. باید دوباره وارد شوید.')
      setTimeout(() => window.location.reload(), 1000)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setChangingPassword(false)
    }
  }

  async function downloadBackup() {
    setBackingUp(true)
    try {
      await apiDownload('/api/admin/backup', 'azadgram-backup.json')
      toast.success('فایل پشتیبان کامل دانلود شد')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setBackingUp(false)
    }
  }

  async function doRestore() {
    if (!restoreFile) return
    setRestoring(true)
    try {
      const text = await restoreFile.text()
      const parsed = JSON.parse(text)
      const res = await apiJson<{ ok: boolean; restored: Record<string, number> }>(
        '/api/admin/restore',
        { method: 'POST', body: JSON.stringify(parsed) }
      )
      toast.success(
        'بازیابی کامل شد — ' +
        `${(res.restored?.users ?? 0).toLocaleString('fa-IR')} کاربر، ` +
        `${(res.restored?.contacts ?? 0).toLocaleString('fa-IR')} مخاطب، ` +
        `${(res.restored?.configs ?? 0).toLocaleString('fa-IR')} کانفیگ`
      )
      setRestoreFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e: any) {
      toast.error(e.message || 'بازیابی ناموفق بود')
    } finally {
      setRestoring(false)
    }
  }

  function set(k: string, v: string) {
    setSettings(prev => ({ ...prev, [k]: v }))
  }

  if (loading) {
    return <div className="text-center py-20 text-muted-foreground">در حال بارگذاری...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">تنظیمات</h1>
        <p className="text-muted-foreground mt-1">پیکربندی پنل و کلاینت آزادگرام</p>
      </div>

      {/* Password change */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4 text-primary" />
            تغییر رمز عبور
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>رمز فعلی</Label>
            <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label>رمز جدید (حداقل ۱۶ کاراکتر — حرف بزرگ، کوچک و عدد)</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} dir="ltr" />
            <p className="text-xs text-muted-foreground">
              پس از تغییر، تمام sessionها حذف و باید دوباره وارد شوید.
            </p>
          </div>
          <Button
            onClick={changePassword}
            disabled={changingPassword || !currentPassword || !newPassword || newPassword.length < 16}
          >
            {changingPassword ? 'در حال تغییر...' : 'تغییر رمز'}
          </Button>
        </CardContent>
      </Card>

      {/* Backup & restore */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DatabaseBackup className="h-4 w-4 text-primary" />
            پشتیبان‌گیری و بازیابی (بکاپ کل داده‌ها)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-border p-4 space-y-3">
            <div className="font-medium text-sm">تهیه نسخه پشتیبان</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              یک فایل JSON شامل تمام داده‌ها دانلود می‌شود: کاربران، مخاطبین، کانفیگ‌ها، اتصال‌ها،
              ترافیک، تنظیمات، نسخه‌های اپ و لاگ ممیزی. پیشنهاد می‌شود به‌صورت دوره‌ای پشتیبان بگیرید و
              فایل را در جای امن نگه دارید.
            </p>
            <Button onClick={downloadBackup} disabled={backingUp} className="bg-primary">
              <Download className="h-4 w-4 ml-2" />
              {backingUp ? 'در حال آماده‌سازی...' : 'دانلود نسخه پشتیبان کامل'}
            </Button>
          </div>

          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
            <div className="font-medium text-sm flex items-center gap-2 text-destructive">
              <TriangleAlert className="h-4 w-4" />
              بازیابی نسخه پشتیبان
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              فایل پشتیبان را انتخاب کنید و روی بازیابی بزنید. <b className="text-destructive">تمام داده‌های
              فعلی پنل با محتوای فایل جایگزین می‌شود.</b> حساب ادمینی که با آن وارد شده‌اید همیشه حفظ
              می‌شود و بیرون نمی‌مانید.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={e => setRestoreFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-muted-foreground
                file:ml-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2
                file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-accent"
              dir="ltr"
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!restoreFile || restoring}>
                  <Upload className="h-4 w-4 ml-2" />
                  {restoring ? 'در حال بازیابی...' : 'بازیابی از فایل'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>بازیابی قطعی است</AlertDialogTitle>
                  <AlertDialogDescription>
                    تمام داده‌های فعلی (کاربران، مخاطبین، کانفیگ‌ها، لاگ‌ها و تنظیمات) حذف و با محتوای
                    فایل پشتیبان جایگزین می‌شود. این عمل قابل بازگشت نیست. ادامه می‌دهید؟
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>انصراف</AlertDialogCancel>
                  <AlertDialogAction onClick={doRestore} className="bg-destructive text-white hover:bg-destructive/90">
                    بله، بازیابی کن
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Server className="h-4 w-4 text-primary" />
            تنظیمات سرور و اتصال
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>آدرس پایه پنل (URL)</Label>
            <Input
              value={settings.PANEL_BASE_URL ?? ''}
              onChange={e => set('PANEL_BASE_URL', e.target.value)}
              placeholder="https://azadgram-panel.up.railway.app"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">کلاینت آزادگرام از این آدرس برای دریافت کانفیگ استفاده می‌کند</p>
          </div>

          <div className="space-y-1.5">
            <Label>حداکثر کاربران رایگان</Label>
            <Input
              type="number"
              value={settings.FREE_USER_LIMIT ?? '1000'}
              onChange={e => set('FREE_USER_LIMIT', e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <Label>محدودیت ترافیک رایگان (MB)</Label>
            <Input
              type="number"
              value={settings.FREE_TRAFFIC_LIMIT_MB ?? '10240'}
              onChange={e => set('FREE_TRAFFIC_LIMIT_MB', e.target.value)}
              dir="ltr"
            />
          </div>

          <div className="space-y-1.5">
            <Label>دامنه‌های مجاز برای دانلود APK (کاما‌جدا)</Label>
            <Input
              value={settings.ALLOWED_RELEASE_DOMAINS ?? 'github.com,githubusercontent.com'}
              onChange={e => set('ALLOWED_RELEASE_DOMAINS', e.target.value)}
              placeholder="github.com,backblaze.com"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">تنها این دامنه‌ها برای downloadUrl نسخه‌های اپ پذیرفته می‌شوند</p>
          </div>

          <div className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="verif"
                className="h-4 w-4 accent-teal-600"
                checked={settings.BOT_VERIFICATION_ENABLED !== 'false'}
                onChange={e => set('BOT_VERIFICATION_ENABLED', e.target.checked ? 'true' : 'false')}
              />
              <Label htmlFor="verif">تأیید شماره با کد تلگرام (OTP)</Label>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              روشن = ورود کاربران فقط با کد ۶ رقمی که ربات به تلگرامشان می‌فرستد (توکن ربات لازم است).
              خاموش = ورود مستقیم بدون کد. اگر روشن باشد ولی توکن ربات تنظیم نشده باشد،
              پنل به‌صورت خودکار ورود را آزاد می‌گذارد تا هیچ کاربری گیر نکند.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Support channel — the app auto-joins users to this channel */}
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Megaphone className="h-4 w-4 text-primary" />
            کانال پشتیبانی برنامه (عضویت خودکار کاربران)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>لینک یا یوزرنیم کانال پشتیبانی</Label>
            <Input
              value={settings.SUPPORT_CHANNEL ?? ''}
              onChange={e => set('SUPPORT_CHANNEL', e.target.value)}
              placeholder="مثال: @azadgram_support یا https://t.me/azadgram_support یا لینک دعوت خصوصی"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              وقتی کاربری برای اولین بار وارد آزادگرام شود، به‌صورت خودکار عضو این کانال می‌شود و
              اعلان‌ها و آپدیت‌های برنامه را دریافت می‌کند. فرمت‌های قابل قبول:
              <span dir="ltr" className="font-mono"> @username</span>،
              <span dir="ltr" className="font-mono"> https://t.me/username</span>،
              <span dir="ltr" className="font-mono"> https://t.me/+hash</span> یا
              <span dir="ltr" className="font-mono"> https://t.me/joinchat/hash</span>.
              اگر این فیلد را خالی بگذارید، عضویت خودکار غیرفعال است. (اگر کانال خصوصی است، حتماً باید
              ربات یا اکانت سازنده کانال اجازه افزودن کاربران را داشته باشد — برای کانال‌های عمومی نیازی
              به هیچ اقدامی نیست.)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Globe className="h-4 w-4 text-primary" />
            تنظیمات ربات تلگرام
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Bot Token تلگرام</Label>
            <Input
              value={settings.TELEGRAM_BOT_TOKEN ?? ''}
              onChange={e => set('TELEGRAM_BOT_TOKEN', e.target.value)}
              placeholder="123456:ABC..."
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">برای ارسال کد تأیید به کاربران</p>
          </div>
          <div className="space-y-1.5">
            <Label>یوزرنیم ربات</Label>
            <Input
              value={settings.TELEGRAM_BOT_USERNAME ?? ''}
              onChange={e => set('TELEGRAM_BOT_USERNAME', e.target.value)}
              placeholder="AzadGramBot"
              dir="ltr"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">پیام‌ها و متون</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>پیام خوش‌آمدگویی کلاینت</Label>
            <Textarea
              value={settings.WELCOME_MESSAGE ?? ''}
              onChange={e => set('WELCOME_MESSAGE', e.target.value)}
              rows={3}
              placeholder="به آزادگرام خوش آمدید! برای استفاده از خدمات..."
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="bg-primary">
          <Save className="h-4 w-4 ml-2" />
          {saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}
        </Button>
      </div>
    </div>
  )
}
