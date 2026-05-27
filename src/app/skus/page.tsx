import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Catálogo SKUs' }
import { createClient } from '@/lib/supabase'
import { Package, Search } from 'lucide-react'
import CargaExcelBtn from './CargaExcelBtn'

export default async function PaginaSKUs({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient()
  const query = searchParams.q || ''

  let skusQuery = supabase
    .from('oya_skus')
    .select('sku, descripcion, familia', { count: 'exact' })
    .eq('activo', true)
    .order('sku')
    .limit(50)

  if (query) {
    skusQuery = skusQuery.or(`sku.ilike.%${query}%,descripcion.ilike.%${query}%,familia.ilike.%${query}%`)
  }

  const { data: skus, count } = await skusQuery

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px' }}>Catálogo SKUs</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            {count?.toLocaleString() || 0} productos activos
          </p>
        </div>
        <CargaExcelBtn />
      </div>

      {/* Búsqueda */}
      <form method="GET" style={{ marginBottom: '20px', position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          name="q"
          defaultValue={query}
          placeholder="Buscar por SKU, material o familia..."
          style={{ paddingLeft: '36px', maxWidth: '420px' }}
        />
      </form>

      {/* Tabla */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)' }}>
              {['SKU', 'Material', 'Familia'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skus?.map(sku => (
              <tr key={sku.sku} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '13px', fontWeight: '600', color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                  {sku.sku}
                </td>
                <td style={{ padding: '10px 16px', fontSize: '13px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {sku.descripcion}
                </td>
                <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                  {sku.familia || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!skus?.length && (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Package size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p style={{ marginBottom: '4px' }}>No se encontraron productos{query ? ` para "${query}"` : ''}</p>
            {!query && <p style={{ fontSize: '13px' }}>Carga tu catálogo con el botón "Cargar Excel"</p>}
          </div>
        )}

        {(count || 0) > 50 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
            Mostrando 50 de {count?.toLocaleString()} resultados · Usa la búsqueda para filtrar
          </div>
        )}
      </div>

      {/* Formato esperado */}
      <div style={{ marginTop: '16px', padding: '14px 16px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text-secondary)' }}>Formato del Excel:</strong>{' '}
        El archivo debe tener columnas con encabezados{' '}
        <code style={{ background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: '4px', color: 'var(--accent)' }}>Sku</code>{' '}
        <code style={{ background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: '4px', color: 'var(--accent)' }}>Material</code>{' '}
        <code style={{ background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: '4px', color: 'var(--accent)' }}>Familia</code>{' '}
        (Familia es opcional).
      </div>
    </div>
  )
}
