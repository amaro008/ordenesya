'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Upload, FileText, Image, Loader2, CheckCircle, AlertTriangle } from 'lucide-react'

const TIPOS_ACEPTADOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
const MAX_SIZE_MB = 20

export default function NuevaOrdenForm() {
  const router = useRouter()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [progreso, setProgreso] = useState<string | null>(null)

  const handleFile = (file: File) => {
    if (!TIPOS_ACEPTADOS.includes(file.type)) { toast.error('Formato no soportado. Usa PDF, JPG, PNG o WebP.'); return }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) { toast.error(`El archivo supera los ${MAX_SIZE_MB}MB.`); return }
    setArchivo(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  async function procesarOrden() {
    if (!archivo) return
    setProcesando(true)
    try {
      setProgreso('Subiendo documento...')
      const formData = new FormData()
      formData.append('archivo', archivo)
      setProgreso('Interpretando con IA...')
      const res = await fetch('/api/ordenes/procesar', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setProgreso('Validando SKUs...')
      await new Promise(r => setTimeout(r, 400))
      toast.success(`Orden procesada · ${data.lineasResueltas}/${data.totalLineas} líneas resueltas`)
      await fetch('/api/revalidar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: '/dashboard' }) })
      router.push(`/ordenes/revisar/${data.ordenId}`)
    } catch (error: any) {
      toast.error(error.message || 'Error procesando el documento')
      setProcesando(false)
      setProgreso(null)
    }
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '560px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: '700', marginBottom: '4px' }}>Nueva orden</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Sube la OC del cliente — PDF, imagen de WhatsApp o foto</p>
      </div>
      <div
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !procesando && document.getElementById('file-input')?.click()}
        style={{ border: `2px dashed ${dragging ? 'var(--accent)' : archivo ? 'var(--success)' : 'var(--border)'}`, borderRadius: '12px', padding: '48px 24px', textAlign: 'center', cursor: procesando ? 'default' : 'pointer', background: dragging ? 'rgba(14,165,233,0.05)' : 'var(--bg-secondary)', transition: 'all 0.2s', marginBottom: '20px' }}
      >
        <input id="file-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} disabled={procesando} />
        {archivo ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            {archivo.type === 'application/pdf' ? <FileText size={28} color="var(--accent)" /> : <Image size={28} color="var(--accent)" />}
            <div>
              <p style={{ fontWeight: '600', fontSize: '15px', marginBottom: '2px' }}>{archivo.name}</p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{(archivo.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: 'var(--success)', background: 'rgba(34,197,94,0.1)', padding: '4px 10px', borderRadius: '20px' }}>
              <CheckCircle size={12} /> Listo para procesar
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '52px', height: '52px', background: 'rgba(14,165,233,0.1)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Upload size={24} color="var(--accent)" />
            </div>
            <div>
              <p style={{ fontWeight: '600', fontSize: '15px', marginBottom: '4px' }}>Arrastra tu documento aquí</p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>o haz clic para seleccionar</p>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>PDF · JPG · PNG · WebP · HEIC · máx {MAX_SIZE_MB}MB</p>
          </div>
        )}
      </div>
      {procesando && progreso && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: '8px', marginBottom: '16px', fontSize: '14px', color: 'var(--accent)' }}>
          <Loader2 size={16} className="animate-spin" /> {progreso}
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', color: 'var(--warning)' }}>
        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
        <span>Si el cliente no se detecta automáticamente, podrás asignarlo en la siguiente pantalla.</span>
      </div>
      <button onClick={procesarOrden} disabled={!archivo || procesando} style={{ width: '100%', padding: '12px', background: !archivo || procesando ? 'var(--bg-tertiary)' : 'var(--accent)', color: !archivo || procesando ? 'var(--text-muted)' : 'white', border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', cursor: !archivo || procesando ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        {procesando ? <><Loader2 size={17} className="animate-spin" /> Procesando...</> : <><Upload size={17} /> Procesar orden</>}
      </button>
    </div>
  )
}
