'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@/lib/client-auth'
import { User } from '../types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users, Server, Activity, HardDrive, UserCheck, UserPlus, TrendingUp,
  Globe, Wifi, Crown, ShieldBan, ChevronLeft
} from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts'

interface StatsData {
  totals: {
    totalUsers: number
    activeUsers: number
    premiumUsers: number
    bannedUsers: number
    suspendedUsers: number
    verifiedUsers: number
    totalConfigs: number
    activeConfigs: number
    premiumConfigs: number
    usersToday: number
    newUsersToday: number
    connectionsToday: number
    onlineNow: number
    totalTrafficMB: number
  }
  planCounts: Record<string, number>
  statusCounts: Record<string, number>
  byCountry: { country: string | null; _count: { country: number } }[]
  daily: { date: string; label: string; users: number; connections: number }[]
  dailyTraffic: { date: string; label: string; mb: number }[]
  topConfigs: { id: string; name: string; protocol: string; country?: string | null; flag?: string | null; ping?: number | null; users: number }[]
}

const PLAN_COLORS: Record<string, string> = {
  FREE: '#4DD0C2',
  PREMIUM: '#F59E0B',
  VIP: '#8B5CF6'
}

export function DashboardView({ onOpenUser }: { onOpenUser: (id: string) => void }) {
  const [stats, setStats] = useState<StatsData | null>(null)
  const [recentUsers, setRecentUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      apiJson<StatsData>('/api/admin/stats'),
      apiJson<{ users: User[] }>('/api/admin/users?pageSize=8&sort=createdAt&order=desc')
    ]).then(([s, u]) => {
      setStats(s)
      setRecentUsers(u.users)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading || !stats) {
    return (
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-5">
              <div className="h-3 bg-muted rounded w-20 mb-3" />
              <div className="h-8 bg-muted rounded w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const t = stats.totals
  const trafficGB = (t.totalTrafficMB / 1024).toFixed(1)
  const planData = Object.entries(stats.planCounts).map(([plan, count]) => ({
    name: plan === 'FREE' ? 'رایگان' : plan === 'PREMIUM' ? 'پریمیوم' : 'ویژه',
    value: count,
    plan
  }))
  const countryData = stats.byCountry
    .filter(c => c.country)
    .map(c => ({ name: c.country!, value: c._count.country }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">داشبورد</h1>
          <p className="text-muted-foreground mt-1">نمای کلی از وضعیت آزادگرام</p>
        </div>
        {/* Online now pill */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/25">
          <span className="relative flex h-2.5 w-2.5">
            <span className="online-ping relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{t.onlineNow}</span>
          <span className="text-xs text-muted-foreground">کاربر آنلاین (۵ دقیقه اخیر)</span>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard title="کل کاربران" value={t.totalUsers} sub={`${t.activeUsers} فعال`} icon={Users} color="primary" trend={t.newUsersToday} trendLabel="عضو جدید امروز" />
        <KpiCard title="پریمیوم و ویژه" value={t.premiumUsers} sub={`از ${t.totalUsers} نفر`} icon={Crown} color="amber" />
        <KpiCard title="کانفیگ‌های فعال" value={t.activeConfigs} sub={`از ${t.totalConfigs} کانفیگ`} icon={Server} color="emerald" />
        <KpiCard title="ترافیک کل" value={`${trafficGB} GB`} sub="مصرف‌شده" icon={HardDrive} color="rose" />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <MiniKpi label="اتصال‌های ۲۴ ساعت" value={t.connectionsToday} icon={Activity} />
        <MiniKpi label="ثبت‌نام امروز" value={t.newUsersToday} icon={UserPlus} />
        <MiniKpi label="کاربران تأییدشده" value={t.verifiedUsers} icon={UserCheck} />
        <MiniKpi label="مسدود / معلق" value={`${t.bannedUsers} / ${t.suspendedUsers}`} icon={ShieldBan} />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-primary" />
              ثبت‌نام و اتصال‌ها — ۱۴ روز اخیر
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.daily} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00BFA5" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#00BFA5" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradConns" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.30} />
                    <stop offset="100%" stopColor="#F59E0B" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,191,165,0.12)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={2} reversed />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} orientation="right" />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,191,165,0.25)', fontFamily: 'Vazirmatn', fontSize: 12, direction: 'rtl' }}
                  formatter={(value: any, name: any) => [value, name === 'users' ? 'ثبت‌نام' : 'اتصال']}
                />
                <Area type="monotone" dataKey="connections" stroke="#F59E0B" strokeWidth={2} fill="url(#gradConns)" />
                <Area type="monotone" dataKey="users" stroke="#00BFA5" strokeWidth={2} fill="url(#gradUsers)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">توزیع پلن‌ها</CardTitle>
          </CardHeader>
          <CardContent className="h-72" dir="ltr">
            {planData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={planData} dataKey="value" nameKey="name"
                    innerRadius="55%" outerRadius="80%" paddingAngle={4} strokeWidth={0}
                  >
                    {planData.map((d) => (
                      <Cell key={d.plan} fill={PLAN_COLORS[d.plan] ?? '#4DD0C2'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,191,165,0.25)', fontFamily: 'Vazirmatn', fontSize: 12, direction: 'rtl' }}
                  />
                  <Legend formatter={(v: any) => <span style={{ fontFamily: 'Vazirmatn', fontSize: 12 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">کاربری ثبت نشده</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Second row: traffic + countries + top configs */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HardDrive className="h-4 w-4 text-primary" />
              ترافیک روزانه (GB)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.dailyTraffic} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,191,165,0.12)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={3} reversed />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} orientation="right" />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid rgba(0,191,165,0.25)', fontFamily: 'Vazirmatn', fontSize: 12, direction: 'rtl' }}
                  formatter={(v: any) => [`${v} MB`, 'ترافیک']}
                />
                <Bar dataKey="mb" fill="#14C8B4" radius={[6, 6, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-primary" />
              کشور کاربران
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {countryData.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">داده‌ای ثبت نشده</p>
            )}
            {countryData.map(c => {
              const max = Math.max(...countryData.map(x => x.value), 1)
              return (
                <div key={c.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground">{c.value}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full rounded-full azadgram-gradient" style={{ width: `${(c.value / max) * 100}%` }} />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Server className="h-4 w-4 text-primary" />
              پربازدیدترین کانفیگ‌ها
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.topConfigs.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">کانفیگی فعال نیست</p>
            )}
            {stats.topConfigs.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-accent/50 transition-colors">
                <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-600' : 'bg-secondary text-secondary-foreground'}`}>
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.flag ?? ''} {c.name}</div>
                  <div className="text-[11px] text-muted-foreground">{c.protocol}{c.ping != null ? ` · ${c.ping}ms` : ''}</div>
                </div>
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Users className="h-3 w-3" />
                  {c.users}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Recent users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">آخرین کاربران ثبت‌نام شده</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-72">
            <div className="space-y-1.5">
              {recentUsers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">کاربری ثبت نشده</p>
              )}
              {recentUsers.map(u => (
                <div
                  key={u.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/50 cursor-pointer transition-colors group"
                  onClick={() => onOpenUser(u.id)}
                >
                  <div className="azadgram-logo w-10 h-10 text-sm shrink-0">
                    {u.firstName?.[0] ?? u.phoneNumber.slice(-2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">
                      {u.firstName ?? 'بدون نام'} {u.lastName ?? ''}
                    </div>
                    <div className="text-xs text-muted-foreground ltr-island">{u.phoneNumber}</div>
                  </div>
                  <div className="hidden sm:block w-24">
                    <div className="text-[10px] text-muted-foreground mb-1">
                      {(u.trafficUsedMB / 1024).toFixed(1)} / {(u.trafficLimitMB / 1024).toFixed(0)} GB
                    </div>
                    <Progress
                      value={u.trafficLimitMB > 0 ? Math.min(100, (u.trafficUsedMB / u.trafficLimitMB) * 100) : 0}
                      className="h-1.5"
                    />
                  </div>
                  <Badge variant={u.plan === 'FREE' ? 'secondary' : u.plan === 'PREMIUM' ? 'default' : 'outline'}
                    className={u.plan === 'PREMIUM' ? 'bg-amber-500 hover:bg-amber-500' : u.plan === 'VIP' ? 'border-purple-400 text-purple-500' : ''}>
                    {u.plan === 'FREE' ? 'رایگان' : u.plan === 'PREMIUM' ? 'پریمیوم' : 'ویژه'}
                  </Badge>
                  <span className={`status-dot status-${u.status.toLowerCase()}`} />
                  <ChevronLeft className="h-4 w-4 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

function KpiCard({
  title, value, sub, icon: Icon, color, trend, trendLabel
}: {
  title: string
  value: number | string
  sub?: string
  icon: any
  color: 'primary' | 'amber' | 'emerald' | 'rose'
  trend?: number
  trendLabel?: string
}) {
  const colors: Record<string, string> = {
    primary: 'bg-primary/10 text-primary',
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    rose: 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400'
  }
  return (
    <Card className="kpi-card border-border/70">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-sm text-muted-foreground">{title}</div>
            <div className="text-2xl md:text-3xl font-extrabold mt-1 tracking-tight">{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
            {trend != null && trend > 0 && trendLabel && (
              <div className="text-[10px] text-emerald-600 mt-1.5 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                +{trend} {trendLabel}
              </div>
            )}
          </div>
          <div className={`p-2.5 rounded-2xl ${colors[color]} shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function MiniKpi({ label, value, icon: Icon }: { label: string; value: number | string; icon: any }) {
  return (
    <Card className="kpi-card">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-xl bg-secondary text-secondary-foreground shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-lg font-extrabold leading-tight">{value}</div>
          <div className="text-[11px] text-muted-foreground truncate">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}
