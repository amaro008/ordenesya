import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { FileText, Users, CheckCircle, AlertCircle, Plus } from 'lucide-react'

export default async function PaginaDashboard() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()

  const { data: usuario } = await supabase
    .from('oya_usuarios').select('id, nombre').eq('auth_id', session!.user.id).single()

  const usuarioId = usuario?.id

  const [{ count: totalOrdenes }, { count: ordenesHoy }, { count: totalClientes }, { count: enRevision }] =
    await Promise.all([
      supabase.from('oya_ordenes').select('*', { count: 'exact', head: true }).eq('asesor_id', usuarioId),
      supabase.from('oya_ordenes').select('*', { count: 'exact', head: true }).eq('asesor_id', usuarioId).gte('created_at', new Date().toISOString().split('T')[0]),
      supabase.from('oya_clientes').select('*', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('oya_ordenes').select('*', { count: 'exact', head: true }).eq('asesor_id', usuarioId).eq('estado', 'revisando'),
    ])

  const { data: ordenesRecientes } = await supabase
    .from('oya_ordenes')
    .select('id, numero_oc, estado, total_lineas, lineas_conflicto, created_at, oya_clientes(nombre)')
    .eq('asesor_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(5)

  const stats = [
    { label: 'Órdenes totales', value: totalOrdenes || 0,  icon: FileText,     color: 'var(--accent)' },
    { label: 'Hoy',             value: ordenesHoy || 0,    icon: CheckCircle,  color: 'var(--success)' },
    { label: 'Clientes',        value: totalClientes || 0, icon: Users,        color: '#a78bfa' },
    { label: 'En revisión',     value: enRevision || 0,    icon: AlertCircle,  color: 'var(--warning)' },
  ]

  const estadoLabel: Record<string, { label: string; color: string }> = {
    borrador:   { label: 'Borrador',   color: 'var(--text-muted)' },
    revisando:  { label: 'Revisando',  color: 'var(--warning)' },
    confirmado: { label: 'Confirmado', color: 'var(--success)' },
    exportado:  { label: 'Exportado',  color: 'var(--accent)' },
  }

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

      {/* Órdenes recientes */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '600' }}>Órdenes recientes</h2>
        </div>

        {!ordenesRecientes?.length ? (
          <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ fontSize: '14px', marginBottom: '8px' }}>No has procesado órdenes aún</p>
            <Link href="/ordenes/nueva" style={{ color: 'var(--accent)', fontSize: '13px', textDecoration: 'none' }}>
              Procesar primera orden →
            </Link>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['Cliente', 'No. OC', 'Líneas', 'Estado', 'Fecha'].map((h) => (
                  <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordenesRecientes.map((orden: any) => (
                <tr key={orden.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 20px', fontSize: '14px' }}>
                    <Link href={`/ordenes/revisar/${orden.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: '500' }}>
                      {orden.oya_clientes?.nombre || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin asignar</span>}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>{orden.numero_oc || '—'}</td>
                  <td style={{ padding: '12px 20px', fontSize: '13px', color: orden.lineas_conflicto > 0 ? 'var(--warning)' : 'var(--text-secondary)' }}>
                    {orden.total_lineas} líneas{orden.lineas_conflicto > 0 && ` · ${orden.lineas_conflicto} conflicto${orden.lineas_conflicto > 1 ? 's' : ''}`}
                  </td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '500', color: estadoLabel[orden.estado]?.color, background: `${estadoLabel[orden.estado]?.color}18`, padding: '3px 8px', borderRadius: '4px' }}>
                      {estadoLabel[orden.estado]?.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 20px', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {new Date(orden.created_at).toLocaleDateString('es-MX')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
