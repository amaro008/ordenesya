'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import { generarClipboardSAP, generarExcelSAP, calcularResumen } from '@/lib/sap-export'
import toast from 'react-hot-toast'
import { CheckCircle, AlertTriangle, Copy, Download, Search, Loader2, X, Check, User, MapPin } from 'lucide-react'
import type { Orden, DetalleOrden, Cliente, SKU, Ubicacion } from '@/types'

export default function OrdenRevisor({ id }: { id: string }) {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [orden, setOrden] = useState<Orden | null>(null)
  const [detalles, setDetalles] = useState<DetalleOrden[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [ubicacion, setUbicacion] = useState<Ubicacion | null>(null)
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [nuevoIdSap, setNuevoIdSap] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [skuSearch, setSkuSearch] = useState<Record<string, string>>({})
  const [skuResults, setSkuResults] = useState<Record<string, SKU[]>>({})

  useEffect(() => { cargarDatos() }, [id])

  async function cargarDatos() {
    setLoading(true)
    const [{ data: ordenData }, { data: detallesData }, { data: clientesData }] = await Promise.all([
      supabase.from('oya_ordenes').select('*, oya_clientes(*), oya_ubicaciones(*)').eq('id', id).single(),
      supabase.from('oya_detalles_orden').select('*').eq('orden_id', id).order('linea_num'),
      supabase.from('oya_clientes').select('*').eq('activo', true).order('nombre'),
    ])
    if (ordenData) {
      setOrden(ordenData as any)
      setCliente((ordenData as any).oya_clientes || null)
      setUbicacion((ordenData as any).oya_ubicaciones || null)
      // Cargar ubicaciones de la cadena detectada
      if ((ordenData as any).cliente_id) {
        const { data: ubs } = await supabase.from('oya_ubicaciones')
          .select('*').eq('cliente_id', (ordenData as any).cliente_id).eq('activo', true).order('nombre')
        setUbicaciones((ubs || []) as Ubicacion[])
      }
    }
    if (detallesData) setDetalles(detallesData as DetalleOrden[])
    if (clientesData) setClientes(clientesData as Cliente[])
    setLoading(false)
  }

  async function buscarSKU(detalleId: string, query: string) {
    setSkuSearch(prev => ({ ...prev, [detalleId]: query }))
    if (query.length < 2) { setSkuResults(prev => ({ ...prev, [detalleId]: [] })); return }
    const { data } = await supabase.from('oya_skus').select('sku, descripcion').or(`sku.ilike.%${query}%,descripcion.ilike.%${query}%`).eq('activo', true).limit(8)
    setSkuResults(prev => ({ ...prev, [detalleId]: (data as SKU[]) || [] }))
  }

  async function asignarSKU(detalle: DetalleOrden, sku: SKU) {
    setDetalles(prev => prev.map(d => d.id === detalle.id ? { ...d, sku_interno: sku.sku, descripcion: sku.descripcion, estado_linea: 'resuelto', metodo_resolucion: 'manual' } : d))
    setSkuSearch(prev => ({ ...prev, [detalle.id]: '' }))
    setSkuResults(prev => ({ ...prev, [detalle.id]: [] }))
    await supabase.from('oya_detalles_orden').update({ sku_interno: sku.sku, descripcion: sku.descripcion, estado_linea: 'resuelto', metodo_resolucion: 'manual' }).eq('id', detalle.id)
    if (cliente && detalle.id_cliente_raw) {
      await supabase.from('oya_equivalencias').upsert({ cliente_id: cliente.id, id_cliente: detalle.id_cliente_raw, sku_interno: sku.sku, descripcion_cliente: detalle.id_cliente_raw }, { onConflict: 'cliente_id,id_cliente' })
      toast.success(`Equivalencia guardada: ${detalle.id_cliente_raw} → ${sku.sku}`)
    }
  }

  async function actualizarCantidad(detalleId: string, cantidad: number) {
    setDetalles(prev => prev.map(d => d.id === detalleId ? { ...d, cantidad } : d))
    await supabase.from('oya_detalles_orden').update({ cantidad }).eq('id', detalleId)
  }

  async function asignarCliente(clienteId: string) {
    const c = clientes.find(c => c.id === clienteId)
    setCliente(c || null)
    await supabase.from('oya_ordenes').update({ cliente_id: clienteId || null }).eq('id', id)
    if (clienteId) {
      toast.loading('Re-validando equivalencias...', { id: 'revalidar' })
      await fetch(`/api/ordenes/${id}/revalidar`, { method: 'POST', body: JSON.stringify({ clienteId }) })
      await cargarDatos()
      toast.success('SKUs re-validados', { id: 'revalidar' })
    }
  }

  async function asignarUbicacion(ubicacionId: string) {
    const u = ubicaciones.find(u => u.id === ubicacionId)
    setUbicacion(u || null)
    await supabase.from('oya_ordenes').update({ ubicacion_id: ubicacionId || null }).eq('id', id)
  }

  async function guardarNuevaUbicacion() {
    if (!nuevoIdSap.trim() || !orden?.comedor_detectado || !cliente) return
    // Buscar si ya existe la ubicación sin ID SAP
    const existente = ubicaciones.find(u => u.nombre.toLowerCase() === orden.comedor_detectado?.toLowerCase())
    if (existente) {
      // Actualizar el ID SAP
      await supabase.from('oya_ubicaciones').update({ id_sap: nuevoIdSap.trim() }).eq('id', existente.id)
      const updated = { ...existente, id_sap: nuevoIdSap.trim() }
      setUbicaciones(prev => prev.map(u => u.id === existente.id ? updated : u))
      setUbicacion(updated)
      await supabase.from('oya_ordenes').update({ ubicacion_id: existente.id }).eq('id', id)
    } else {
      // Crear nueva ubicación
      const { data } = await supabase.from('oya_ubicaciones').insert({
        cliente_id: cliente.id,
        nombre: orden.comedor_detectado!,
        id_sap: nuevoIdSap.trim(),
      }).select().single()
      if (data) {
        setUbicaciones(prev => [...prev, data as Ubicacion])
        setUbicacion(data as Ubicacion)
        await supabase.from('oya_ordenes').update({ ubicacion_id: (data as any).id }).eq('id', id)
      }
    }
    toast.success(`Ubicación "${orden.comedor_detectado}" guardada con ID SAP: ${nuevoIdSap}`)
    setNuevoIdSap('')
  }

  async function confirmarOrden() {
    setGuardando(true)
    const resumen = calcularResumen(detalles)
    await supabase.from('oya_ordenes').update({ estado: 'confirmado', lineas_resueltas: resumen.lineasResueltas, lineas_conflicto: resumen.lineasConflicto }).eq('id', id)
    toast.success('Orden confirmada')
    setOrden(prev => prev ? { ...prev, estado: 'confirmado' } : prev)
    setGuardando(false)
  }

  async function copiarSAP() {
    const texto = generarClipboardSAP(detalles, orden?.numero_oc || null)
    await navigator.clipboard.writeText(texto)
    await supabase.from('oya_ordenes').update({ estado: 'exportado' }).eq('id', id)
    toast.success(`${calcularResumen(detalles).lineasParaSAP} líneas copiadas al portapapeles`)
    setOrden(prev => prev ? { ...prev, estado: 'exportado' } : prev)
  }

  async function descargarExcel() {
    const blob = generarExcelSAP(detalles, cliente?.nombre || 'Cliente', orden?.numero_oc || null)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ordenesya-${cliente?.nombre || 'pedido'}-${orden?.numero_oc || id.slice(0, 8)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    await supabase.from('oya_ordenes').update({ estado: 'exportado' }).eq('id', id)
    setOrden(prev => prev ? { ...prev, estado: 'exportado' } : prev)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px', gap: '12px', color: 'var(--text-secondary)' }}>
      <Loader2 size={20} className="animate-spin" /> <span>Cargando orden...</span>
    </div>
  )
  if (!orden) return <div style={{ color: 'var(--danger)' }}>Orden no encontrada</div>

  const resumen = calcularResumen(detalles)

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>
            Revisar orden {orden.numero_oc ? `· ${orden.numero_oc}` : ''}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{orden.archivo_nombre} · {new Date(orden.created_at).toLocaleDateString('es-MX')}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={descargarExcel} style={btnStyle('secondary')}><Download size={15} /> Excel</button>
          <button onClick={copiarSAP} disabled={resumen.lineasConflicto > 0} style={btnStyle(resumen.lineasConflicto > 0 ? 'disabled' : 'primary')} title={resumen.lineasConflicto > 0 ? 'Resuelve los conflictos primero' : ''}>
            <Copy size={15} /> Copiar para SAP
          </button>
          {orden.estado !== 'confirmado' && orden.estado !== 'exportado' && (
            <button onClick={confirmarOrden} disabled={guardando || resumen.lineasConflicto > 0} style={btnStyle('success')}>
              {guardando ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirmar
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: resumen.totalLineas, color: 'var(--text-secondary)' },
          { label: 'Resueltas', value: resumen.lineasResueltas, color: 'var(--success)' },
          { label: 'Conflictos', value: resumen.lineasConflicto, color: resumen.lineasConflicto > 0 ? 'var(--danger)' : 'var(--text-muted)' },
          { label: 'Para SAP', value: resumen.lineasParaSAP, color: 'var(--accent)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ padding: '6px 14px', borderRadius: '20px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--text-muted)' }}>{label}:</span>
            <strong style={{ color }}>{value}</strong>
          </div>
        ))}
      </div>

      {/* Cadena + Ubicación */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        {/* Cadena */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: cliente ? 'rgba(14,165,233,0.12)' : 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <User size={17} color={cliente ? 'var(--accent)' : 'var(--warning)'} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Cadena</p>
            <select value={cliente?.id || ''} onChange={e => asignarCliente(e.target.value)} style={{ padding: '4px 8px', fontSize: '14px', fontWeight: '500', maxWidth: '360px' }}>
              <option value="">— Sin asignar —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          {cliente && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0 }}>
              <div>Centro: <span style={{ color: 'var(--text-secondary)' }}>{cliente.centro || '—'}</span></div>
              <div>Almacén: <span style={{ color: 'var(--text-secondary)' }}>{cliente.almacen || '—'}</span></div>
            </div>
          )}
        </div>

        {/* Comedor / Ubicación */}
        {orden?.comedor_detectado && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <MapPin size={14} color="var(--text-muted)" />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Comedor:</span>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>{orden.comedor_detectado}</span>
            </div>
            {ubicacion ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '6px' }}>
                  <CheckCircle size={13} color="var(--success)" />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>ID SAP:</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--success)', fontSize: '15px' }}>
                    {ubicacion.id_sap || '— sin ID'}
                  </span>
                </div>
                {ubicaciones.length > 1 && (
                  <select value={ubicacion.id} onChange={e => asignarUbicacion(e.target.value)} style={{ fontSize: '12px', padding: '4px 8px' }}>
                    {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}{u.id_sap ? ` (${u.id_sap})` : ' — sin ID'}</option>)}
                  </select>
                )}
              </div>
            ) : (
              <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '7px' }}>
                <p style={{ fontSize: '12px', color: 'var(--warning)', marginBottom: '8px' }}>
                  ⚠ Esta ubicación no tiene ID SAP. Captúralo para guardarlo en la cadena.
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input value={nuevoIdSap} onChange={e => setNuevoIdSap(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && guardarNuevaUbicacion()}
                    placeholder="ID SAP de esta ubicación"
                    style={{ fontSize: '13px', fontFamily: 'monospace', maxWidth: '200px', padding: '6px 10px', borderColor: 'rgba(245,158,11,0.4)' }} />
                  <button onClick={guardarNuevaUbicacion} disabled={!nuevoIdSap.trim()}
                    style={{ padding: '6px 12px', background: nuevoIdSap.trim() ? 'var(--accent)' : 'var(--bg-tertiary)', color: nuevoIdSap.trim() ? 'white' : 'var(--text-muted)', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: nuevoIdSap.trim() ? 'pointer' : 'not-allowed' }}>
                    Guardar en cadena
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--bg-primary)' }}>
              {['#', 'ID Cliente', 'SKU Interno', 'Descripción', 'Cant. Cliente', 'UM → SAP', 'Estado'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {detalles.map(detalle => {
              const esConflicto = detalle.estado_linea === 'conflicto'
              return (
                <tr key={detalle.id} className={esConflicto ? 'linea-conflicto' : 'linea-resuelta'} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--text-muted)', width: '40px' }}>{detalle.linea_num}</td>
                  <td style={{ padding: '10px 14px', fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{detalle.id_cliente_raw || '—'}</td>
                  <td style={{ padding: '10px 14px', minWidth: '200px' }}>
                    {esConflicto ? (
                      <div style={{ position: 'relative' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <Search size={13} style={{ position: 'absolute', left: '8px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                          <input value={skuSearch[detalle.id] || ''} onChange={e => buscarSKU(detalle.id, e.target.value)} placeholder="Buscar SKU..." style={{ paddingLeft: '28px', fontSize: '13px', borderColor: 'var(--danger)' }} />
                        </div>
                        {skuResults[detalle.id]?.length > 0 && (
                          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                            {skuResults[detalle.id].map(sku => (
                              <div key={sku.sku} onClick={() => asignarSKU(detalle, sku)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--border)' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <span style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--accent)' }}>{sku.sku}</span>
                                <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>{sku.descripcion}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: '600' }}>{detalle.sku_interno}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detalle.descripcion || '—'}</td>
                  <td style={{ padding: '10px 14px', width: '100px' }}>
                    <input type="number" value={detalle.cantidad} onChange={e => actualizarCantidad(detalle.id, parseFloat(e.target.value) || 0)} step="0.001" min="0" style={{ fontSize: '13px', textAlign: 'right', width: '80px' }} />
                  </td>
                  <td style={{ padding: '10px 14px', minWidth: '100px' }}>
                    {detalle.um_cliente || detalle.um_sigma ? (
                      <div style={{ fontSize: '12px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{detalle.um_cliente || detalle.unidad_medida || '—'}</span>
                        {detalle.um_sigma && detalle.um_sigma !== detalle.um_cliente && (
                          <>
                            <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>→</span>
                            <span style={{ color: 'var(--accent)', fontWeight: '600' }}>{detalle.um_sigma}</span>
                            {detalle.factor_conv && detalle.factor_conv !== 1 && (
                              <span style={{ color: 'var(--text-muted)', marginLeft: '3px' }}>×{detalle.factor_conv}</span>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{detalle.unidad_medida || '—'}</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    {esConflicto ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--danger)', background: 'rgba(239,68,68,0.1)', padding: '3px 8px', borderRadius: '4px' }}>
                        <AlertTriangle size={11} /> Conflicto
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--success)', background: 'rgba(34,197,94,0.1)', padding: '3px 8px', borderRadius: '4px' }}>
                        <CheckCircle size={11} /> {detalle.metodo_resolucion === 'manual' ? 'Manual' : 'Auto'}
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {/* Footer: líneas + comparación de totales */}
        <div style={{ padding: '14px 16px', background: 'var(--bg-primary)', borderTop: '1px solid var(--border)' }}>
          {/* Líneas */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: '13px', color: 'var(--text-secondary)', gap: '24px', marginBottom: (orden?.total_oc || orden?.subtotal_oc) ? '12px' : '0' }}>
            <span>Total líneas: <strong style={{ color: 'var(--text-primary)' }}>{resumen.totalLineas}</strong></span>
            <span>Resueltas: <strong style={{ color: 'var(--success)' }}>{resumen.lineasResueltas}</strong></span>
            {resumen.lineasConflicto > 0 && <span>Conflictos: <strong style={{ color: 'var(--danger)' }}>{resumen.lineasConflicto}</strong></span>}
          </div>

          {/* Comparación de totales */}
          {(orden?.total_oc || orden?.subtotal_oc) && (
            <TotalesOC
              subtotal={orden?.subtotal_oc}
              iva={orden?.iva_oc}
              totalOC={orden?.total_oc}
              detalles={detalles}
            />
          )}
        </div>
      </div>
    </div>
  )
}


function TotalesOC({ subtotal, iva, totalOC, detalles }: {
  subtotal: number | null; iva: number | null; totalOC: number | null; detalles: any[]
}) {
  const totalCalculado = detalles
    .filter(d => d.estado_linea === 'resuelto')
    .reduce((sum: number, d: any) => sum + (d.importe || 0), 0)
  const diferencia = (totalOC || 0) - totalCalculado
  const hayPrecios = detalles.some(d => d.importe && d.importe > 0)
  const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 })

  return (
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '8px' }}>
      {subtotal ? <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Subtotal OC: <strong style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>${fmt(subtotal)}</strong></div> : null}
      {iva ? <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>IVA: <strong style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>${fmt(iva)}</strong></div> : null}
      {totalOC ? <div style={{ fontSize: '12px' }}>Total OC: <strong style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--text-primary)' }}>${fmt(totalOC)}</strong></div> : null}
      {hayPrecios && totalCalculado > 0 ? (
        <div style={{ fontSize: '12px' }}>
          Total calculado: <strong style={{ fontFamily: 'monospace', fontSize: '14px', color: Math.abs(diferencia) < 1 ? 'var(--success)' : 'var(--warning)' }}>${fmt(totalCalculado)}</strong>
          {Math.abs(diferencia) >= 1 && <span style={{ marginLeft: '6px', color: 'var(--warning)', fontSize: '11px' }}>(dif: ${fmt(Math.abs(diferencia))})</span>}
        </div>
      ) : null}
    </div>
  )
}

function btnStyle(variant: 'primary' | 'secondary' | 'success' | 'disabled') {
  const base = { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '7px', border: 'none', fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s' }
  const variants = {
    primary:   { background: 'var(--accent)', color: 'white' },
    secondary: { background: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
    success:   { background: 'rgba(34,197,94,0.15)', color: 'var(--success)' },
    disabled:  { background: 'var(--bg-tertiary)', color: 'var(--text-muted)', cursor: 'not-allowed' },
  }
  return { ...base, ...variants[variant] } as any
}
