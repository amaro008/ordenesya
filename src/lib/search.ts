// ============================================================
// ORDENESYA — Búsqueda semántica de SKUs
// Normaliza texto, maneja variantes ortográficas y busca por tokens
// ============================================================

// Mapa de variantes ortográficas comunes en productos de alimentos
const VARIANTES: Record<string, string[]> = {
  'yogurt':   ['yoghurt', 'yogurt', 'yoghourt'],
  'yoghurt':  ['yoghurt', 'yogurt', 'yoghourt'],
  'oaxaca':   ['oaxaca', 'oaxaqueño', 'oaxaqueña'],
  'jalapeno': ['jalapeño', 'jalapeno', 'chile'],
  'chile':    ['chile', 'chili', 'jalapeño', 'chiles'],
  'limon':    ['limón', 'limon', 'lime'],
  'leche':    ['leche', 'lacteo', 'lácteo'],
  'queso':    ['queso', 'cheese'],
  'pollo':    ['pollo', 'chicken', 'pechuga'],
  'pechuga':  ['pechuga', 'pollo', 'chicken'],
  'res':      ['res', 'carne', 'beef', 'molida'],
  'cerdo':    ['cerdo', 'pork', 'cochino', 'chancho'],
  'chorizo':  ['chorizo', 'longaniza'],
  'jamon':    ['jamón', 'jamon', 'ham'],
  'jamón':    ['jamón', 'jamon', 'ham'],
  'crema':    ['crema', 'cream'],
  'mantequilla': ['mantequilla', 'margarina', 'butter'],
  'margarina':   ['margarina', 'mantequilla'],
  'aderezo':  ['aderezo', 'dressing', 'salsa'],
  'salchicha': ['salchicha', 'hotdog', 'hot dog', 'franks'],
  'hotdog':   ['hotdog', 'hot dog', 'salchicha', 'frankfurter'],
}

// Palabras a ignorar en la búsqueda
const STOP_WORDS = new Set([
  'DE', 'LA', 'EL', 'EN', 'CON', 'POR', 'Y', 'A', 'AL', 'DEL',
  'LOS', 'LAS', 'UN', 'UNA', 'PARA', 'SIN',
  // Unidades y empaques
  'KG', 'GR', 'GRS', 'LT', 'ML', 'PZA', 'PIEZA', 'CAJA', 'CJA',
  'PAQ', 'PQT', 'BOL', 'BOTE', 'LATA', 'SOBRE',
  // Sufijos de cadena
  'FSV', 'SIG', 'MPE', 'CH', 'REC', 'RY', 'RA',
  // Tamaños genéricos  
  '1KG', '2KG', '3KG', '500GR', '250GR', '1LT', '1L',
])

/**
 * Normaliza texto para búsqueda: quita acentos, minúsculas, caracteres especiales
 */
export function normalizar(texto: string): string {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .replace(/[^A-Z0-9\s]/g, ' ')   // quitar especiales
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extrae tokens significativos de un texto
 */
export function extraerTokens(texto: string): string[] {
  const normalizado = normalizar(texto)
  return normalizado
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
    .slice(0, 5)
}

/**
 * Expande un token con sus variantes ortográficas
 */
export function expandirToken(token: string): string[] {
  const t = token.toLowerCase()
  const variantes = VARIANTES[t] || [t]
  // También agregar versión normalizada (sin acentos)
  const sinAcentos = normalizar(token).toLowerCase()
  return Array.from(new Set([...variantes, sinAcentos, token.toLowerCase()]))
}

/**
 * Genera queries de búsqueda para Supabase a partir de una descripción
 * Retorna array de palabras clave ordenadas por relevancia
 */
export function generarQuerysPorDescripcion(descripcion: string): string[] {
  const tokens = extraerTokens(descripcion)
  // Expandir tokens con variantes
  const expandidos = tokens.flatMap(t => expandirToken(t))
  // Deduplicar y ordenar por longitud (palabras más largas = más específicas)
  return Array.from(new Set(expandidos))
    .sort((a, b) => b.length - a.length)
    .slice(0, 8)
}
