import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { FileText, Users, CheckCircle, AlertCircle, Plus } from 'lucide-react'
import DashboardOrdenes from './DashboardOrdenes'

export default async function PaginaDashboard({
  searchParams,
}: {
  searchParams: { estado?: string }
}) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const { data: usuario } = await supabase
    .from('oya_usuarios').select('id, nombre').eq('auth_id', session!.user.id).single()

  const uid = usuario?.id

  const [{ count: totalOrdenes }, { count: ordenesHoy }, { count: totalClientes }, { count: enRevision }] =
    await Promise.all([
      supabase.from('oya_ordenes').select('*', { count: 'exact', head: true }).eq('asesor_id', uid),
      supabase.from('oya_ordenes').select('*', { count: 'exact', head: true }).eq('asesor_id', uid).gte('created_at', new Date().toISOString().split('T')[0]),
      supabase.from('oya_clientes').select('*', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('oya_ordenes').select('*', { count: 'exact', head: true }).eq('asesor_id', uid).in('estado', ['revisando', 'borrador']),
    ])

  const filtroEstado = searchParams.estado || 'activas'

  let ordenesQuery = supabase
    .from('oya_ordenes')
    .select('id, numero_oc, estado, total_lineas, lineas_conflicto, lineas_resueltas, created_at, oya_clientes(nombre)')
    .eq('asesor_id', uid)
    .order('created_at', { ascending: false })
    .limit(20)

  if (filtroEstado === 'activas') {
    ordenesQuery = ordenesQuery.in('estado', ['borrador', 'revisando'])
  } else if (filtroEstado === 'procesadas') {
    ordenesQuery = ordenesQuery.in('estado', ['confirmado', 'exportado'])
  }

  const { data: ordenes } = await ordenesQuery

  const stats = [
    { label: 'Órdenes totales', value: totalOrdenes || 0,  icon: FileText,    color: 'var(--accent)' },
    { label: 'Hoy',            value: ordenesHoy || 0,    icon: CheckCircle, color: 'var(--success)' },
    { label: 'Clientes',       value: totalClientes || 0, icon: Users,       color: '#a78bfa' },
    { label: 'En revisión',    value: enRevision || 0,    icon: AlertCircle, color: 'var(--warning)' },
  ]

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px' }}>
            Buenos días, {usuario?.nombre?.split(' ')[0]} 👋
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link href="/ordenes/nueva" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'var(--accent)', color: 'white', borderRadius: '8px', fontSize: '14px', fontWeight: '600', textDecoration: 'none' }}>
          <Plus size={16} /> Nueva orden
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '28px' }}>
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ width: '34px', height: '34px', background: `${color}20`, borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={17} color={color} />
            </div>
            <div>
              <p style={{ fontSize: '24px', fontWeight: '700', marginBottom: '2px' }}>{value}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Órdenes con filtro y acciones */}
      <DashboardOrdenes ordenes={(ordenes || []) as any} filtroActivo={filtroEstado} />
    </div>
  )
}
