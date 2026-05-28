'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'
import { Trash2, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function EliminarCadenaBtn({ id, nombre }: { id: string; nombre: string }) {
  const [eliminando, setEliminando] = useState(false)
  const supabase = createBrowserClient()
  const router = useRouter()

  async function eliminar() {
    if (!confirm(`¿Eliminar la cadena "${nombre}"?\n\nSe eliminarán también sus identificadores y equivalencias de producto. Esta acción no se puede deshacer.`)) return
    setEliminando(true)
    try {
      await supabase.from('oya_equivalencias').delete().eq('cliente_id', id)
      await supabase.from('oya_cliente_identifiers').delete().eq('cliente_id', id)
      const { error } = await supabase.from('oya_clientes').delete().eq('id', id)
      if (error) throw error
      toast.success(`Cadena "${nombre}" eliminada`)
      router.refresh()
    } catch {
      toast.error('Error eliminando la cadena')
    } finally {
      setEliminando(false)
    }
  }

  return (
    <button onClick={eliminar} disabled={eliminando} title="Eliminar cadena"
      style={{ padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', cursor: eliminando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)', transition: 'all 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--danger)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'transparent' }}>
      {eliminando ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
    </button>
  )
}
