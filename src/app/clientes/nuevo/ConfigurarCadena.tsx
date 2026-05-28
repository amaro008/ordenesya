'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import {
  ArrowLeft, FileText, CheckCircle, Loader2, Sparkles,
  ChevronRight, X, Save, AlertTriangle, Info,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────
interface OcCargada {
  file: File
  estado: 'pendiente' | 'analizando' | 'listo' | 'error'
  preview?: string // número de OC detectado
}

interface AnalisisCadena {
  nombre_cadena: string
  razon_social: string | null
  rfc_emisor: string | null
  centro: string | null
  almacen: string | null
  formato_skus: string           // descripción del patrón
  identificadores: { tipo: string; valor: string }[]
  comedores: string[]            // ubicaciones detectadas
  ejemplo_skus: string[]         // muestra de códigos encontrados
}

interface IdentificadorEditable {
  tipo: string
  valor: string
}

const MAX_OCS = 3
const TIPO_LABEL: Record<string, string> = {
  nombre_cadena: 'Nombre cadena',
  rfc_emisor:    'RFC emisor',
  nombre_negocio:'Nombre negocio',
  centro_costos: 'Centro costos',
  id_ubicacion:  'ID ubicación',
  rfc:           'RFC',
  otro:          'Otro',
}

// ─── Component ───────────────────────────────────────────────
export default function ConfigurarCadena() {
  const router = useRouter()
  const supabase = createBrowserClient()
  const inputRef = useRef<HTMLInputElement>(null)

  const [ocs, setOcs] = useState<OcCargada[]>([])
  const [analizando, setAnalizando] = useState(false)
  const [analisis, setAnalisis] = useState<AnalisisCadena | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Campos editables post-análisis
  const [nombre, setNombre] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [rfcEmisor, setRfcEmisor] = useState('')
  const [centro, setCentro] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [identificadores, setIdentificadores] = useState<IdentificadorEditable[]>([])

  // ── Manejo de archivos ──────────────────────────────────────
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const nuevas = files
      .filter(f => !ocs.find(o => o.file.name === f.name))
      .slice(0, MAX_OCS - ocs.length)
      .map(f => ({ file: f, estado: 'pendiente' as const }))
    setOcs(prev => [...prev, ...nuevas])
    if (inputRef.current) inputRef.current.value = ''
  }

  function quitarOc(idx: number) {
    setOcs(prev => prev.filter((_, i) => i !== idx))
    setAnalisis(null)
  }

  const puedeAnalizar = ocs.length === MAX_OCS && !analizando && !analisis

  // ── Análisis ────────────────────────────────────────────────
  async function analizarCadena() {
    if (!puedeAnalizar) return
    setAnalizando(true)

    // Marcar todas como "analizando"
    setOcs(prev => prev.map(o => ({ ...o, estado: 'analizando' })))

    try {
      // Convertir archivos a base64
      const archivosB64 = await Promise.all(
        ocs.map(async (oc) => {
          const buf = await oc.file.arrayBuffer()
          return {
            nombre: oc.file.name,
            base64: Buffer.from(buf).toString('base64'),
            mimeType: oc.file.type || 'application/pdf',
          }
        })
      )

      const res = await fetch('/api/clientes/analizar-cadena', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archivos: archivosB64 }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Marcar como listas
      setOcs(prev => prev.map((o, i) => ({
        ...o,
        estado: 'listo',
        preview: data.ocs_procesadas?.[i]?.numero_oc || null,
      })))

      // Pre-llenar campos
      setNombre(data.nombre_cadena || '')
      setRazonSocial(data.razon_social || '')
      setRfcEmisor(data.rfc_emisor || '')
      setCentro(data.centro || '')
      setAlmacen(data.almacen || '')
      setIdentificadores(data.identificadores || [])
      setAnalisis(data)

      toast.success('Análisis completado')
    } catch (err: any) {
      setOcs(prev => prev.map(o => ({ ...o, estado: 'error' })))
      toast.error(err.message || 'Error analizando las OCs')
    } finally {
      setAnalizando(false)
    }
  }

  // ── Guardar ─────────────────────────────────────────────────
  async function guardar() {
    if (!nombre.trim()) { toast.error('El nombre de la cadena es obligatorio'); return }
    setGuardando(true)

    const { data: cliente, error } = await supabase
      .from('oya_clientes')
      .insert({
        nombre: nombre.trim(),
        razon_social: razonSocial || null,
        cadena: rfcEmisor || null,
        centro: centro || null,
        almacen: almacen || null,
        notas: analisis?.formato_skus ? `Formato SKUs: ${analisis.formato_skus}` : null,
      })
      .select().single()

    if (error) { toast.error('Error creando la cadena'); setGuardando(false); return }

    // Guardar identificadores
    const ids = [
      ...(rfcEmisor.trim() ? [{ cliente_id: cliente.id, tipo: 'rfc_emisor', valor: rfcEmisor.trim() }] : []),
      ...identificadores
        .filter(id => id.valor.trim())
        .map(id => ({ cliente_id: cliente.id, tipo: id.tipo, valor: id.valor.trim() })),
    ]

    if (ids.length > 0) {
      await supabase.from('oya_cliente_identifiers').insert(ids)
    }

    toast.success('Cadena configurada correctamente')
    router.push(`/clientes/detalle/${cliente.id}`)
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="animate-fade-in" style={{ maxWidth: '600px' }}>
      <Link href="/clientes" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none', marginBottom: '20px' }}>
        <ArrowLeft size={14} /> Volver
      </Link>

      <h1 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '4px' }}>Configurar formato de cadena</h1>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '28px' }}>
        Carga 3 órdenes de compra de la misma cadena y la IA aprenderá su formato automáticamente.
      </p>

      {/* ── Paso 1: Carga de OCs ── */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '600' }}>
            Órdenes de compra
            <span style={{ marginLeft: '8px', fontSize: '12px', fontWeight: '400', color: 'var(--text-muted)' }}>
              {ocs.length} / {MAX_OCS}
            </span>
          </h2>
          {ocs.length < MAX_OCS && !analisis && (
            <button
              onClick={() => inputRef.current?.click()}
              style={{ fontSize: '13px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}
            >
              + Agregar OC
            </button>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />

        {/* Slots de OCs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
          {Array.from({ length: MAX_OCS }).map((_, idx) => {
            const oc = ocs[idx]
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 14px',
                background: 'var(--bg-secondary)',
                border: `1px solid ${oc?.estado === 'listo' ? 'rgba(34,197,94,0.3)' : oc?.estado === 'error' ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
                borderRadius: '8px',
                transition: 'all 0.2s',
              }}>
                {/* Número de slot */}
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: '700',
                  background: oc?.estado === 'listo' ? 'rgba(34,197,94,0.15)' : 'var(--bg-tertiary)',
                  color: oc?.estado === 'listo' ? 'var(--success)' : 'var(--text-muted)',
                }}>
                  {oc?.estado === 'listo' ? <CheckCircle size={14} /> : idx + 1}
                </div>

                {oc ? (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {oc.file.name}
                      </p>
                      {oc.preview && (
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          OC: {oc.preview}
                        </p>
                      )}
                    </div>

                    {/* Estado */}
                    <div style={{ flexShrink: 0 }}>
                      {oc.estado === 'analizando' && <Loader2 size={15} color="var(--accent)" className="animate-spin" />}
                      {oc.estado === 'listo' && <CheckCircle size={15} color="var(--success)" />}
                      {oc.estado === 'error' && <AlertTriangle size={15} color="var(--danger)" />}
                      {oc.estado === 'pendiente' && !analisis && (
                        <button onClick={() => quitarOc(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  // Slot vacío
                  <div
                    onClick={() => !analisis && inputRef.current?.click()}
                    style={{ flex: 1, fontSize: '13px', color: 'var(--text-muted)', cursor: analisis ? 'default' : 'pointer' }}
                  >
                    {analisis ? '—' : 'Clic para agregar orden de compra'}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Botón analizar */}
        {!analisis && (
          <button
            onClick={analizarCadena}
            disabled={!puedeAnalizar}
            style={{
              width: '100%', padding: '11px',
              background: puedeAnalizar ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: puedeAnalizar ? 'white' : 'var(--text-muted)',
              border: 'none', borderRadius: '8px',
              fontSize: '14px', fontWeight: '600',
              cursor: puedeAnalizar ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              transition: 'all 0.15s',
            }}
          >
            {analizando
              ? <><Loader2 size={16} className="animate-spin" /> Analizando las 3 OCs...</>
              : <><Sparkles size={16} /> {ocs.length < MAX_OCS ? `Carga ${MAX_OCS - ocs.length} OC${MAX_OCS - ocs.length > 1 ? 's' : ''} más para continuar` : 'Analizar y configurar cadena'}</>
            }
          </button>
        )}
      </div>

      {/* ── Paso 2: Resultados del análisis ── */}
      {analisis && (
        <div className="animate-fade-in">

          {/* Header resultado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', marginBottom: '20px' }}>
            <Sparkles size={16} color="var(--success)" />
            <p style={{ fontSize: '13px', color: 'var(--success)', fontWeight: '500' }}>
              Análisis completado — revisa y ajusta los datos antes de guardar
            </p>
          </div>

          {/* Datos de la cadena */}
          <Section title="Datos de la cadena">
            <div style={{ display: 'grid', gap: '14px' }}>
              <Field label="Nombre de la cadena *" value={nombre} onChange={setNombre} placeholder="Arte Di Piatto, Aramark..." />
              <Field label="Razón social" value={razonSocial} onChange={setRazonSocial} />
              <div>
                <label style={labelStyle}>RFC del emisor</label>
                <input value={rfcEmisor} onChange={e => setRfcEmisor(e.target.value.toUpperCase())} style={{ fontFamily: 'monospace' }} placeholder="ADP021022MM0" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Centro SAP" value={centro} onChange={setCentro} placeholder="1000" />
                <Field label="Almacén SAP" value={almacen} onChange={setAlmacen} placeholder="0001" />
              </div>
            </div>
          </Section>

          {/* Identificadores */}
          <Section title="Identificadores de reconocimiento" subtitle="Se usarán para detectar automáticamente las OCs de esta cadena">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
              {identificadores.map((id, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: '7px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--accent)', background: 'rgba(14,165,233,0.1)', padding: '2px 7px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {TIPO_LABEL[id.tipo] || id.tipo}
                  </span>
                  <input
                    value={id.valor}
                    onChange={e => setIdentificadores(prev => prev.map((x, i) => i === idx ? { ...x, valor: e.target.value } : x))}
                    style={{ flex: 1, fontSize: '13px', padding: '4px 8px' }}
                  />
                  <button onClick={() => setIdentificadores(prev => prev.filter((_, i) => i !== idx))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={() => setIdentificadores(prev => [...prev, { tipo: 'otro', valor: '' }])}
              style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              + Agregar identificador manual
            </button>
          </Section>

          {/* Formato de SKUs detectado */}
          {(analisis.formato_skus || analisis.ejemplo_skus?.length > 0) && (
            <Section title="Formato de SKUs detectado">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: analisis.ejemplo_skus?.length ? '12px' : '0' }}>
                <Info size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                  {analisis.formato_skus}
                </p>
              </div>
              {analisis.ejemplo_skus?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {analisis.ejemplo_skus.slice(0, 10).map((sku, i) => (
                    <span key={i} style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '3px 8px', borderRadius: '4px', color: 'var(--accent)' }}>
                      {sku}
                    </span>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Comedores detectados */}
          {analisis.comedores?.length > 0 && (
            <Section title="Comedores detectados" subtitle="Ubicaciones encontradas en las OCs — informativo">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {analisis.comedores.map((c, i) => (
                  <span key={i} style={{ fontSize: '12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                    {c}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* Guardar */}
          <button onClick={guardar} disabled={guardando || !nombre.trim()} style={{
            width: '100%', padding: '12px',
            background: guardando || !nombre.trim() ? 'var(--bg-tertiary)' : 'var(--accent)',
            color: guardando || !nombre.trim() ? 'var(--text-muted)' : 'white',
            border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
            cursor: guardando || !nombre.trim() ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}>
            <Save size={15} />
            {guardando ? 'Guardando...' : 'Guardar cadena'}
          </button>
        </div>
      )}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '14px' }}>
      <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '600' }}>{title}</h2>
        {subtitle && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{subtitle}</p>}
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }
