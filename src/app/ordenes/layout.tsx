import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import Sidebar from '@/components/layout/Sidebar'

export default async function LayoutDashboard({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: usuario } = await supabase
    .from('oya_usuarios')
    .select('*')
    .eq('auth_id', session.user.id)
    .single()

  if (!usuario) {
    await supabase.from('oya_usuarios').insert({
      auth_id: session.user.id,
      nombre: session.user.user_metadata?.nombre || session.user.email?.split('@')[0] || 'Asesor',
      email: session.user.email!,
    })
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
      <Sidebar usuario={usuario || { nombre: session.user.email || '', email: session.user.email || '' }} />
      <main style={{ flex: 1, marginLeft: '220px', padding: '32px', overflow: 'auto', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
