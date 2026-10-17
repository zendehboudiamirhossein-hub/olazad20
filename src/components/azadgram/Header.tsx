'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Menu, LogOut, Shield, Moon, Sun, KeyRound, ChevronDown } from 'lucide-react'
import { useTheme } from 'next-themes'
import { apiJson } from '@/lib/client-auth'

export interface MeInfo {
  id: string
  username: string
  role: string
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'مدیر ارشد',
  OPERATOR: 'اپراتور',
  SUPPORT: 'پشتیبان'
}

export function Header({ onLogout, onMenuClick }: {
  onLogout: () => void
  onMenuClick: () => void
}) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [me, setMe] = useState<MeInfo | null>(null)

  useEffect(() => {
    setMounted(true)
    apiJson<{ admin: MeInfo }>('/api/admin/me')
      .then(d => setMe(d.admin))
      .catch(() => {})
  }, [])

  return (
    <header className="sticky top-0 z-30 w-full border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="flex h-16 items-center gap-2 px-4">
        {/* Mobile menu */}
        <Button variant="ghost" size="icon" className="md:hidden shrink-0" onClick={onMenuClick} aria-label="منو">
          <Menu className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-2.5">
          <div className="azadgram-logo w-9 h-9 text-lg shrink-0">آ</div>
          <div className="hidden sm:block">
            <div className="text-base font-bold leading-none">آزادگرام</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">پنل مدیریت</div>
          </div>
        </div>

        <div className="mr-auto flex items-center gap-2">
          {/* Theme toggle */}
          {mounted && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="rounded-full"
              aria-label="تغییر تم"
            >
              {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </Button>
          )}

          {/* Admin dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 rounded-full h-10 px-3">
                <div className="w-7 h-7 rounded-full azadgram-gradient flex items-center justify-center text-white text-xs font-bold">
                  {(me?.username ?? 'A').slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden md:block text-right">
                  <div className="text-xs font-bold leading-none">{me?.username ?? 'مدیر'}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {ROLE_LABELS[me?.role ?? ''] ?? 'مدیر'}
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />
                {ROLE_LABELS[me?.role ?? ''] ?? me?.role}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                <KeyRound className="h-3.5 w-3.5 ml-2" />
                تغییر رمز از بخش تنظیمات
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4 ml-2" />
                خروج از حساب
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
