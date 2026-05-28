import { createClient } from '@/lib/supabase'
import Link from 'next/link'
import { Plus, Building2, Search } from 'lucide-react'
import EliminarCadenaBtn from './EliminarCadenaBtn'

export default async function PaginaCadenas({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient()
  const q = searchParams.q?.trim() || ''

  let query = supabase
    .from('oya_clientes')
    .select('id, nombre, razon_social, cadena')
    .eq('activo', true)
    .order('nombre')

  if (q) query = query.or(`nombre.ilike.%${q}%,razon_social.ilike.%${q}%,cadena.ilike.%${q}%`)

  const { data: cadenas } = await query

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px' }}>Cadenas</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {cadenas?.length || 0} cadenas{q ? ` para "${q}"` : ' registradas'}
          </p>
        </div>
        <Link href="/clientes/nuevo" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'var(--accent)', color: 'white', borderRadius: '8px', fontSize: '14px', fontWeight: '600', textDecoration: 'none' }}>
          <Plus size={16} /> Nueva cadena
        </Link>
      </div>

      <form method="GET" style={{ marginBottom: '20px', position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, razón social o RFC..." style={{ paddingLeft: '36px', maxWidth: '480px' }} />
      </form>

      {!cadenas?.length ? (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '64px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Building2 size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <p style={{ fontSize: '15px', fontWeight: '500', marginBottom: '8px' }}>
            {q ? `Sin resultados para "${q}"` : 'Sin cadenas aún'}
          </p>
          {!q && (
            <Link href="/clientes/nuevo" style={{ color: 'var(--accent)', fontSize: '13px', textDecoration: 'none' }}>
              Configurar primera cadena →
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {cadenas.map((c: any) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(14,165,233,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Building2 size={17} color="var(--accent)" />
              </div>
              <Link href={`/clientes/detalle/${c.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
                <p style={{ fontWeight: '600', fontSize: '14px', marginBottom: '2px' }}>{c.nombre}</p>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.razon_social || c.cadena || '—'}
                </p>
              </Link>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <Link href={`/clientes/detalle/${c.id}`} style={{ padding: '6px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'none' }}>
                  Editar
                </Link>
                <EliminarCadenaBtn id={c.id} nombre={c.nombre} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
