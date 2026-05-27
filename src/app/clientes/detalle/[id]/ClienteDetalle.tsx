'use client'
import { useState, useEffect } from 'react'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import { Save, Plus, Trash2, Building2, X } from 'lucide-react'
import type { Cliente, Equivalencia, ClienteIdentifier, SKU } from '@/types'

export default function ClienteDetalle({ id }: { id: string }) {
  const supabase = createBrowserClient()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [equivalencias, setEquivalencias] = useState<Equivalencia[]>([])
  const [identifiers, setIdentifiers] = useState<ClienteIdentifier[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [centro, setCentro] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [notas, setNotas] = useState('')
  const [nuevaIdCliente, setNuevaIdCliente] = useState('')
  const [nuevaDesc, setNuevaDesc] = useState('')
  const [skuBusqueda, setSkuBusqueda] = useState('')
  const [skuSeleccionado, setSkuSeleccionado] = useState<SKU | null>(null)
  const [skuResultados, setSkuResultados] = useState<SKU[]>([])
  const [nuevoIdentifier, setNuevoIdentifier] = useState('')

  useEffect(() => { cargarDatos() }, [id])

  async function cargarDatos() {
    const [{ data: c }, { data: eq }, { data: ident }] = await Promise.all([
      supabase.from('oya_clientes').select('*').eq('id', id).single(),
      supabase.from('oya_equivalencias').select('*, oya_skus(descripcion)').eq('cliente_id', id).order('id_cliente'),
      supabase.from('oya_cliente_identifiers').select('*').eq('cliente_id', id),
    ])
    if (c) { setCliente(c); setNombre(c.nombre || ''); setRazonSocial(c.razon_social || ''); setCentro(c.centro || ''); setAlmacen(c.almacen || ''); setNotas(c.notas || '') }
    if (eq) setEquivalencias(eq as any)
    if (ident) setIdentifiers(ident as ClienteIdentifier[])
    setLoading(false)
  }

  async function guardarCliente() {
    setGuardando(true)
    const { error } = await supabase.from('oya_clientes').update({ nombre, razon_social: razonSocial, centro, almacen, notas }).eq('id', id)
    if (error) toast.error('Error guardando')
    else toast.success('Cliente actualizado')
    setGuardando(false)
  }

  async function buscarSKUs(q: string) {
    setSkuBusqueda(q)
    if (q.length < 2) { setSkuResultados([]); return }
    const { data } = await supabase.from('oya_skus').select('sku, descripcion').or(`sku.ilike.%${q}%,descripcion.ilike.%${q}%`).eq('activo', true).limit(8)
    setSkuResultados((data as SKU[]) || [])
  }

  async function agregarEquivalencia() {
    if (!nuevaIdCliente || !skuSeleccionado) { toast.error('Completa el ID del cliente y el SKU interno'); return }
    const { error } = await supabase.from('oya_equivalencias').upsert({ cliente_id: id, id_cliente: nuevaIdCliente.trim().toUpperCase(), sku_interno: skuSeleccionado.sku, descripcion_cliente: nuevaDesc || null }, { onConflict: 'cliente_id,id_cliente' })
    if (error) { toast.error('Error agregando equivalencia'); return }
    toast.success('Equivalencia agregada')
    setNuevaIdCliente(''); setNuevaDesc(''); setSkuBusqueda(''); setSkuSeleccionado(null)
    cargarDatos()
  }

  async function eliminarEquivalencia(equivId: string) {
    await supabase.from('oya_equivalencias').delete().eq('id', equivId)
    setEquivalencias(prev => prev.filter(e => e.id !== equivId))
    toast.success('Equivalencia eliminada')
  }

  async function agregarIdentifier() {
    if (!nuevoIdentifier.trim()) return
    const { error } = await supabase.from('oya_cliente_identifiers').insert({ cliente_id: id, tipo: 'nombre_negocio', valor: nuevoIdentifier.trim() })
    if (!error) { toast.success('Identificador agregado'); setNuevoIdentifier(''); cargarDatos() }
  }

  async function eliminarIdentifier(identId: string) {
    await supabase.from('oya_cliente_identifiers').delete().eq('id', identId)
    setIdentifiers(prev => prev.filter(i => i.id !== identId))
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: '48px' }}>Cargando...</div>
  if (!cliente) return <div style={{ color: 'var(--danger)' }}>Cliente no encontrado</div>

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '780px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(14,165,233,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Building2 size={20} color="var(--accent)" />
        </div>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '700' }}>{cliente.nombre}</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{equivalencias.length} equivalencias · {identifiers.length} identificadores</p>
        </div>
      </div>

      {/* Datos */}
      <Section title="Datos del cliente">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div><label style={labelStyle}>Nombre comercial</label><input value={nombre} onChange={e => setNombre(e.target.value)} /></div>
          <div><label style={labelStyle}>Razón social</label><input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} /></div>
          <div><label style={labelStyle}>Centro SAP</label><input value={centro} onChange={e => setCentro(e.target.value)} placeholder="Ej: 1000" /></div>
          <div><label style={labelStyle}>Almacén SAP</label><input value={almacen} onChange={e => setAlmacen(e.target.value)} placeholder="Ej: 0001" /></div>
        </div>
        <div style={{ marginTop: '14px' }}><label style={labelStyle}>Notas</label><input value={notas} onChange={e => setNotas(e.target.value)} /></div>
        <button onClick={guardarCliente} disabled={guardando} style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 16px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
          <Save size={14} /> {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </Section>

      {/* Identificadores */}
      <Section title="Identificadores de reconocimiento" subtitle="Textos del documento que identifican a este cliente automáticamente">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
          {identifiers.map(ident => (
            <div key={ident.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: '6px', fontSize: '13px' }}>
              {ident.valor}
              <button onClick={() => eliminarIdentifier(ident.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '0' }}><X size={13} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input value={nuevoIdentifier} onChange={e => setNuevoIdentifier(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregarIdentifier()} placeholder="Ej: Borgwarner, NEMAK SALTILLO..." style={{ flex: 1 }} />
          <button onClick={agregarIdentifier} style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '7px', cursor: 'pointer' }}><Plus size={14} /></button>
        </div>
      </Section>

      {/* Equivalencias */}
      <Section title="Equivalencias de producto" subtitle="ID del cliente → SKU interno del catálogo">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '10px', marginBottom: '16px', alignItems: 'end' }}>
          <div><label style={labelStyle}>ID del cliente</label><input value={nuevaIdCliente} onChange={e => setNuevaIdCliente(e.target.value)} placeholder="Ej: 942SIG" /></div>
          <div><label style={labelStyle}>Descripción (opcional)</label><input value={nuevaDesc} onChange={e => setNuevaDesc(e.target.value)} placeholder="Descripción del cliente" /></div>
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>SKU interno</label>
            {skuSeleccionado ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '6px', fontSize: '13px' }}>
                <span style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--success)' }}>{skuSeleccionado.sku}</span>
                <button onClick={() => setSkuSeleccionado(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginLeft: 'auto', display: 'flex' }}><X size={13} /></button>
              </div>
            ) : (
              <>
                <input value={skuBusqueda} onChange={e => buscarSKUs(e.target.value)} placeholder="Buscar SKU..." />
                {skuResultados.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                    {skuResultados.map(sku => (
                      <div key={sku.sku} onClick={() => { setSkuSeleccionado(sku); setSkuBusqueda(''); setSkuResultados([]) }} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <span style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--accent)' }}>{sku.sku}</span>
                        <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '12px' }}>{sku.descripcion}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <button onClick={agregarEquivalencia} style={{ padding: '9px 14px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '7px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: '600' }}>
            <Plus size={14} /> Agregar
          </button>
        </div>
        {equivalencias.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No hay equivalencias registradas</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['ID Cliente', 'SKU Interno', 'Descripción', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {equivalencias.map((eq: any) => (
                <tr key={eq.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-secondary)' }}>{eq.id_cliente}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '13px', fontWeight: '600', color: 'var(--accent)' }}>{eq.sku_interno}</td>
                  <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--text-muted)' }}>{eq.oya_skus?.descripcion || '—'}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button onClick={() => eliminarEquivalencia(eq.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '600' }}>{title}</h2>
        {subtitle && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{subtitle}</p>}
      </div>
      <div style={{ padding: '18px' }}>{children}</div>
    </div>
  )
}
