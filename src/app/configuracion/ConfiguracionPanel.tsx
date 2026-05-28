'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import {
  Settings, Cpu, Package, Upload, CheckCircle,
  Loader2, ChevronRight, Zap, Brain
} from 'lucide-react'
import * as XLSX from 'xlsx'

// ── Modelos disponibles ───────────────────────────────────────
const MODELOS = [
  {
    provider: 'claude',
    model: 'claude-haiku-4-5',
    nombre: 'Claude Haiku',
    desc: 'Rápido y económico — recomendado para producción',
    icon: '⚡',
    color: '#f59e0b',
  },
  {
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    nombre: 'Claude Sonnet',
    desc: 'Balance entre calidad y costo',
    icon: '✦',
    color: '#a78bfa',
  },
  {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    nombre: 'Gemini 2.0 Flash',
    desc: 'Modelo de Google — requiere GEMINI_API_KEY',
    icon: '◈',
    color: '#22c55e',
  },
]

export default function ConfiguracionPanel() {
  const supabase = createBrowserClient()
  const inputRef = useRef<HTMLInputElement>(null)

  // Estado IA
  const [modeloActivo, setModeloActivo] = useState<string>('claude-haiku-4-5')
  const [guardandoModelo, setGuardandoModelo] = useState(false)
  const [cargandoConfig, setCargandoConfig] = useState(true)

  // Estado catálogo
  const [totalSkus, setTotalSkus] = useState<number>(0)
  const [cargandoSkus, setCargandoSkus] = useState(false)
  const [resultadoCarga, setResultadoCarga] = useState<{ insertados: number; errores: number } | null>(null)

  useEffect(() => {
    cargarConfig()
    cargarTotalSkus()
  }, [])

  async function cargarConfig() {
    try {
      const res = await fetch('/api/configuracion')
      const data = await res.json()
      if (data.ai_model) setModeloActivo(data.ai_model)
    } catch { /* silencioso */ }
    finally { setCargandoConfig(false) }
  }

  async function cargarTotalSkus() {
    const { count } = await supabase
      .from('oya_skus')
      .select('*', { count: 'exact', head: true })
      .eq('activo', true)
    setTotalSkus(count || 0)
  }

  async function cambiarModelo(modelo: typeof MODELOS[0]) {
    setGuardandoModelo(true)
    try {
      const [r1, r2] = await Promise.all([
        fetch('/api/configuracion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clave: 'ai_provider', valor: modelo.provider }),
        }),
        fetch('/api/configuracion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clave: 'ai_model', valor: modelo.model }),
        }),
      ])

      const d1 = await r1.json()
      const d2 = await r2.json()

      if (!r1.ok || !r2.ok) {
        throw new Error(d1.error || d2.error || 'Error guardando')
      }

      setModeloActivo(modelo.model)
      toast.success(`Modelo cambiado a ${modelo.nombre}`)
    } catch (err: any) {
      toast.error(`Error: ${err.message} — Verifica que corriste la migración v4 en Supabase`)
    } finally {
      setGuardandoModelo(false)
    }
  }

  // Carga de catálogo Excel
  function normalizar(s: string) { return s.trim().toLowerCase().replace(/\s+/g, '') }
  function encontrarCol(headers: string[], ...opts: string[]) {
    for (const o of opts) {
      const i = headers.findIndex(h => normalizar(h) === normalizar(o))
      if (i !== -1) return i
    }
    return -1
  }

  async function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCargandoSkus(true)
    setResultadoCarga(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
      if (rows.length < 2) throw new Error('El archivo está vacío')

      const headers = rows[0].map(h => String(h))
      const colSku  = encontrarCol(headers, 'Sku', 'SKU', 'sku', 'Clave', 'CLAVE', 'codigo')
      const colMat  = encontrarCol(headers, 'Material', 'material', 'Nombre', 'Descripcion', 'Descripción')
      const colFam  = encontrarCol(headers, 'Familia', 'familia', 'Categoria', 'Categoría')

      if (colSku === -1) throw new Error('No se encontró columna "Sku"')
      if (colMat === -1) throw new Error('No se encontró columna "Material"')

      const skus = rows.slice(1)
        .filter(r => r[colSku]?.toString().trim())
        .map(r => ({
          sku: String(r[colSku]).trim().toUpperCase(),
          descripcion: String(r[colMat] || '').trim(),
          familia: colFam !== -1 ? String(r[colFam] || '').trim() || null : null,
          sublinea: null, linea_ventas: null, marca: null, activo: true,
        }))
        .filter(s => s.sku && s.descripcion)

      if (!skus.length) throw new Error('No se encontraron filas válidas')

      toast.loading(`Cargando ${skus.length} productos...`, { id: 'carga' })

      let insertados = 0, errores = 0
      const BATCH = 500
      for (let i = 0; i < skus.length; i += BATCH) {
        const { error } = await supabase.from('oya_skus')
          .upsert(skus.slice(i, i + BATCH), { onConflict: 'sku' })
        if (error) errores += Math.min(BATCH, skus.length - i)
        else insertados += Math.min(BATCH, skus.length - i)
      }

      setResultadoCarga({ insertados, errores })
      setTotalSkus(prev => prev + insertados)
      toast.success(`${insertados} productos cargados`, { id: 'carga' })
    } catch (err: any) {
      toast.error(err.message, { id: 'carga' })
    } finally {
      setCargandoSkus(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="animate-fade-in">
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Settings size={20} /> Configuración
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          Ajustes globales de la aplicación — aplican para todos los usuarios
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(400px, 2fr)', gap: '16px', alignItems: 'start' }}>

        {/* ── Columna izquierda: Modelo de IA ── */}
        <Section icon={<Brain size={16} />} title="Modelo de IA" subtitle="Selecciona el modelo que usará la app para interpretar las órdenes de compra">
          {cargandoConfig ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
              <Loader2 size={14} className="animate-spin" /> Cargando configuración...
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {MODELOS.map(m => {
                const activo = modeloActivo === m.model
                return (
                  <button
                    key={m.model}
                    onClick={() => !activo && cambiarModelo(m)}
                    disabled={guardandoModelo}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px',
                      padding: '14px 16px',
                      background: activo ? `${m.color}12` : 'var(--bg-primary)',
                      border: `1.5px solid ${activo ? m.color : 'var(--border)'}`,
                      borderRadius: '9px',
                      cursor: activo ? 'default' : 'pointer',
                      textAlign: 'left', transition: 'all 0.15s', width: '100%',
                    }}
                  >
                    <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0 }}>{m.icon}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: activo ? m.color : 'var(--text-primary)', marginBottom: '2px' }}>
                        {m.nombre}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{m.desc}</p>
                    </div>
                    {activo && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: '600', color: m.color, background: `${m.color}18`, padding: '4px 10px', borderRadius: '20px', flexShrink: 0 }}>
                        <CheckCircle size={12} /> Activo
                      </span>
                    )}
                    {guardandoModelo && !activo && <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                  </button>
                )
              })}
            </div>
          )}
          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
            Para usar Gemini agrega <code style={{ background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: '3px' }}>GEMINI_API_KEY</code> en las variables de entorno de Vercel.
          </p>
        </Section>

        {/* ── Columna derecha: Catálogo de SKUs ── */}
        <Section icon={<Package size={16} />} title="Catálogo de productos" subtitle="Carga o actualiza el catálogo de SKUs desde un archivo Excel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '28px', fontWeight: '700', color: 'var(--text-primary)', lineHeight: 1 }}>
                {totalSkus.toLocaleString()}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>productos en el catálogo</p>
            </div>
            {resultadoCarga && (
              <div style={{ fontSize: '12px', color: 'var(--success)', background: 'rgba(34,197,94,0.1)', padding: '6px 12px', borderRadius: '6px' }}>
                ✓ {resultadoCarga.insertados.toLocaleString()} cargados
                {resultadoCarga.errores > 0 && ` · ${resultadoCarga.errores} errores`}
              </div>
            )}
          </div>

          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleExcel} />

          <button
            onClick={() => inputRef.current?.click()}
            disabled={cargandoSkus}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 16px',
              background: cargandoSkus ? 'var(--bg-tertiary)' : 'var(--accent)',
              color: cargandoSkus ? 'var(--text-muted)' : 'white',
              border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: '600',
              cursor: cargandoSkus ? 'not-allowed' : 'pointer',
            }}
          >
            {cargandoSkus ? <><Loader2 size={14} className="animate-spin" /> Cargando...</> : <><Upload size={14} /> Cargar Excel</>}
          </button>

          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px' }}>
            Columnas requeridas:{' '}
            {['Sku', 'Material', 'Familia'].map(c => (
              <code key={c} style={{ background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: '3px', marginRight: '4px', color: 'var(--accent)' }}>{c}</code>
            ))}
            · Familia es opcional · La carga hace upsert
          </p>
        </Section>

      </div>
    </div>
  )
}


function Section({ icon, title, subtitle, children }: {
  icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '16px' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>
        <div>
          <h2 style={{ fontSize: '15px', fontWeight: '600' }}>{title}</h2>
          {subtitle && <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ padding: '18px' }}>{children}</div>
    </div>
  )
}
