'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import toast from 'react-hot-toast'
import { Loader2, Zap } from 'lucide-react'

export default function PaginaRegistro() {
  const router = useRouter()
  const supabase = createBrowserClient()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { nombre } } })
    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Cuenta creada. Verifica tu correo.')
    router.push('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '380px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <div style={{ width: '36px', height: '36px', background: 'var(--accent)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={20} color="white" />
            </div>
            <span style={{ fontSize: '22px', fontWeight: '700', letterSpacing: '-0.5px' }}>ordenesya</span>
          </div>
        </div>

        <form onSubmit={handleRegister} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '28px' }}>
          <h1 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '24px' }}>Crear cuenta</h1>
          {[
            { label: 'Nombre completo', value: nombre, onChange: setNombre, type: 'text', placeholder: 'Tu nombre' },
            { label: 'Correo electrónico', value: email, onChange: setEmail, type: 'email', placeholder: 'asesor@empresa.com' },
            { label: 'Contraseña', value: password, onChange: setPassword, type: 'password', placeholder: 'Mínimo 8 caracteres' },
          ].map(({ label, value, onChange, type, placeholder }) => (
            <div key={label} style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '6px' }}>{label}</label>
              <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required />
            </div>
          ))}
          <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px', background: loading ? 'var(--bg-tertiary)' : 'var(--accent)', color: loading ? 'var(--text-muted)' : 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', marginTop: '20px' }}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Iniciar sesión</Link>
        </p>
      </div>
    </div>
  )
}
