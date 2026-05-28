// ============================================================
// ORDENESYA — Lógica de matching de SKUs
// Jerarquía: equivalencias → exacto → strip afijos → descripción → conflicto
// ============================================================

import { createClient } from './supabase'
import type { DetalleOrden, GeminiLinea, MetodoResolucion, Ubicacion } from '@/types'

const AFIJOS = ['SIG', 'FSV', 'MPE', 'CH', 'REC', 'RY', 'RA']

export function generarCandidatos(raw: string): string[] {
  const s = raw.trim().toUpperCase()
  const set = new Set<string>([s])

  for (const a of AFIJOS) {
    if (s.endsWith(a) && s.length > a.length) set.add(s.slice(0, s.length - a.length).trim())
    if (s.startsWith(a) && s.length > a.length) set.add(s.slice(a.length).trim())
  }
  for (const pre of AFIJOS) {
    if (s.startsWith(pre)) {
      const sinPre = s.slice(pre.length)
      for (const suf of AFIJOS) {
        if (sinPre.endsWith(suf) && sinPre.length > suf.length)
          set.add(sinPre.slice(0, sinPre.length - suf.length).trim())
      }
    }
  }
  return Array.from(set).filter(Boolean)
}

export function extraerClavesDeDescripcion(descripcion: string): string[] {
  if (!descripcion) return []
  const claves: string[] = []
  const regexClave = /\(?\s*clave\s*[:#]?\s*([A-Z0-9]+)\s*\)?/gi
  let match
  while ((match = regexClave.exec(descripcion)) !== null) claves.push(match[1].trim().toUpperCase())
  const palabras = descripcion.trim().split(/\s+/)
  const ultima = palabras[palabras.length - 1]?.toUpperCase()
  if (ultima && /^[A-Z0-9]{3,12}$/.test(ultima) && ultima !== palabras[0]?.toUpperCase()) claves.push(ultima)
  return Array.from(new Set(claves)).filter(Boolean)
}

async function buscarEnCatalogo(candidatos: string[], supabase: any) {
  for (const c of candidatos) {
    if (!c || c.length < 2) continue
    const { data } = await supabase.from('oya_skus').select('sku, descripcion').eq('sku', c).eq('activo', true).single()
    if (data) return data as { sku: string; descripcion: string }
  }
  return null
}

interface ResultadoMatch {
  sku_interno: string | null
  descripcion: string | null
  metodo: MetodoResolucion | null
  estado: 'resuelto' | 'conflicto'
  um_cliente: string | null
  um_sigma: string | null
  factor_conv: number | null
}

export async function resolverSKU(
  idClienteRaw: string,
  descripcionCliente: string | null,
  clienteId: string | null,
  umDocumento: string | null = null
): Promise<ResultadoMatch> {
  const supabase = createClient()
  const idNorm = idClienteRaw.trim().toUpperCase()

  // 1. Equivalencias del cliente (más confiable — incluye UM)
  if (clienteId) {
    const { data: equiv } = await supabase
      .from('oya_equivalencias')
      .select('sku_interno, um_cliente, um_sigma, factor_conv, oya_skus(descripcion)')
      .eq('cliente_id', clienteId)
      .ilike('id_cliente', idNorm)
      .single()

    if (equiv) {
      return {
        sku_interno: equiv.sku_interno,
        descripcion: (equiv.oya_skus as any)?.descripcion || null,
        metodo: 'equivalencia', estado: 'resuelto',
        um_cliente: equiv.um_cliente || umDocumento,
        um_sigma: equiv.um_sigma,
        factor_conv: equiv.factor_conv,
      }
    }
  }

  // 2+3. Match exacto y strip de afijos
  const candidatos = generarCandidatos(idNorm)
  const matchId = await buscarEnCatalogo(candidatos, supabase)
  if (matchId) {
    return {
      sku_interno: matchId.sku, descripcion: matchId.descripcion,
      metodo: idNorm === matchId.sku ? 'exacto' : 'sufijo', estado: 'resuelto',
      um_cliente: umDocumento, um_sigma: null, factor_conv: null,
    }
  }

  // 4. Clave en descripción
  if (descripcionCliente) {
    for (const clave of extraerClavesDeDescripcion(descripcionCliente)) {
      const match = await buscarEnCatalogo(generarCandidatos(clave), supabase)
      if (match) {
        return {
          sku_interno: match.sku, descripcion: match.descripcion,
          metodo: 'sufijo', estado: 'resuelto',
          um_cliente: umDocumento, um_sigma: null, factor_conv: null,
        }
      }
    }
  }

  return { sku_interno: null, descripcion: null, metodo: null, estado: 'conflicto', um_cliente: umDocumento, um_sigma: null, factor_conv: null }
}

export async function resolverLineasOrden(
  lineas: GeminiLinea[],
  clienteId: string | null
): Promise<Omit<DetalleOrden, 'id' | 'orden_id'>[]> {
  return Promise.all(lineas.map(async linea => {
    const match = await resolverSKU(linea.id_producto_cliente, linea.descripcion_cliente, clienteId, linea.unidad_medida)
    const factor = match.factor_conv || 1
    const cantidadSigma = match.um_sigma ? linea.cantidad * factor : null

    return {
      linea_num: linea.linea_num,
      id_cliente_raw: linea.id_producto_cliente,
      sku_interno: match.sku_interno,
      descripcion: match.descripcion,
      cantidad: linea.cantidad,
      cantidad_sigma: cantidadSigma,
      um_cliente: match.um_cliente || linea.unidad_medida,
      um_sigma: match.um_sigma,
      factor_conv: match.factor_conv,
      precio_unitario: linea.precio_unitario,
      importe: linea.importe,
      unidad_medida: linea.unidad_medida,
      estado_linea: match.estado,
      metodo_resolucion: match.metodo,
      notas_linea: null,
    } as Omit<DetalleOrden, 'id' | 'orden_id'>
  }))
}

export async function detectarCliente(identificadores: string[]): Promise<string | null> {
  if (!identificadores.length) return null
  const supabase = createClient()
  for (const id of identificadores) {
    if (!id?.trim()) continue
    const { data } = await supabase.from('oya_cliente_identifiers').select('cliente_id').ilike('valor', `%${id.trim()}%`).limit(1).single()
    if (data) return data.cliente_id
  }
  return null
}

export async function detectarUbicacion(clienteId: string | null, comedorNombre: string | null): Promise<Ubicacion | null> {
  if (!clienteId || !comedorNombre) return null
  const supabase = createClient()
  const { data } = await supabase
    .from('oya_ubicaciones')
    .select('*')
    .eq('cliente_id', clienteId)
    .ilike('nombre', `%${comedorNombre.trim()}%`)
    .eq('activo', true)
    .limit(1)
    .single()
  return data as Ubicacion | null
}

export function stripSufijo(sku: string): string { return generarCandidatos(sku)[1] || sku }
export function stripAfijos(sku: string): string[] { return generarCandidatos(sku).slice(1) }
