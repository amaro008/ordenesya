// ============================================================
// ORDENESYA — Lógica de matching de SKUs
// ============================================================
// Jerarquía de resolución por línea:
//   1. Equivalencias del cliente
//   2. Match exacto del id_cliente_raw
//   3. Strip de prefijos/sufijos (SIG8912→8912, 8666SIG→8666)
//   4. Extracción de clave desde descripción "(clave 8666)", "(CLAVE 66)"
//   5. Strip de afijos sobre clave extraída de descripción
//   6. Conflicto → revisión manual
// ============================================================

import { createClient } from './supabase'
import type { DetalleOrden, GeminiLinea, MetodoResolucion } from '@/types'

// Afijos conocidos en OCs reales
const AFIJOS = ['SIG', 'FSV', 'MPE', 'CH', 'REC', 'RY', 'RA']

// ============================================================
// Genera todos los candidatos de SKU a partir de un string
// ============================================================
export function generarCandidatos(raw: string): string[] {
  const s = raw.trim().toUpperCase()
  const candidatos = new Set<string>()

  // El valor original siempre es candidato
  candidatos.add(s)

  // Strip sufijo: 8666SIG → 8666
  for (const afijo of AFIJOS) {
    if (s.endsWith(afijo) && s.length > afijo.length) {
      candidatos.add(s.slice(0, s.length - afijo.length).trim())
    }
  }

  // Strip prefijo: SIG8912 → 8912
  for (const afijo of AFIJOS) {
    if (s.startsWith(afijo) && s.length > afijo.length) {
      candidatos.add(s.slice(afijo.length).trim())
    }
  }

  // Strip prefijo + sufijo: SIG7708RA → 7708
  for (const pre of AFIJOS) {
    if (s.startsWith(pre)) {
      const sinPre = s.slice(pre.length)
      for (const suf of AFIJOS) {
        if (sinPre.endsWith(suf) && sinPre.length > suf.length) {
          candidatos.add(sinPre.slice(0, sinPre.length - suf.length).trim())
        }
      }
    }
  }

  return Array.from(candidatos).filter(Boolean)
}

