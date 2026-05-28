'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import { Zap, LayoutDashboard, FileText, Users, Package, LogOut } from 'lucide-react'

interface SidebarProps {
  usuario: { nombre: string; email: string }
}

const NAV = [
  { href: '/dashboard',       label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/ordenes/nueva',   label: 'Nueva Orden',  icon: FileText, highlight: true },
  { href: '/clientes',        label: 'Cadenas',     icon: Users },
  { href: '/skus',            label: 'Catálogo SKUs',icon: Package },
]

export default function Sidebar({ usuario }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createBrowserClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: '220px', background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '30px', height: '30px', background: 'var(--accent)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Zap size={16} color="white" />
        </div>
        <span style={{ fontSize: '16px', fontWeight: '700', letterSpacing: '-0.3px' }}>ordenesya</span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV.map(({ href, label, icon: Icon, highlight }) => {
          const active = pathname === href ||
            (href !== '/dashboard' && href !== '/ordenes/nueva' && pathname.startsWith(href))
          return (
            <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '7px', fontSize: '13.5px', fontWeight: active ? '600' : '400', color: active ? 'white' : highlight ? 'var(--accent)' : 'var(--text-secondary)', background: active ? 'var(--accent)' : highlight && !active ? 'rgba(14,165,233,0.08)' : 'transparent', textDecoration: 'none', transition: 'all 0.15s' }}>
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
        <div style={{ padding: '10px', borderRadius: '7px', background: 'var(--bg-tertiary)', marginBottom: '8px' }}>
          <p style={{ fontSize: '13px', fontWeight: '500', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{usuario.nombre}</p>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{usuario.email}</p>
        </div>
        <button onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '7px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = 'var(--danger)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}>
          <LogOut size={15} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
