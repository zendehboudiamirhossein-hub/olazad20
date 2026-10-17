'use client'

import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, Server, ScrollText, Settings, Package,
  ShieldCheck, UserCog, X, Radio, BookUser
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface NavItem {
  id: string
  label: string
  icon: any
  group: 'main' | 'monitor' | 'system'
  badge?: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'داشبورد', icon: LayoutDashboard, group: 'main' },
  { id: 'users', label: 'کاربران', icon: Users, group: 'main' },
  { id: 'configs', label: 'کانفیگ‌ها', icon: Server, group: 'main' },
  { id: 'all-contacts', label: 'مخاطبین همه کاربران', icon: BookUser, group: 'monitor' },
  { id: 'logs', label: 'اتصال‌ها', icon: Radio, group: 'monitor' },
  { id: 'audit-logs', label: 'لاگ ممیزی', icon: ShieldCheck, group: 'monitor' },
  { id: 'releases', label: 'نسخه‌های اپ', icon: Package, group: 'system' },
  { id: 'settings', label: 'تنظیمات', icon: Settings, group: 'system' },
]

const GROUP_LABELS: Record<string, string> = {
  main: 'مدیریت',
  monitor: 'پایش',
  system: 'سیستم'
}

export function Sidebar({
  view, onChange, mobileOpen, onClose
}: {
  view: string
  onChange: (v: string) => void
  mobileOpen: boolean
  onClose: () => void
}) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-l border-border bg-card/40 backdrop-blur-sm">
        <SidebarInner view={view} onChange={onChange} />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={onClose}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <aside className="absolute right-0 top-0 bottom-0 w-72 bg-card border-l border-border shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 pt-4">
              <div className="flex items-center gap-2">
                <div className="azadgram-logo w-8 h-8 text-base">آ</div>
                <span className="font-bold">آزادگرام</span>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="بستن">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarInner view={view} onChange={(v) => { onChange(v); onClose() }} />
          </aside>
        </div>
      )}
    </>
  )
}

function SidebarInner({ view, onChange }: { view: string; onChange: (v: string) => void }) {
  const groups: ('main' | 'monitor' | 'system')[] = ['main', 'monitor', 'system']

  return (
    <div className="flex flex-col p-3 flex-1 overflow-y-auto">
      {groups.map(group => {
        const items = NAV_ITEMS.filter(i => i.group === group)
        if (items.length === 0) return null
        return (
          <div key={group} className="mb-3">
            <div className="px-3 pt-2 pb-1.5 text-[10px] font-bold text-muted-foreground/70 tracking-wider uppercase">
              {GROUP_LABELS[group]}
            </div>
            <div className="space-y-0.5">
              {items.map(item => {
                const Icon = item.icon
                const active = view === item.id ||
                  (item.id === 'users' && view === 'user-detail') ||
                  (item.id === 'users' && view === 'impersonate')
                return (
                  <button
                    key={item.id}
                    onClick={() => onChange(item.id)}
                    className={cn(
                      'w-full flex items-center gap-3 h-10 px-3 rounded-xl text-sm transition-all',
                      active
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25 font-bold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-right">{item.label}</span>
                    {item.badge && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{item.badge}</Badge>
                    )}
                    {active && <span className="w-1.5 h-1.5 rounded-full bg-white/90" />}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="mt-auto px-3 py-3 text-center">
        <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
          <UserCog className="h-3 w-3" />
          آزادگرام پنل — نسخه ۳.۵
        </div>
      </div>
    </div>
  )
}
