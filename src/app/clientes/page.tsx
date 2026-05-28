import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { Users, Plus, ChevronRight, Building2, Search } from 'lucide-react'

export default async function PaginaClientes({
  searchParams,
}: {
  searchParams: { q?: string }
}) {
  const supabase = createClient()
  const q = searchParams.q?.trim() || ''

  let query = supabase
    .from('oya_clientes')
    .select('id, nombre, razon_social, id_sap, cadena, centro, almacen')
    .eq('activo', true)
    .order('nombre')

  if (q) {
    query = query.or(
      `nombre.ilike.%${q}%,razon_social.ilike.%${q}%,id_sap.ilike.%${q}%,cadena.ilike.%${q}%`
    )
  }

  const { data: clientes } = await query

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: "700", marginBottom: "4px" }}>Cadenas</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {clientes?.length || 0} clientes{q ? ` para "${q}"` : ' registrados'}
          </p>
        </div>
        <Link href="/clientes/nuevo" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'var(--accent)', color: 'white', borderRadius: '8px', fontSize: '14px', fontWeight: '600', textDecoration: 'none' }}>
          <Plus size={16} /> Nueva cadena
        </Link>
      </div>

      {/* Buscador */}
      <form method="GET" style={{ marginBottom: '20px', position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, razón social o RFC..."
          style={{ paddingLeft: '36px', maxWidth: '480px' }}
        />
      </form>

      {!clientes?.length ? (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '64px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Users size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: '15px', fontWeight: '500', marginBottom: '4px' }}>
            {q ? `Sin resultados para "${q}"` : 'Sin cadenas aún'}
          </p>
          {!q && (
            <Link href="/clientes/nuevo" style={{ color: 'var(--accent)', fontSize: '13px', textDecoration: 'none' }}>
              Crear primera cadena →
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {clientes.map((cliente: any) => (
            <Link key={cliente.id} href={`/clientes/detalle/${cliente.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', textDecoration: 'none', color: 'inherit' }}
            >
              <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(14,165,233,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Building2 size={17} color="var(--accent)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{cliente.nombre}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[cliente.razon_social, cliente.cadena].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontWeight: '600', fontFamily: 'monospace' }}>{cliente.id_sap || '—'}</p>
                  <p>ID SAP</p>
                </div>
                <div>
                  <p style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{cliente.centro || '—'}</p>
                  <p>Centro</p>
                </div>
              </div>
              <ChevronRight size={16} color="var(--text-muted)" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
