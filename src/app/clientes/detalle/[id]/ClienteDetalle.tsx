'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import { Save, Plus, Trash2, X, ArrowLeft, Building2, MapPin } from 'lucide-react'
import Link from 'next/link'
import type { Cliente, ClienteIdentifier, Equivalencia, Ubicacion } from '@/types'

const TIPO_LABEL: Record<string, string> = {
  nombre_cadena: 'Nombre cadena', rfc_emisor: 'RFC emisor',
  nombre_negocio: 'Nombre negocio', centro_costos: 'Centro costos',
  id_ubicacion: 'ID ubicación', rfc: 'RFC', otro: 'Otro',
}

const UMS = ['KG', 'LT', 'PZA', 'CAJA', 'PQT', 'CJA', 'PAQ', 'GR', 'ML', 'TON']

export default function ClienteDetalle() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const supabase = createBrowserClient()

  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [cliente, setCliente] = useState<Cliente | null>(null)

  // Datos básicos
  const [nombre, setNombre] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [rfcEmisor, setRfcEmisor] = useState('')
  const [centro, setCentro] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [notas, setNotas] = useState('')

  // Secciones
  const [identifiers, setIdentifiers] = useState<ClienteIdentifier[]>([])
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([])
  const [equivalencias, setEquivalencias] = useState<Equivalencia[]>([])

  // Nuevos registros
  const [nuevoIdent, setNuevoIdent] = useState({ tipo: 'otro', valor: '' })
  const [nuevaUbic, setNuevaUbic] = useState({ nombre: '', id_sap: '' })
  const [nuevaEquiv, setNuevaEquiv] = useState({ id_cliente: '', sku_interno: '', descripcion_cliente: '', um_cliente: '', um_sigma: '', factor_conv: '1' })
  const [skuSearch, setSkuSearch] = useState('')
  const [skuResults, setSkuResults] = useState<{ sku: string; descripcion: string }[]>([])

  useEffect(() => { cargarDatos() }, [id])

  async function cargarDatos() {
    setLoading(true)
    const [{ data: c }, { data: ids }, { data: ubs }, { data: eqs }] = await Promise.all([
      supabase.from('oya_clientes').select('*').eq('id', id).single(),
      supabase.from('oya_cliente_identifiers').select('*').eq('cliente_id', id).order('tipo'),
      supabase.from('oya_ubicaciones').select('*').eq('cliente_id', id).eq('activo', true).order('nombre'),
      supabase.from('oya_equivalencias').select('*, oya_skus(descripcion)').eq('cliente_id', id).order('id_cliente'),
    ])
    if (c) {
      setCliente(c)
      setNombre(c.nombre || '')
      setRazonSocial(c.razon_social || '')
      setRfcEmisor(c.cadena || '') // RFC guardado en campo cadena
      setCentro(c.centro || '')
      setAlmacen(c.almacen || '')
      setNotas(c.notas || '')
    }
    setIdentifiers((ids || []) as ClienteIdentifier[])
    setUbicaciones((ubs || []) as Ubicacion[])
    setEquivalencias((eqs || []) as any[])
    setLoading(false)
  }

  async function guardarDatos() {
    setGuardando(true)
    const { error } = await supabase.from('oya_clientes').update({
      nombre, razon_social: razonSocial || null,
      cadena: rfcEmisor || null,
      centro: centro || null, almacen: almacen || null, notas: notas || null,
    }).eq('id', id)
    if (error) toast.error('Error guardando')
    else toast.success('Datos actualizados')
    setGuardando(false)
  }

  // Identificadores
  async function agregarIdent() {
    if (!nuevoIdent.valor.trim()) return
    const { data, error } = await supabase.from('oya_cliente_identifiers')
      .insert({ cliente_id: id, tipo: nuevoIdent.tipo, valor: nuevoIdent.valor.trim() }).select().single()
    if (!error && data) { setIdentifiers(prev => [...prev, data as ClienteIdentifier]); setNuevoIdent({ tipo: 'otro', valor: '' }); toast.success('Identificador agregado') }
  }
  async function eliminarIdent(identId: string) {
    await supabase.from('oya_cliente_identifiers').delete().eq('id', identId)
    setIdentifiers(prev => prev.filter(i => i.id !== identId))
  }

  // Ubicaciones
  async function agregarUbicacion() {
    if (!nuevaUbic.nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    const { data, error } = await supabase.from('oya_ubicaciones')
      .insert({ cliente_id: id, nombre: nuevaUbic.nombre.trim(), id_sap: nuevaUbic.id_sap.trim() || null }).select().single()
    if (!error && data) { setUbicaciones(prev => [...prev, data as Ubicacion]); setNuevaUbic({ nombre: '', id_sap: '' }); toast.success('Ubicación agregada') }
    else toast.error('Error agregando ubicación')
  }
  async function actualizarIdSap(ubicId: string, idSap: string) {
    setUbicaciones(prev => prev.map(u => u.id === ubicId ? { ...u, id_sap: idSap } : u))
    await supabase.from('oya_ubicaciones').update({ id_sap: idSap || null }).eq('id', ubicId)
  }
  async function eliminarUbicacion(ubicId: string) {
    if (!confirm('¿Eliminar esta ubicación?')) return
    await supabase.from('oya_ubicaciones').update({ activo: false }).eq('id', ubicId)
    setUbicaciones(prev => prev.filter(u => u.id !== ubicId))
  }

  // SKU search para equivalencias
  async function buscarSKU(q: string) {
    setSkuSearch(q)
    if (q.length < 2) { setSkuResults([]); return }

    // Búsqueda directa por código SKU
    const { data: porSku } = await supabase.from('oya_skus')
      .select('sku, descripcion').ilike('sku', `%${q}%`).eq('activo', true).limit(4)

    // Búsqueda semántica por descripción
    const { generarQuerysPorDescripcion } = await import('@/lib/search')
    const queries = generarQuerysPorDescripcion(q)
    const encontrados = new Map<string, any>()
    porSku?.forEach((s: any) => encontrados.set(s.sku, s))

    for (const query of queries.slice(0, 4)) {
      if (encontrados.size >= 8) break
      const { data: porDesc } = await supabase.from('oya_skus')
        .select('sku, descripcion').ilike('descripcion', `%${query}%`).eq('activo', true).limit(6)
      porDesc?.forEach((s: any) => { if (!encontrados.has(s.sku)) encontrados.set(s.sku, s) })
    }
    setSkuResults(Array.from(encontrados.values()).slice(0, 8))
  }

  // Equivalencias
  async function agregarEquivalencia() {
    if (!nuevaEquiv.id_cliente.trim() || !nuevaEquiv.sku_interno.trim()) { toast.error('ID cliente y SKU son obligatorios'); return }
    const factor = parseFloat(nuevaEquiv.factor_conv) || 1
    const { data, error } = await supabase.from('oya_equivalencias')
      .upsert({
        cliente_id: id,
        id_cliente: nuevaEquiv.id_cliente.trim().toUpperCase(),
        sku_interno: nuevaEquiv.sku_interno.trim(),
        descripcion_cliente: nuevaEquiv.descripcion_cliente || null,
        um_cliente: nuevaEquiv.um_cliente || null,
        um_sigma: nuevaEquiv.um_sigma || null,
        factor_conv: factor !== 1 ? factor : null,
      }, { onConflict: 'cliente_id,id_cliente' }).select('*, oya_skus(descripcion)').single()
    if (!error && data) {
      setEquivalencias(prev => {
        const idx = prev.findIndex(e => e.id_cliente === (data as any).id_cliente)
        return idx >= 0 ? prev.map((e, i) => i === idx ? data as any : e) : [...prev, data as any]
      })
      setNuevaEquiv({ id_cliente: '', sku_interno: '', descripcion_cliente: '', um_cliente: '', um_sigma: '', factor_conv: '1' })
      setSkuSearch('')
      toast.success('Equivalencia guardada')
    }
  }
  async function eliminarEquivalencia(eqId: string) {
    await supabase.from('oya_equivalencias').delete().eq('id', eqId)
    setEquivalencias(prev => prev.filter(e => e.id !== eqId))
  }
  async function actualizarEquivalencia(eqId: string, campo: string, valor: any) {
    setEquivalencias(prev => prev.map(e => e.id === eqId ? { ...e, [campo]: valor } : e))
    await supabase.from('oya_equivalencias').update({ [campo]: valor || null }).eq('id', eqId)
  }

  if (loading) return <div style={{ padding: '48px', color: 'var(--text-muted)' }}>Cargando...</div>
  if (!cliente) return <div style={{ color: 'var(--danger)' }}>Cadena no encontrada</div>

  return (
    <div className="animate-fade-in" style={{ maxWidth: '820px' }}>
      <Link href="/clientes" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none', marginBottom: '20px' }}>
        <ArrowLeft size={14} /> Volver a cadenas
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
        <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(14,165,233,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Building2 size={20} color="var(--accent)" />
        </div>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '700' }}>{cliente.nombre}</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {identifiers.length} identificadores · {ubicaciones.length} ubicaciones · {equivalencias.length} equivalencias
          </p>
        </div>
      </div>

      {/* ── Datos básicos ── */}
      <Section title="Datos de la cadena">
        <div style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Nombre *" value={nombre} onChange={setNombre} />
            <Field label="Razón social" value={razonSocial} onChange={setRazonSocial} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Field label="RFC del emisor" value={rfcEmisor} onChange={v => setRfcEmisor(v.toUpperCase())} mono />
            <Field label="Centro SAP" value={centro} onChange={setCentro} />
            <Field label="Almacén SAP" value={almacen} onChange={setAlmacen} />
          </div>
          <Field label="Notas" value={notas} onChange={setNotas} />
        </div>
        <button onClick={guardarDatos} disabled={guardando} style={btnStyle('primary')}>
          <Save size={14} /> {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </Section>

      {/* ── Identificadores ── */}
      <Section title="Identificadores de reconocimiento" subtitle="Usados para detectar automáticamente las OCs de esta cadena">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {identifiers.map(id => (
            <div key={id.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--accent)', background: 'rgba(14,165,233,0.1)', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                {TIPO_LABEL[id.tipo] || id.tipo}
              </span>
              <span style={{ flex: 1, fontSize: '13px', fontFamily: id.tipo.includes('rfc') ? 'monospace' : 'inherit' }}>{id.valor}</span>
              <button onClick={() => eliminarIdent(id.id)} style={iconBtn}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ width: '140px' }}>
            <label style={labelStyle}>Tipo</label>
            <select value={nuevoIdent.tipo} onChange={e => setNuevoIdent(p => ({ ...p, tipo: e.target.value }))} style={{ fontSize: '13px' }}>
              {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Valor</label>
            <input value={nuevoIdent.valor} onChange={e => setNuevoIdent(p => ({ ...p, valor: e.target.value }))} onKeyDown={e => e.key === 'Enter' && agregarIdent()} placeholder="Ej: platoexpress.com" style={{ fontSize: '13px' }} />
          </div>
          <button onClick={agregarIdent} style={btnStyle('secondary')}><Plus size={14} /></button>
        </div>
      </Section>

      {/* ── Ubicaciones ── */}
      <Section title="Ubicaciones / Comedores" subtitle="Cada comedor tiene su ID SAP para usarlo al capturar en VA01">
        {ubicaciones.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
            <thead>
              <tr style={{ background: 'var(--bg-primary)' }}>
                {['Comedor / Ubicación', 'ID SAP', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '12px', color: 'var(--text-muted)', fontWeight: '500' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ubicaciones.map(u => (
                <tr key={u.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontSize: '14px', fontWeight: '500' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <MapPin size={13} color="var(--text-muted)" />
                      {u.nombre}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <input
                      value={u.id_sap || ''}
                      onChange={e => actualizarIdSap(u.id, e.target.value)}
                      onBlur={e => actualizarIdSap(u.id, e.target.value)}
                      placeholder="ID SAP"
                      style={{ fontSize: '13px', fontFamily: 'monospace', width: '140px', padding: '4px 8px',
                        borderColor: !u.id_sap ? 'var(--warning)' : 'var(--border)' }}
                    />
                    {!u.id_sap && <span style={{ fontSize: '11px', color: 'var(--warning)', marginLeft: '6px' }}>Pendiente</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button onClick={() => eliminarUbicacion(u.id)} style={iconBtn}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Nombre del comedor</label>
            <input value={nuevaUbic.nombre} onChange={e => setNuevaUbic(p => ({ ...p, nombre: e.target.value }))} placeholder="Ej: Borgwarner, NEMAK SALTILLO" style={{ fontSize: '13px' }} />
          </div>
          <div style={{ width: '150px' }}>
            <label style={labelStyle}>ID SAP</label>
            <input value={nuevaUbic.id_sap} onChange={e => setNuevaUbic(p => ({ ...p, id_sap: e.target.value }))} placeholder="Ej: 100012345" style={{ fontSize: '13px', fontFamily: 'monospace' }} />
          </div>
          <button onClick={agregarUbicacion} style={btnStyle('secondary')}><Plus size={14} /></button>
        </div>
      </Section>

      {/* ── Equivalencias ── */}
      <Section title="Equivalencias de producto" subtitle="ID del cliente → SKU interno con unidades de medida y conversión">
        {/* Tabla de equivalencias existentes */}
        {equivalencias.length > 0 && (
          <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  {['ID Cliente', 'SKU Interno', 'UM Cliente', 'UM Sigma', 'Factor', ''].map(h => (
                    <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px', color: 'var(--text-muted)', fontWeight: '500', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {equivalencias.map((eq: any) => (
                  <tr key={eq.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>{eq.id_cliente}</td>
                    <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: '13px', color: 'var(--accent)' }}>{eq.sku_interno}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <select value={eq.um_cliente || ''} onChange={e => actualizarEquivalencia(eq.id, 'um_cliente', e.target.value)}
                        style={{ fontSize: '12px', padding: '3px 6px', width: '80px' }}>
                        <option value="">—</option>
                        {UMS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <select value={eq.um_sigma || ''} onChange={e => actualizarEquivalencia(eq.id, 'um_sigma', e.target.value)}
                        style={{ fontSize: '12px', padding: '3px 6px', width: '80px' }}>
                        <option value="">—</option>
                        {UMS.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <input type="number" step="0.001" value={eq.factor_conv || 1}
                        onChange={e => actualizarEquivalencia(eq.id, 'factor_conv', parseFloat(e.target.value) || null)}
                        style={{ fontSize: '12px', width: '70px', textAlign: 'right', padding: '3px 6px' }} />
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                      <button onClick={() => eliminarEquivalencia(eq.id)} style={iconBtn}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Agregar equivalencia */}
        <div style={{ background: 'var(--bg-primary)', borderRadius: '8px', padding: '14px', border: '1px solid var(--border)' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px', fontWeight: '500' }}>Nueva equivalencia</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <Field label="ID del cliente" value={nuevaEquiv.id_cliente} onChange={v => setNuevaEquiv(p => ({ ...p, id_cliente: v }))} placeholder="Ej: 8666SIG" mono />
            <div style={{ position: 'relative' }}>
              <label style={labelStyle}>SKU Interno</label>
              <input value={skuSearch} onChange={e => buscarSKU(e.target.value)} placeholder="Buscar SKU..." style={{ fontSize: '13px' }} />
              {nuevaEquiv.sku_interno && (
                <div style={{ fontSize: '12px', color: 'var(--success)', marginTop: '3px', fontFamily: 'monospace' }}>
                  ✓ {nuevaEquiv.sku_interno}
                </div>
              )}
              {skuResults.length > 0 && !nuevaEquiv.sku_interno && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
                  {skuResults.map(s => (
                    <div key={s.sku} onClick={() => { setNuevaEquiv(p => ({ ...p, sku_interno: s.sku })); setSkuSearch(s.sku); setSkuResults([]) }}
                      style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--border)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ fontFamily: 'monospace', fontWeight: '600', color: 'var(--accent)' }}>{s.sku}</span>
                      <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '12px' }}>{s.descripcion}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '10px', alignItems: 'flex-end' }}>
            <div>
              <label style={labelStyle}>UM Cliente</label>
              <select value={nuevaEquiv.um_cliente} onChange={e => setNuevaEquiv(p => ({ ...p, um_cliente: e.target.value }))} style={{ fontSize: '13px' }}>
                <option value="">— Sin UM —</option>
                {UMS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>UM Sigma</label>
              <select value={nuevaEquiv.um_sigma} onChange={e => setNuevaEquiv(p => ({ ...p, um_sigma: e.target.value }))} style={{ fontSize: '13px' }}>
                <option value="">— Sin UM —</option>
                {UMS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Factor conversión</label>
              <input type="number" step="0.001" value={nuevaEquiv.factor_conv}
                onChange={e => setNuevaEquiv(p => ({ ...p, factor_conv: e.target.value }))}
                style={{ fontSize: '13px', textAlign: 'right' }} />
            </div>
            <Field label="Desc. cliente" value={nuevaEquiv.descripcion_cliente} onChange={v => setNuevaEquiv(p => ({ ...p, descripcion_cliente: v }))} placeholder="Opcional" />
            <button onClick={agregarEquivalencia} style={{ ...btnStyle('primary'), marginTop: '18px' }}><Plus size={14} /> Agregar</button>
          </div>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '600' }}>{title}</h2>
        {subtitle && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{subtitle}</p>}
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, mono }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ fontSize: '13px', fontFamily: mono ? 'monospace' : 'inherit' }} />
    </div>
  )
}

function btnStyle(v: 'primary' | 'secondary') {
  const base = { display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: '600' as const, cursor: 'pointer', marginTop: '14px', transition: 'all 0.15s' }
  return v === 'primary'
    ? { ...base, background: 'var(--accent)', color: 'white' }
    : { ...base, background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border)', marginTop: '0' }
}

const iconBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px' }
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }
