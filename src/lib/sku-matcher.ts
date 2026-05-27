// ============================================================
// ORDENESYA — Lógica de matching de SKUs
// ============================================================
// Jerarquía de resolución:
//   1. Equivalencias del cliente (más confiable)
//   2. Match exacto en catálogo
//   3. Strip de prefijos/sufijos conocidos (SIG, FSV, RY, etc.)
//   4. Conflicto → revisión manual
//
// Patrones observados en OCs reales:
//   SIG8912 (prefijo), 8666SIG (sufijo), 8964RY (sufijo),
//   SIG7708B (prefijo+sufijo), 10779SIG (sufijo), 66 (solo número)
// ============================================================

import { createClient } from './supabase'
import type { DetalleOrden, GeminiLinea, MetodoResolucion } from '@/types'

// Afijos conocidos basados en OCs reales de clientes
const AFIJOS_CONOCIDOS = ['SIG', 'FSV', 'MPE', 'CH', 'REC', 'RY', 'RA']
// Nota: 'B' omitido intencionalmente — demasiado genérico, causa falsos positivos

export function stripAfijos(sku: string): string[] {
  const candidatos: string[] = []
  const s = sku.trim().toUpperCase()

  // Strip sufijo: 8666SIG → 8666, 8964RY → 8964
  for (const afijo of AFIJOS_CONOCIDOS) {
    if (s.endsWith(afijo) && s.length > afijo.length) {
      candidatos.push(s.slice(0, s.length - afijo.length).trim())
    }
  }

  // Strip prefijo: SIG8912 → 8912, SIG7708B → 7708B
  for (const afijo of AFIJOS_CONOCIDOS) {
    if (s.startsWith(afijo) && s.length > afijo.length) {
      candidatos.push(s.slice(afijo.length).trim())
    }
  }

  // Strip prefijo Y sufijo: SIG7708RA → 7708
  for (const pre of AFIJOS_CONOCIDOS) {
    if (s.startsWith(pre)) {
      const sinPre = s.slice(pre.length)
      for (const suf of AFIJOS_CONOCIDOS) {
        if (sinPre.endsWith(suf) && sinPre.length > suf.length) {
          candidatos.push(sinPre.slice(0, sinPre.length - suf.length).trim())
        }
      }
    }
  }

  return [...new Set(candidatos)].filter(Boolean)
}

// Compatibilidad con llamadas anteriores
export function stripSufijo(sku: string): string {
  return stripAfijos(sku)[0] || sku
}

interface ResultadoMatch {
  sku_interno: string | null
  descripcion: string | null
  metodo: MetodoResolucion | null
  estado: 'resuelto' | 'conflicto'
}

export async function resolverSKU(
  idClienteRaw: string,
  clienteId: string | null
): Promise<ResultadoMatch> {
  const supabase = createClient()
  const idNormalizado = idClienteRaw.trim().toUpperCase()

  // 1. Buscar en equivalencias del cliente primero (más confiable)
  if (clienteId) {
    const { data: equiv } = await supabase
      .from('oya_equivalencias')
      .select('sku_interno, oya_skus(descripcion)')
      .eq('cliente_id', clienteId)
      .ilike('id_cliente', idNormalizado)
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

  // 2. Match exacto en catálogo
  const { data: skuExacto } = await supabase
    .from('oya_skus')
    .select('sku, descripcion')
    .eq('sku', idNormalizado)
    .eq('activo', true)
    .single()

  if (skuExacto) {
    return {
      sku_interno: skuExacto.sku,
      descripcion: skuExacto.descripcion,
      metodo: 'exacto',
      estado: 'resuelto',
    }
  }

  // 3. Strip de prefijos/sufijos — probar todos los candidatos
  const candidatos = stripAfijos(idNormalizado)
  for (const candidato of candidatos) {
    const { data: skuStripped } = await supabase
      .from('oya_skus')
      .select('sku, descripcion')
      .eq('sku', candidato)
      .eq('activo', true)
      .single()

    if (skuStripped) {
      return {
        sku_interno: skuStripped.sku,
        descripcion: skuStripped.descripcion,
        metodo: 'sufijo',
        estado: 'resuelto',
      }
    }
  }

  // 4. Conflicto — requiere revisión manual
  return {
    sku_interno: null,
    descripcion: null,
    metodo: null,
    estado: 'conflicto',
  }
}

// Resolver todas las líneas de una orden
export async function resolverLineasOrden(
  lineas: GeminiLinea[],
  clienteId: string | null
): Promise<Omit<DetalleOrden, 'id' | 'orden_id'>[]> {
  const resultados = await Promise.all(
    lineas.map(async (linea) => {
      const match = await resolverSKU(linea.id_producto_cliente, clienteId)
      return {
        linea_num: linea.linea_num,
        id_cliente_raw: linea.id_producto_cliente,
        sku_interno: match.sku_interno,
        descripcion: match.descripcion,
        cantidad: linea.cantidad,
        unidad_medida: linea.unidad_medida,
        estado_linea: match.estado,
        metodo_resolucion: match.metodo,
        notas_linea: null,
      } as Omit<DetalleOrden, 'id' | 'orden_id'>
    })
  )
  return resultados
}

// Detectar cliente por identificadores extraídos del documento
export async function detectarCliente(
  identificadoresGemini: string[]
): Promise<string | null> {
  if (!identificadoresGemini.length) return null

  const supabase = createClient()

  for (const identificador of identificadoresGemini) {
    if (!identificador?.trim()) continue
    const { data } = await supabase
      .from('oya_cliente_identifiers')
      .select('cliente_id')
      .ilike('valor', `%${identificador.trim()}%`)
      .limit(1)
      .single()

    if (data) return data.cliente_id
  }

  return null
}
