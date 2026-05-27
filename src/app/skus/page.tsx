import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Catálogo SKUs' }
import { createClient } from '@/lib/supabase'
import { Package } from 'lucide-react'

export default async function PaginaSKUs({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient()
  const query = searchParams.q || ''
  let skusQuery = supabase.from('oya_skus').select('*', { count: 'exact' }).eq('activo', true).order('sku').limit(50)
  if (query) skusQuery = skusQuery.or(`sku.ilike.%${query}%,descripcion.ilike.%${query}%`)
  const { data: skus, count } = await skusQuery

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px' }}>Catálogo SKUs</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{count?.toLocaleString() || 0} productos en el catálogo</p>
      </div>
      <form method="GET" style={{ marginBottom: '20px', position: 'relative' }}>
        <input name="q" defaultValue={query} placeholder="Buscar por SKU o descripción..." style={{ maxWidth: '420px', paddingLeft: '16px' }} />
      </form>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)' }}>
              {['SKU', 'Descripción', 'Familia', 'Línea de Ventas', 'Marca'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skus?.map(sku => (
              <tr key={sku.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '13px', fontWeight: '600', color: 'var(--accent)', whiteSpace: 'nowrap' }}>{sku.sku}</td>
                <td style={{ padding: '10px 16px', fontSize: '13px', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sku.descripcion}</td>
                <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>{sku.familia || '—'}</td>
                <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>{sku.linea_ventas || '—'}</td>
                <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>{sku.marca || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!skus?.length && (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Package size={32} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <p>No se encontraron SKUs{query ? ` para "${query}"` : ''}</p>
          </div>
        )}
        {(count || 0) > 50 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
            Mostrando 50 de {count?.toLocaleString()} resultados. Usa la búsqueda para filtrar.
          </div>
        )}
      </div>
    </div>
  )
}
