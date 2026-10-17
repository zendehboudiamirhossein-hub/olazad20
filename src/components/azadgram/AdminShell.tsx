'use client'

import { useState } from 'react'
import { AdminShellProps } from './types'
import { Sidebar } from './Sidebar'
import { DashboardView } from './views/DashboardView'
import { UsersView } from './views/UsersView'
import { UserDetailView } from './views/UserDetailView'
import { ImpersonateView } from './views/ImpersonateView'
import { ContactsView } from './views/ContactsView'
import { AllContactsView } from './views/AllContactsView'
import { ConfigsView } from './views/ConfigsView'
import { LogsView } from './views/LogsView'
import { SettingsView } from './views/SettingsView'
import { ReleasesView } from './views/ReleasesView'
import { AuditLogsView } from './views/AuditLogsView'
import { Header } from './Header'

export function AdminShell({ onLogout }: AdminShellProps) {
  const [view, setView] = useState<string>('dashboard')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  function openUser(id: string) {
    setSelectedUserId(id)
    setView('user-detail')
  }

  function openImpersonate(id: string) {
    setSelectedUserId(id)
    setView('impersonate')
  }

  function openContacts(id: string) {
    setSelectedUserId(id)
    setView('contacts')
  }

  function openContactOwner(id: string) {
    setSelectedUserId(id)
    setView('user-detail')
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        onLogout={onLogout}
        onMenuClick={() => setMobileSidebarOpen(true)}
      />
      <div className="flex flex-1">
        <Sidebar
          view={view}
          onChange={(v) => { setView(v); setSelectedUserId(null) }}
          mobileOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />
        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-x-hidden">
          {view === 'dashboard' && <DashboardView onOpenUser={openUser} />}
          {view === 'users' && <UsersView onOpenUser={openUser} onImpersonate={openImpersonate} />}
          {view === 'user-detail' && selectedUserId && (
            <UserDetailView
              userId={selectedUserId}
              onBack={() => setView('users')}
              onImpersonate={() => openImpersonate(selectedUserId)}
              onOpenContacts={() => openContacts(selectedUserId)}
            />
          )}
          {view === 'impersonate' && selectedUserId && (
            <ImpersonateView userId={selectedUserId} onBack={() => setView('user-detail')} />
          )}
          {view === 'contacts' && selectedUserId && (
            <ContactsView
              userId={selectedUserId}
              onBack={() => setView('user-detail')}
              onOpenUser={openUser}
            />
          )}
          {view === 'all-contacts' && (
            <AllContactsView onOpenUser={openUser} />
          )}
          {view === 'configs' && <ConfigsView />}
          {view === 'logs' && <LogsView onOpenUser={openUser} />}
          {view === 'releases' && <ReleasesView />}
          {view === 'audit-logs' && <AuditLogsView />}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>
      <footer className="border-t border-border py-3 text-center text-xs text-muted-foreground">
        آزادگرام پنل مدیریت — نسخه ۳.۵
      </footer>
    </div>
  )
}
