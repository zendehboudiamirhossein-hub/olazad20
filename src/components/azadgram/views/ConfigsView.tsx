'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@/lib/client-auth'
import { Config } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Server, Plus, Edit, Trash2, Copy, Check, Power, Activity, QrCode as QrIcon, Eye, Wand2, Link2 } from 'lucide-react'
import { parseShareUri, describeParseError } from '@/lib/parse-share-uri'
import { QrCode } from '@/components/azadgram/QrCode'
import { toast } from 'sonner'

const PROTOCOLS = ['VLESS', 'VMESS', 'SHADOWSOCKS', 'TROJAN', 'MTPROTO', 'SOCKS5', 'WIREGUARD']

const PROTOCOL_COLORS: Record<string, string> = {
  VLESS: 'bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300',
  VMESS: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  SHADOWSOCKS: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300',
  TROJAN: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  MTPROTO: 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300',
  SOCKS5: 'bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-300',
  WIREGUARD: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
}

export function ConfigsView() {
  const [configs, setConfigs] = useState<Config[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [editing, setEditing] = useState<Config | null>(null)
  const [qrConfig, setQrConfig] = useState<Config | null>(null)

  async function load() {
    setLoading(true)
    try {
      const data = await apiJson<{ configs: Config[] }>('/api/admin/configs')
      setConfigs(data.configs)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function toggleActive(c: Config) {
    try {
      await apiJson(`/api/admin/configs/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !c.isActive })
      })
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function del(id: string) {
    if (!confirm('حذف شود؟')) return
    try {
      await apiJson(`/api/admin/configs/${id}`, { method: 'DELETE' })
      toast.success('حذف شد')
      load()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">کانفیگ‌ها</h1>
          <p className="text-muted-foreground mt-1">مدیریت کانفیگ‌های VPN/پروکسی ({configs.length})</p>
        </div>
        <Dialog open={showEdit} onOpenChange={setShowEdit}>
          <DialogTrigger asChild>
            <Button className="bg-primary" onClick={() => setEditing(null)}>
              <Plus className="h-4 w-4 ml-2" />
              افزودن کانفیگ
            </Button>
          </DialogTrigger>
          <ConfigEditDialog config={editing} onSaved={() => { setShowEdit(false); load() }} />
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">نام</TableHead>
                  <TableHead className="text-right">پروتکل</TableHead>
                  <TableHead className="text-right">سرور</TableHead>
                  <TableHead className="text-right hidden md:table-cell">پینگ</TableHead>
                  <TableHead className="text-right hidden lg:table-cell">کاربران</TableHead>
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
                ) : configs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      کانفیگی ثبت نشده — اولین کانفیگ را اضافه کنید
                    </TableCell>
                  </TableRow>
                ) : configs.map(c => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{c.name}</div>
                      {c.country && (
                        <div className="text-xs text-muted-foreground">{c.country}{c.city ? ` · ${c.city}` : ''}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${PROTOCOL_COLORS[c.protocol] ?? 'bg-secondary text-secondary-foreground'}`}>
                        {c.protocol}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {c.server}:{c.port}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {c.ping ? `${c.ping}ms` : '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">
                      {c.currentUsers}{c.maxUsers > 0 ? ` / ${c.maxUsers}` : ' ∞'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={c.isActive}
                        onCheckedChange={() => toggleActive(c)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" title="QR و لینک اشتراک" onClick={() => setQrConfig(c)} disabled={!c.shareUri}>
                          <QrIcon className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setShowEdit(true) }}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => del(c.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Config details */}
      {configs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">لینک‌های اشتراک</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {configs.filter(c => c.shareUri).map(c => (
                <ConfigShareRow key={c.id} config={c} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* QR dialog */}
      <Dialog open={!!qrConfig} onOpenChange={(v) => !v && setQrConfig(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <QrIcon className="h-5 w-5 text-primary" />
              {qrConfig?.name}
            </DialogTitle>
          </DialogHeader>
          {qrConfig?.shareUri && (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="bg-white p-4 rounded-2xl shadow-lg">
                <QrCode value={qrConfig.shareUri} size={220} />
              </div>
              <p className="text-xs text-muted-foreground text-center">
                در اپلیکیشن آزادگرام اسکن کنید یا لینک را کپی کنید
              </p>
              <code className="w-full text-[10px] text-muted-foreground bg-secondary/50 rounded-lg p-2.5 break-all text-center ltr-island" dir="ltr">
                {qrConfig.shareUri}
              </code>
              <CopyButton uri={qrConfig.shareUri} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CopyButton({ uri }: { uri: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="outline"
      className="gap-1.5"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(uri)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {}
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'کپی شد' : 'کپی لینک'}
    </Button>
  )
}

function ConfigShareRow({ config }: { config: Config }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(config.shareUri!)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('کپی ناموفق')
    }
  }
  return (
    <div className="flex items-center gap-2 p-2 rounded-lg bg-secondary/30">
      <code className="flex-1 font-mono text-xs truncate" dir="ltr">
        {config.shareUri}
      </code>
      <Button size="icon" variant="ghost" onClick={copy}>
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  )
}

function ConfigEditDialog({ config, onSaved }: { config: Config | null; onSaved: () => void }) {
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [pasteUri, setPasteUri] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [pasteSuccess, setPasteSuccess] = useState(false)

  useEffect(() => {
    if (config) {
      setForm({ ...config })
    } else {
      setForm({
        name: '', protocol: 'VLESS', server: '', port: 443,
        uuid: '', encryption: 'none', network: 'tcp', security: 'tls',
        sni: '', fingerprint: 'chrome', flow: '',
        password: '', cipher: 'aes-256-gcm', plugin: '', pluginOpts: '',
        // WebSocket / gRPC transport fields
        wsPath: '', wsHost: '', grpcServiceName: '', alpn: '',
        allowInsecure: false,
        // v3.7: REALITY fields
        realityPublicKey: '', realityShortId: '',
        isActive: true, isPremium: false,
        country: 'آلمان', city: '', flag: 'DE',
        ping: 0, loadPercent: 0, maxUsers: -1, notes: ''
      })
    }
    setPasteUri('')
    setPasteError('')
    setPasteSuccess(false)
  }, [config])

  function set(k: string, v: any) {
    setForm((prev: any) => ({ ...prev, [k]: v }))
  }

  /** Parse the pasted shareUri and fill the form. */
  function parseFromUri() {
    setPasteError('')
    setPasteSuccess(false)
    const uri = pasteUri.trim()
    if (!uri) {
      setPasteError('لینک را وارد کنید')
      return
    }
    const parsed = parseShareUri(uri)
    if (!parsed) {
      setPasteError(describeParseError(uri) || 'لینک نامعتبر است')
      return
    }
    // Merge parsed fields into form — preserve user-edited fields only if parsed is empty
    setForm((prev: any) => ({
      ...prev,
      name: parsed.name || prev.name,
      protocol: parsed.protocol,
      server: parsed.server,
      port: parsed.port,
      uuid: parsed.uuid ?? prev.uuid,
      encryption: parsed.encryption ?? prev.encryption,
      network: parsed.network ?? prev.network,
      security: parsed.security ?? prev.security,
      sni: parsed.sni ?? prev.sni,
      fingerprint: parsed.fingerprint ?? prev.fingerprint,
      flow: parsed.flow ?? prev.flow,
      password: parsed.password ?? prev.password,
      cipher: parsed.cipher ?? prev.cipher,
      plugin: parsed.plugin ?? prev.plugin,
      pluginOpts: parsed.pluginOpts ?? prev.pluginOpts,
      // WebSocket / gRPC transport fields
      wsPath: parsed.wsPath ?? prev.wsPath,
      wsHost: parsed.wsHost ?? prev.wsHost,
      grpcServiceName: parsed.grpcServiceName ?? prev.grpcServiceName,
      alpn: parsed.alpn ?? prev.alpn,
      allowInsecure: parsed.allowInsecure ?? prev.allowInsecure,
      // v3.7: REALITY fields
      realityPublicKey: parsed.realityPublicKey ?? prev.realityPublicKey,
      realityShortId: parsed.realityShortId ?? prev.realityShortId,
      country: parsed.country ?? prev.country,
      flag: parsed.flag ?? prev.flag,
      notes: parsed.notes ?? prev.notes,
    }))
    setPasteSuccess(true)
    toast.success(`کانفیگ ${parsed.protocol} از لینک پارس شد`)
  }

  /** Handle paste from clipboard — convenience button. */
  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setPasteUri(text)
        // Auto-parse after paste
        setTimeout(() => {
          // small delay so state updates first
          const event = { target: { value: text } } as any
          handlePasteChange(event)
        }, 50)
      }
    } catch {
      toast.error('دسترسی به کلیپ‌بورد ممکن نیست — لینک را دستی paste کنید')
    }
  }

  function handlePasteChange(e: any) {
    setPasteUri(e.target.value)
    setPasteError('')
    setPasteSuccess(false)
  }

  async function save() {
    if (!form.name || !form.server || !form.port) {
      toast.error('نام، سرور و پورت الزامی هستند')
      return
    }
    setSaving(true)
    try {
      if (config) {
        await apiJson(`/api/admin/configs/${config.id}`, {
          method: 'PATCH',
          body: JSON.stringify(form)
        })
      } else {
        await apiJson('/api/admin/configs', {
          method: 'POST',
          body: JSON.stringify(form)
        })
      }
      toast.success('ذخیره شد')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{config ? 'ویرایش کانفیگ' : 'افزودن کانفیگ جدید'}</DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {/* ============ Paste Link section — auto-fill from shareUri ============ */}
        {!config && (
          <div className="rounded-lg border-2 border-dashed border-primary/30 bg-secondary/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Link2 className="h-4 w-4 text-primary" />
              <Label className="text-sm font-semibold">
               Paste link — پر کردن خودکار
              </Label>
            </div>
            <p className="text-xs text-muted-foreground mb-2">
              لینک کامل کانفیگ (vless://, vmess://, ss://, trojan://, tg://proxy) را اینجا paste کنید تا همه‌ی فیلدها خودکار پر شوند.
            </p>
            <div className="flex gap-2">
              <Textarea
                value={pasteUri}
                onChange={handlePasteChange}
                placeholder="vless://abc-123@1.2.3.4:443?type=tcp&security=reality&sni=..."
                className="font-mono text-xs"
                dir="ltr"
                rows={2}
              />
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  size="sm"
                  onClick={parseFromUri}
                  disabled={!pasteUri.trim()}
                  className="bg-primary hover:bg-primary/90"
                >
                  <Wand2 className="h-3.5 w-3.5 ml-1" />
                  پارس
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={pasteFromClipboard}
                >
                  از کلیپ‌بورد
                </Button>
              </div>
            </div>
            {pasteError && (
              <p className="text-xs text-rose-600 mt-2">⚠ {pasteError}</p>
            )}
            {pasteSuccess && (
              <p className="text-xs text-emerald-600 mt-2">✓ لینک با موفقیت پارس شد — فیلدها پر شدند</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>نام کانفیگ *</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="آلمان ۱ - Hetzner" />
          </div>
          <div className="space-y-1.5">
            <Label>پروتکل</Label>
            <Select value={form.protocol} onValueChange={v => set('protocol', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROTOCOLS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>سرور (host:port) *</Label>
            <Input value={form.server} onChange={e => set('server', e.target.value)} placeholder="1.2.3.4" dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label>پورت *</Label>
            <Input type="number" value={form.port} onChange={e => set('port', e.target.value)} placeholder="443" dir="ltr" />
          </div>
        </div>

        {(form.protocol === 'VLESS' || form.protocol === 'VMESS') && (
          <>
            <div className="space-y-1.5">
              <Label>UUID</Label>
              <Input value={form.uuid} onChange={e => set('uuid', e.target.value)} placeholder="xxxxxxxx-xxxx-..." dir="ltr" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>شبکه</Label>
                <Select value={form.network} onValueChange={v => set('network', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tcp">TCP</SelectItem>
                    <SelectItem value="ws">WebSocket</SelectItem>
                    <SelectItem value="grpc">gRPC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>امنیت</Label>
                <Select value={form.security} onValueChange={v => set('security', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tls">TLS</SelectItem>
                    <SelectItem value="reality">Reality</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>SNI</Label>
                <Input value={form.sni} onChange={e => set('sni', e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>Fingerprint</Label>
                <Select value={form.fingerprint} onValueChange={v => set('fingerprint', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chrome">Chrome</SelectItem>
                    <SelectItem value="firefox">Firefox</SelectItem>
                    <SelectItem value="safari">Safari</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.protocol === 'VLESS' && (
              <div className="space-y-1.5">
                <Label>Flow (VLESS)</Label>
                <Input value={form.flow} onChange={e => set('flow', e.target.value)} placeholder="xtls-rprx-vision" dir="ltr" />
              </div>
            )}

            {/* ============ REALITY settings (VLESS security=reality) ============ */}
            {form.protocol === 'VLESS' && form.security === 'reality' && (
              <div className="rounded-lg border border-primary/20 bg-secondary/30 p-3 space-y-3">
                <div className="text-sm font-semibold text-primary">🔑 تنظیمات REALITY</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Public Key (pbk)</Label>
                    <Input
                      value={form.realityPublicKey ?? ''}
                      onChange={e => set('realityPublicKey', e.target.value)}
                      placeholder="کلید عمومی سرور"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Short ID (sid)</Label>
                    <Input
                      value={form.realityShortId ?? ''}
                      onChange={e => set('realityShortId', e.target.value)}
                      placeholder="مثلاً 6ba8912c"
                      dir="ltr"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  این مقادیر از لینک vless://?security=reality&pbk=...&sid=... به‌صورت خودکار پر می‌شوند و در shareUri دوباره تولید می‌شوند.
                </p>
              </div>
            )}
          </>
        )}

        {/* ============ WebSocket / gRPC transport settings ============ */}
        {(form.protocol === 'VLESS' || form.protocol === 'VMESS' || form.protocol === 'TROJAN') &&
         (form.network === 'ws' || form.network === 'grpc') && (
          <div className="rounded-lg border border-primary/20 bg-secondary/30 p-3 space-y-3">
            <div className="text-sm font-semibold text-primary">
              ⚙ تنظیمات {form.network === 'ws' ? 'WebSocket' : 'gRPC'}
            </div>
            {form.network === 'ws' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>WS Path</Label>
                  <Input
                    value={form.wsPath ?? ''}
                    onChange={e => set('wsPath', e.target.value)}
                    placeholder="/ws"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>WS Host header</Label>
                  <Input
                    value={form.wsHost ?? ''}
                    onChange={e => set('wsHost', e.target.value)}
                    placeholder="cdn.example.com (متفاوت از SNI)"
                    dir="ltr"
                  />
                </div>
              </div>
            )}
            {form.network === 'grpc' && (
              <div className="space-y-1.5">
                <Label>gRPC Service Name</Label>
                <Input
                  value={form.grpcServiceName ?? ''}
                  onChange={e => set('grpcServiceName', e.target.value)}
                  placeholder="gunservice"
                  dir="ltr"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>ALPN (TLS)</Label>
                <Input
                  value={form.alpn ?? ''}
                  onChange={e => set('alpn', e.target.value)}
                  placeholder="http/1.1 یا h2,http/1.1"
                  dir="ltr"
                />
              </div>
              <div className="space-y-1.5 flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.allowInsecure}
                    onChange={e => set('allowInsecure', e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm">allowInsecure (skip cert verify)</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {form.protocol === 'SHADOWSOCKS' && (
          <>
            <div className="space-y-1.5">
              <Label>رمز</Label>
              <Input value={form.password} onChange={e => set('password', e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label>Cipher</Label>
              <Select value={form.cipher} onValueChange={v => set('cipher', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aes-256-gcm">aes-256-gcm</SelectItem>
                  <SelectItem value="chacha20-ietf-poly1305">chacha20-ietf-poly1305</SelectItem>
                  <SelectItem value="aes-128-gcm">aes-128-gcm</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {(form.protocol === 'TROJAN' || form.protocol === 'MTPROTO') && (
          <div className="space-y-1.5">
            <Label>رمز / Secret</Label>
            <Input value={form.password} onChange={e => set('password', e.target.value)} dir="ltr" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>کشور</Label>
            <Input value={form.country} onChange={e => set('country', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>کد پرچم</Label>
            <Input value={form.flag} onChange={e => set('flag', e.target.value)} placeholder="DE" dir="ltr" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>حداکثر کاربران</Label>
            <Input type="number" value={form.maxUsers} onChange={e => set('maxUsers', parseInt(e.target.value) || -1)} dir="ltr" />
            <p className="text-xs text-muted-foreground">-1 برای نامحدود</p>
          </div>
          <div className="space-y-1.5">
            <Label>پینگ (ms)</Label>
            <Input type="number" value={form.ping} onChange={e => set('ping', parseInt(e.target.value) || 0)} dir="ltr" />
          </div>
        </div>

        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <Switch checked={!!form.isActive} onCheckedChange={v => set('isActive', v)} />
            <Label>فعال</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={!!form.isPremium} onCheckedChange={v => set('isPremium', v)} />
            <Label>پریمیوم</Label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>یادداشت</Label>
          <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
        </div>
      </div>

      <DialogFooter>
        <Button onClick={save} disabled={saving}>
          {saving ? 'در حال ذخیره...' : 'ذخیره'}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
