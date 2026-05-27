import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Clientes' }
import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { Users, Plus, ChevronRight, Building2 } from 'lucide-react'

export default async function PaginaClientes() {
  const supabase = createClient()
  const { data: clientes } = await supabase
    .from('oya_clientes')
    .select('*, oya_equivalencias(count), oya_cliente_identifiers(count)')
    .eq('activo', true).order('nombre')

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px' }}>Clientes</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{clientes?.length || 0} clientes registrados</p>
        </div>
        <Link href="/clientes/nuevo" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'var(--accent)', color: 'white', borderRadius: '8px', fontSize: '14px', fontWeight: '600', textDecoration: 'none' }}>
          <Plus size={16} /> Nuevo cliente
        </Link>
      </div>
      {!clientes?.length ? (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '64px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: '15px', fontWeight: '500', marginBottom: '4px' }}>Sin clientes aún</p>
          <Link href="/clientes/nuevo" style={{ color: 'var(--accent)', fontSize: '13px', textDecoration: 'none' }}>Crear primer cliente →</Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {clientes.map((cliente: any) => (
            <Link key={cliente.id} href={`/clientes/detalle/${cliente.id}`} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', textDecoration: 'none', color: 'inherit', transition: 'border-color 0.15s' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '9px', background: 'rgba(14,165,233,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Building2 size={18} color="var(--accent)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{cliente.nombre}</p>
                {cliente.razon_social && <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{cliente.razon_social}</p>}
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
                <div><p style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{cliente.oya_equivalencias?.[0]?.count || 0}</p><p>equivalencias</p></div>
                <div><p style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{cliente.centro || '—'}</p><p>centro</p></div>
                <div><p style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{cliente.almacen || '—'}</p><p>almacén</p></div>
              </div>
              <ChevronRight size={16} color="var(--text-muted)" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
