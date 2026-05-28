// ============================================================
// ORDENESYA — Búsqueda semántica de SKUs
// ============================================================

// Traducción ES→EN para productos de alimentos
const TRADUCCIONES: Record<string, string[]> = {
  'queso':       ['queso', 'cheese', 'quesillo'],
  'leche':       ['leche', 'milk', 'lacteo', 'lácteo'],
  'crema':       ['crema', 'cream', 'sour cream'],
  'mantequilla': ['mantequilla', 'butter', 'margarina'],
  'margarina':   ['margarina', 'butter', 'mantequilla'],
  'yogurt':      ['yogurt', 'yoghurt', 'yoghourt'],
  'yoghurt':     ['yoghurt', 'yogurt', 'yoghourt'],
  'pollo':       ['pollo', 'chicken', 'ave'],
  'pechuga':     ['pechuga', 'chicken', 'pollo', 'breast'],
  'res':         ['res', 'beef', 'carne', 'molida'],
  'cerdo':       ['cerdo', 'pork', 'cochino'],
  'jamon':       ['jamon', 'jamón', 'ham'],
  'jamón':       ['jamón', 'jamon', 'ham'],
  'chorizo':     ['chorizo', 'longaniza', 'sausage'],
  'salchicha':   ['salchicha', 'hotdog', 'frankfurter', 'wiener'],
  'aderezo':     ['aderezo', 'dressing', 'sauce', 'salsa'],
  'oaxaca':      ['oaxaca', 'oaxaqueño'],
  'panela':      ['panela', 'queso panela'],
  'fresco':      ['fresco', 'fresh'],
  'cocido':      ['cocido', 'cooked'],
  'ahumado':     ['ahumado', 'smoked'],
  'rebanado':    ['rebanado', 'sliced'],
  'rallado':     ['rallado', 'shredded', 'rayado'],
  'relleno':     ['relleno', 'stuffed', 'filled'],
  'helado':      ['helado', 'ice cream', 'nieve', 'gelato'],
  'pan':         ['pan', 'bread', 'baguette', 'bolillo'],
  'tortilla':    ['tortilla', 'taco'],
  'salsa':       ['salsa', 'sauce', 'ketchup'],
  'aceite':      ['aceite', 'oil'],
  'vinagre':     ['vinagre', 'vinegar'],
  'mayonesa':    ['mayonesa', 'mayonnaise', 'mayo'],
  'mostaza':     ['mostaza', 'mustard'],
  'chile':       ['chile', 'chili', 'jalapeño', 'pepper'],
}

// Palabras que NO aportan al match (ignorar en búsqueda)
const STOP_WORDS = new Set([
  'DE', 'LA', 'EL', 'EN', 'CON', 'POR', 'Y', 'A', 'AL', 'DEL',
  'LOS', 'LAS', 'UN', 'UNA', 'PARA', 'SIN', 'O', 'E',
  'KG', 'GR', 'GRS', 'LT', 'ML', 'PZA', 'PIEZA', 'CAJA', 'CJA',
  'PAQ', 'PQT', 'BOL', 'BOTE', 'LATA', 'SOBRE', 'BOLSA',
  'FSV', 'SIG', 'MPE', 'CH', 'REC', 'RY', 'RA',
  'CLASICO', 'CLÁSICO', 'ESPECIAL', 'PREMIUM', 'NATURAL',
  'BARRAS', 'BARRA', 'PIEZAS', 'PIEZA', 'PAQUETE', 'CAJA',
])

/** Quita acentos y convierte a mayúsculas */
export function normalizar(texto: string): string {
  return texto
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extrae tokens significativos, priorizando los primeros */
export function extraerTokens(texto: string): string[] {
  const norm = normalizar(texto)
  return norm
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOP_WORDS.has(t))
}

/** Expande un token con sinónimos y traducciones */
export function expandirToken(token: string): string[] {
  const t = token.toLowerCase()
  const tNorm = normalizar(token).toLowerCase()
  const sinonimos = TRADUCCIONES[t] || TRADUCCIONES[tNorm] || []
  return Array.from(new Set([token.toLowerCase(), tNorm, ...sinonimos]))
}

/**
 * Genera estrategias de búsqueda ordenadas por precisión:
 * 1. Búsqueda combinada de los 2 tokens más importantes (AND implícito con ilike múltiple)
 * 2. Token más importante con sinónimos
 * 3. Token secundario con sinónimos
 */
export function generarEstrategiasBusqueda(descripcion: string): string[][] {
  const tokens = extraerTokens(descripcion)
  if (tokens.length === 0) return []

  const estrategias: string[][] = []

  // Estrategia 1: par de tokens principales (más preciso)
  if (tokens.length >= 2) {
    estrategias.push([tokens[0], tokens[1]])
  }

  // Estrategia 2: primer token con expansión
  for (const variante of expandirToken(tokens[0])) {
    estrategias.push([variante])
  }

  // Estrategia 3: segundo token con expansión (si existe)
  if (tokens.length >= 2) {
    for (const variante of expandirToken(tokens[1])) {
      estrategias.push([variante])
    }
  }

  // Estrategia 4: tercer token
  if (tokens.length >= 3) {
    estrategias.push([tokens[2]])
  }

  return estrategias
}

/** Compatibilidad con llamadas anteriores */
export function generarQuerysPorDescripcion(descripcion: string): string[] {
  const tokens = extraerTokens(descripcion)
  return tokens.flatMap(t => expandirToken(t))
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 8)
}
