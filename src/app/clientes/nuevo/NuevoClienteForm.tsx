'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'

export default function NuevoClienteForm() {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [centro, setCentro] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [notas, setNotas] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) { toast.error('El nombre es obligatorio'); return }
    setGuardando(true)
    const { data, error } = await supabase.from('oya_clientes').insert({ nombre: nombre.trim(), razon_social: razonSocial || null, centro: centro || null, almacen: almacen || null, notas: notas || null }).select().single()
    if (error) { toast.error('Error creando cliente'); setGuardando(false); return }
    toast.success('Cliente creado')
    router.push(`/clientes/${data.id}`)
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '500px' }}>
      <Link href="/clientes" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none', marginBottom: '20px' }}>
        <ArrowLeft size={14} /> Volver a clientes
      </Link>
      <h1 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '24px' }}>Nuevo cliente</h1>
      <form onSubmit={handleSubmit} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '24px' }}>
        <div style={{ display: 'grid', gap: '16px' }}>
          {[
            { label: 'Nombre comercial *', value: nombre, onChange: setNombre, placeholder: 'Ej: Farmacia San Pedro', required: true },
            { label: 'Razón social', value: razonSocial, onChange: setRazonSocial, placeholder: 'Ej: San Pedro SA de CV' },
          ].map(({ label, value, onChange, placeholder, required }) => (
            <div key={label}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{label}</label>
              <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} />
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Centro SAP</label>
              <input value={centro} onChange={e => setCentro(e.target.value)} placeholder="Ej: 1000" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Almacén SAP</label>
              <input value={almacen} onChange={e => setAlmacen(e.target.value)} placeholder="Ej: 0001" />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>Notas</label>
            <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas internas" />
          </div>
        </div>
        <button type="submit" disabled={guardando} style={{ marginTop: '20px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', background: guardando ? 'var(--bg-tertiary)' : 'var(--accent)', color: guardando ? 'var(--text-muted)' : 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: guardando ? 'not-allowed' : 'pointer' }}>
          <Save size={15} /> {guardando ? 'Guardando...' : 'Crear cliente'}
        </button>
      </form>
    </div>
  )
}
