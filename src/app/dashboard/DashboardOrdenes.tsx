'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import { FileText, Trash2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Orden {
  id: string
  numero_oc: string | null
  estado: string
  total_lineas: number
  lineas_conflicto: number
  lineas_resueltas: number
  created_at: string
  oya_clientes: { nombre: string } | null
}

const estadoLabel: Record<string, { label: string; color: string }> = {
  borrador:   { label: 'Borrador',   color: 'var(--text-muted)' },
  revisando:  { label: 'Revisando',  color: 'var(--warning)' },
  confirmado: { label: 'Confirmado', color: 'var(--success)' },
  exportado:  { label: 'Exportado',  color: 'var(--accent)' },
}

export default function DashboardOrdenes({
  ordenes: initialOrdenes,
  filtroActivo,
}: {
  ordenes: Orden[]
  filtroActivo: string
}) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [ordenes, setOrdenes] = useState(initialOrdenes)
  const [eliminando, setEliminando] = useState<string | null>(null)

  async function eliminarOrden(id: string) {
    if (!confirm('¿Eliminar esta orden? Esta acción no se puede deshacer.')) return
    setEliminando(id)
    try {
      await supabase.from('oya_detalles_orden').delete().eq('orden_id', id)
      const { error } = await supabase.from('oya_ordenes').delete().eq('id', id)
      if (error) throw error
      setOrdenes(prev => prev.filter(o => o.id !== id))
      toast.success('Orden eliminada')
    } catch {
      toast.error('Error eliminando la orden')
    } finally {
      setEliminando(null)
    }
  }

  const FILTROS = [
    { key: 'activas',    label: 'Activas' },
    { key: 'procesadas', label: 'Procesadas' },
    { key: 'todas',      label: 'Todas' },
  ]

  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
      {/* Header con filtros */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: '600' }}>Mis órdenes</h2>
        <div style={{ display: 'flex', gap: '6px' }}>
          {FILTROS.map(f => (
            <Link key={f.key} href={`/dashboard?estado=${f.key}`} style={{
              padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
              textDecoration: 'none',
              background: filtroActivo === f.key ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: filtroActivo === f.key ? 'white' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}>
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {!ordenes.length ? (
        <div style={{ padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <FileText size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: '14px', marginBottom: '8px' }}>
            No hay órdenes {filtroActivo === 'activas' ? 'activas' : filtroActivo === 'procesadas' ? 'procesadas' : ''}
          </p>
          <Link href="/ordenes/nueva" style={{ color: 'var(--accent)', fontSize: '13px', textDecoration: 'none' }}>
            Procesar nueva orden →
          </Link>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)' }}>
              {['Cliente', 'No. OC', 'Líneas', 'Estado', 'Fecha', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ordenes.map(orden => (
              <tr key={orden.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 16px', fontSize: '14px' }}>
                  <Link href={`/ordenes/revisar/${orden.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', fontWeight: '500' }}>
                    {orden.oya_clientes?.nombre || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin asignar</span>}
                  </Link>
                </td>
                <td style={{ padding: '11px 16px', fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {orden.numero_oc || '—'}
                </td>
                <td style={{ padding: '11px 16px', fontSize: '13px' }}>
                  <span style={{ color: orden.lineas_conflicto > 0 ? 'var(--warning)' : 'var(--text-secondary)' }}>
                    {orden.total_lineas} líneas
                    {orden.lineas_conflicto > 0 && ` · ${orden.lineas_conflicto} ⚠`}
                  </span>
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '500', color: estadoLabel[orden.estado]?.color, background: `${estadoLabel[orden.estado]?.color}18`, padding: '3px 8px', borderRadius: '4px' }}>
                    {estadoLabel[orden.estado]?.label}
                  </span>
                </td>
                <td style={{ padding: '11px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
                  {new Date(orden.created_at).toLocaleDateString('es-MX')}
                </td>
                <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                  <button
                    onClick={() => eliminarOrden(orden.id)}
                    disabled={eliminando === orden.id}
                    title="Eliminar orden"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '5px', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}
                  >
                    {eliminando === orden.id
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Trash2 size={14} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