// ============================================================
// Extrae posibles claves escondidas en una descripción
// Ejemplos:
//   "CREMA NORTEÑITA 1 LITRO (clave 8666)"   → ["8666"]
//   "JAMON FSV KILO (CLAVE 66)"               → ["66"]
//   "QUESO AMARILLO CLASICO /104 (CLAVE8915)" → ["8915"]
//   "ADEREZO NACHOS 1KG FSV"                  → ["FSV"] → strip → busca sin FSV
// ============================================================
export function extraerClavesDeDescripcion(descripcion: string): string[] {
  if (!descripcion) return []
  const claves: string[] = []

  // Patrón 1: (clave XXXX) o (CLAVE XXXX) con o sin espacio
  const regexClave = /\(?\s*clave\s*[:#]?\s*([A-Z0-9]+)\s*\)?/gi
  let match
  while ((match = regexClave.exec(descripcion)) !== null) {
    claves.push(match[1].trim().toUpperCase())
  }

  // Patrón 2: el texto termina con un código alfanumérico precedido de espacio
  // Ej: "QUESO PANELA NORTEÑO EN BARRA 3.5 KG SIG7708B"
  const palabras = descripcion.trim().split(/\s+/)
  const ultima = palabras[palabras.length - 1]?.toUpperCase()
  if (ultima && /^[A-Z0-9]{3,12}$/.test(ultima) && ultima !== palabras[0]?.toUpperCase()) {
    claves.push(ultima)
  }

  return Array.from(new Set(claves)).filter(Boolean)
}

// ============================================================
// Busca un SKU en el catálogo probando todos los candidatos
// ============================================================
async function buscarEnCatalogo(
  candidatos: string[],
  supabase: ReturnType<typeof createClient>
): Promise<{ sku: string; descripcion: string } | null> {
  for (const candidato of candidatos) {
    if (!candidato || candidato.length < 2) continue
    const { data } = await supabase
      .from('oya_skus')
      .select('sku, descripcion')
      .eq('sku', candidato)
      .eq('activo', true)
      .single()
    if (data) return data
  }
  return null
}

// ============================================================
// Resolver un SKU individual
// ============================================================
interface ResultadoMatch {
  sku_interno: string | null
  descripcion: string | null
  metodo: MetodoResolucion | null
  estado: 'resuelto' | 'conflicto'
}

export async function resolverSKU(
  idClienteRaw: string,
  descripcionCliente: string | null,
  clienteId: string | null
): Promise<ResultadoMatch> {
  const supabase = createClient()
  const idNorm = idClienteRaw.trim().toUpperCase()

  // 1. Equivalencias del cliente (máxima confianza)
  if (clienteId) {
    const { data: equiv } = await supabase
      .from('oya_equivalencias')
      .select('sku_interno, oya_skus(descripcion)')
      .eq('cliente_id', clienteId)
      .ilike('id_cliente', idNorm)
      .single()

    if (equiv) {
      return {
        sku_interno: equiv.sku_interno,
        descripcion: (equiv.oya_skus as any)?.descripcion || null,
        metodo: 'equivalencia',
        estado: 'resuelto',
      }
    }
  }

  // 2 + 3. Match exacto y strip de afijos sobre el id_cliente_raw
  const candidatosId = generarCandidatos(idNorm)
  const matchId = await buscarEnCatalogo(candidatosId, supabase)
  if (matchId) {
    return {
      sku_interno: matchId.sku,
      descripcion: matchId.descripcion,
      metodo: idNorm === matchId.sku ? 'exacto' : 'sufijo',
      estado: 'resuelto',
    }
  }

  // 4 + 5. Extracción de clave desde la descripción
  if (descripcionCliente) {
    const clavesDesc = extraerClavesDeDescripcion(descripcionCliente)

    for (const claveDesc of clavesDesc) {
      // Candidatos: la clave tal cual + sus variantes con strip de afijos
      const candidatosDesc = generarCandidatos(claveDesc)
      const matchDesc = await buscarEnCatalogo(candidatosDesc, supabase)
      if (matchDesc) {
        return {
          sku_interno: matchDesc.sku,
          descripcion: matchDesc.descripcion,
          metodo: 'sufijo', // sufijo incluye "extraído de descripción"
          estado: 'resuelto',
        }
      }
    }
  }

  // 6. Conflicto
  return {
    sku_interno: null,
    descripcion: null,
    metodo: null,
    estado: 'conflicto',
  }
}

// ============================================================
// Resolver todas las líneas de una orden
// ============================================================
export async function resolverLineasOrden(
  lineas: GeminiLinea[],
  clienteId: string | null
): Promise<Omit<DetalleOrden, 'id' | 'orden_id'>[]> {
  const resultados = await Promise.all(
    lineas.map(async (linea) => {
      const match = await resolverSKU(
        linea.id_producto_cliente,
        linea.descripcion_cliente,
        clienteId
      )
      return {
        linea_num:          linea.linea_num,
        id_cliente_raw:     linea.id_producto_cliente,
        sku_interno:        match.sku_interno,
        descripcion:        match.descripcion,
        cantidad:           linea.cantidad,
        unidad_medida:      linea.unidad_medida,
        estado_linea:       match.estado,
        metodo_resolucion:  match.metodo,
        notas_linea:        null,
      } as Omit<DetalleOrden, 'id' | 'orden_id'>
    })
  )
  return resultados
}

// ============================================================
// Detectar cliente por identificadores del documento
// ============================================================
export async function detectarCliente(
  identificadoresGemini: string[]
): Promise<string | null> {
  if (!identificadoresGemini.length) return null
  const supabase = createClient()

  for (const id of identificadoresGemini) {
    if (!id?.trim()) continue
    const { data } = await supabase
      .from('oya_cliente_identifiers')
      .select('cliente_id')
      .ilike('valor', `%${id.trim()}%`)
      .limit(1)
      .single()
    if (data) return data.cliente_id
  }
  return null
}

// Compatibilidad con llamadas anteriores
export function stripSufijo(sku: string): string {
  return generarCandidatos(sku)[1] || sku
}
export function stripAfijos(sku: string): string[] {
  return generarCandidatos(sku).slice(1)
}
