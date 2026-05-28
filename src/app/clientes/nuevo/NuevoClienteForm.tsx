'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import { ArrowLeft, Save, Upload, Loader2, CheckCircle, X } from 'lucide-react'
import Link from 'next/link'

interface IdentificadorExtraido {
  tipo: string
  valor: string
  seleccionado: boolean
}

export default function NuevoClienteForm() {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [centro, setCentro] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [notas, setNotas] = useState('')

  // OC de ejemplo
  const [procesandoOC, setProcesandoOC] = useState(false)
  const [identificadores, setIdentificadores] = useState<IdentificadorExtraido[]>([])
  const [ocProcesada, setOcProcesada] = useState(false)

  async function handleOCUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProcesandoOC(true)
    setIdentificadores([])

    try {
      const formData = new FormData()
      formData.append('archivo', file)

      const res = await fetch('/api/clientes/extraer-identificadores', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Pre-llenar nombre si está vacío
      if (!nombre && data.nombre_cliente) setNombre(data.nombre_cliente)
      if (!razonSocial && data.razon_social) setRazonSocial(data.razon_social)

      // Mapear identificadores extraídos
      const idents: IdentificadorExtraido[] = (data.identificadores || []).map((id: any) => ({
        tipo: id.tipo,
        valor: id.valor,
        seleccionado: true,
      }))

      setIdentificadores(idents)
      setOcProcesada(true)
      toast.success(`${idents.length} identificadores extraídos de la OC`)
    } catch (err: any) {
      toast.error(err.message || 'Error procesando la OC')
    } finally {
      setProcesandoOC(false)
    }
  }

  function toggleIdentificador(idx: number) {
    setIdentificadores(prev =>
      prev.map((id, i) => i === idx ? { ...id, seleccionado: !id.seleccionado } : id)
    )
  }

  function eliminarIdentificador(idx: number) {
    setIdentificadores(prev => prev.filter((_, i) => i !== idx))
  }

  function agregarIdentificadorManual() {
    setIdentificadores(prev => [...prev, { tipo: 'otro', valor: '', seleccionado: true }])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setGuardando(true)

    // Crear cliente
    const { data: cliente, error } = await supabase
      .from('oya_clientes')
      .insert({
        nombre: nombre.trim(),
        razon_social: razonSocial || null,
        centro: centro || null,
        almacen: almacen || null,
        notas: notas || null,
      })
      .select()
      .single()

    if (error) { toast.error('Error creando cliente'); setGuardando(false); return }

    // Guardar identificadores seleccionados
    const idsSeleccionados = identificadores
      .filter(id => id.seleccionado && id.valor.trim())
      .map(id => ({
        cliente_id: cliente.id,
        tipo: id.tipo,
        valor: id.valor.trim(),
      }))

    if (idsSeleccionados.length > 0) {
      await supabase.from('oya_cliente_identifiers').insert(idsSeleccionados)
    }

    toast.success('Cliente creado correctamente')
    router.push(`/clientes/detalle/${cliente.id}`)
  }

  const tipoLabel: Record<string, string> = {
    nombre_negocio: 'Nombre negocio',
    id_ubicacion:   'ID ubicación',
    centro_costos:  'Centro costos',
    rfc:            'RFC',
    otro:           'Otro',
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '560px' }}>
      <Link href="/clientes" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none', marginBottom: '20px' }}>
        <ArrowLeft size={14} /> Volver a clientes
      </Link>

      <h1 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px' }}>Nuevo cliente</h1>

      <form onSubmit={handleSubmit}>
        {/* Datos básicos */}
        <Section title="Datos del cliente">
          <div style={{ display: 'grid', gap: '14px' }}>
            <Field label="Nombre comercial *" value={nombre} onChange={setNombre} placeholder="Ej: NEMAK SALTILLO" />
            <Field label="Razón social" value={razonSocial} onChange={setRazonSocial} placeholder="Ej: ARAMARK MEXICO S DE RL DE CV" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <Field label="Centro SAP" value={centro} onChange={setCentro} placeholder="Ej: 1000" />
              <Field label="Almacén SAP" value={almacen} onChange={setAlmacen} placeholder="Ej: 0001" />
            </div>
            <Field label="Notas" value={notas} onChange={setNotas} placeholder="Notas internas" />
          </div>
        </Section>

        {/* OC de ejemplo */}
        <Section title="OC de ejemplo" subtitle="Sube una OC del cliente para extraer automáticamente sus identificadores">
          <label style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '12px 16px',
            border: `2px dashed ${ocProcesada ? 'var(--success)' : 'var(--border)'}`,
            borderRadius: '8px',
            cursor: procesandoOC ? 'not-allowed' : 'pointer',
            background: ocProcesada ? 'rgba(34,197,94,0.05)' : 'transparent',
            transition: 'all 0.15s',
            fontSize: '14px',
            color: ocProcesada ? 'var(--success)' : 'var(--text-secondary)',
          }}>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={handleOCUpload} disabled={procesandoOC} />
            {procesandoOC
              ? <><Loader2 size={16} className="animate-spin" /> Analizando OC con IA...</>
              : ocProcesada
              ? <><CheckCircle size={16} /> OC procesada — identificadores extraídos</>
              : <><Upload size={16} /> Subir OC de ejemplo (PDF o imagen)</>
            }
          </label>
        </Section>

        {/* Identificadores extraídos */}
        {identificadores.length > 0 && (
          <Section title="Identificadores de reconocimiento" subtitle="El sistema usará estos valores para detectar automáticamente las OCs de este cliente">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
              {identificadores.map((id, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px',
                  background: id.seleccionado ? 'rgba(14,165,233,0.06)' : 'var(--bg-tertiary)',
                  border: `1px solid ${id.seleccionado ? 'rgba(14,165,233,0.25)' : 'var(--border)'}`,
                  borderRadius: '7px',
                  opacity: id.seleccionado ? 1 : 0.5,
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={id.seleccionado}
                    onChange={() => toggleIdentificador(idx)}
                    style={{ width: '15px', height: '15px', flexShrink: 0, cursor: 'pointer' }}
                  />
                  <span style={{
                    fontSize: '11px', fontWeight: '600',
                    color: 'var(--accent)',
                    background: 'rgba(14,165,233,0.1)',
                    padding: '2px 7px', borderRadius: '4px',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    {tipoLabel[id.tipo] || id.tipo}
                  </span>
                  <input
                    value={id.valor}
                    onChange={e => setIdentificadores(prev => prev.map((item, i) => i === idx ? { ...item, valor: e.target.value } : item))}
                    style={{ flex: 1, fontSize: '13px', padding: '4px 8px' }}
                  />
                  <button type="button" onClick={() => eliminarIdentificador(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={agregarIdentificadorManual} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              + Agregar identificador manual
            </button>
          </Section>
        )}

        <button type="submit" disabled={guardando} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          padding: '11px', background: guardando ? 'var(--bg-tertiary)' : 'var(--accent)',
          color: guardando ? 'var(--text-muted)' : 'white',
          border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
          cursor: guardando ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
        }}>
          <Save size={15} />
          {guardando ? 'Guardando...' : 'Crear cliente'}
        </button>
      </form>
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
      <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px' }}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}
