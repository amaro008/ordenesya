'use client'

import { useRef, useState } from 'react'
import { Upload, Loader2, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import { createClient as createBrowserClient } from '@/lib/supabase-browser'

export default function CargaExcelBtn() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [cargando, setCargando] = useState(false)
  const [resultado, setResultado] = useState<{ insertados: number; errores: number } | null>(null)

  function normalizar(str: string) {
    return str.trim().toLowerCase().replace(/\s+/g, '')
  }

  function encontrarColumna(headers: string[], ...posibles: string[]): number {
    for (const p of posibles) {
      const idx = headers.findIndex(h => normalizar(h) === normalizar(p))
      if (idx !== -1) return idx
    }
    return -1
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCargando(true)
    setResultado(null)

    try {
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as string[][]

      if (rows.length < 2) throw new Error('El archivo no tiene datos.')

      const headers = rows[0].map(h => String(h))
      const colSku     = encontrarColumna(headers, 'Sku', 'SKU', 'sku', 'Clave', 'CLAVE', 'codigo', 'Código')
      const colMat     = encontrarColumna(headers, 'Material', 'material', 'Nombre', 'Descripcion', 'Descripción')
      const colFamilia = encontrarColumna(headers, 'Familia', 'familia', 'Categoria', 'Categoría')

      if (colSku === -1) throw new Error('No se encontró columna "Sku". Verifica el encabezado.')
      if (colMat === -1) throw new Error('No se encontró columna "Material". Verifica el encabezado.')

      const skus = rows.slice(1)
        .filter(row => row[colSku] && String(row[colSku]).trim())
        .map(row => ({
          sku:         String(row[colSku]).trim().toUpperCase(),
          descripcion: String(row[colMat] || '').trim(),
          familia:     colFamilia !== -1 ? String(row[colFamilia] || '').trim() || null : null,
          sublinea:    null,
          linea_ventas: null,
          marca:       null,
          activo:      true,
        }))
        .filter(s => s.sku && s.descripcion)

      if (!skus.length) throw new Error('No se encontraron filas válidas.')

      toast.loading(`Cargando ${skus.length} productos...`, { id: 'carga-skus' })

      const supabase = createBrowserClient()
      const BATCH = 500
      let insertados = 0
      let errores = 0

      for (let i = 0; i < skus.length; i += BATCH) {
        const lote = skus.slice(i, i + BATCH)
        const { error } = await supabase
          .from('oya_skus')
          .upsert(lote, { onConflict: 'sku' })

        if (error) errores += lote.length
        else insertados += lote.length
      }

      setResultado({ insertados, errores })
      toast.success(`${insertados} productos cargados correctamente`, { id: 'carga-skus' })

      // Recargar la página para mostrar los datos nuevos
      setTimeout(() => window.location.reload(), 1200)

    } catch (err: any) {
      toast.error(err.message || 'Error cargando el archivo', { id: 'carga-skus' })
    } finally {
      setCargando(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={cargando}
        style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          padding: '9px 16px',
          background: cargando ? 'var(--bg-tertiary)' : 'var(--accent)',
          color: cargando ? 'var(--text-muted)' : 'white',
          border: 'none', borderRadius: '8px',
          fontSize: '14px', fontWeight: '600',
          cursor: cargando ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s',
        }}
      >
        {cargando
          ? <><Loader2 size={15} className="animate-spin" /> Cargando...</>
          : resultado
          ? <><CheckCircle size={15} /> {resultado.insertados} cargados</>
          : <><Upload size={15} /> Cargar Excel</>
        }
      </button>
    </>
  )
}
