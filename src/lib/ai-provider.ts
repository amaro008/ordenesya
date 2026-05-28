import type { GeminiOrdenResponse } from '@/types'

const SYSTEM_PROMPT = `Eres un sistema experto en interpretar órdenes de compra (OC) de proveedores de alimentos en México.
Devuelve ÚNICAMENTE un JSON válido sin markdown ni explicaciones.

Estructura exacta:
{
  "cliente_detectado": {
    "nombre": "nombre del comedor/unidad/negocio que EMITE la OC (el comprador)",
    "identificadores": ["lista de IDs únicos del cliente: RFC, centro de costos, nombre de unidad, ID proveedor"]
  },
  "numero_oc": "número de OC (MPO XXXX, FOLIO NKSXXXX, etc.) o null",
  "fecha_oc": "YYYY-MM-DD o null",
  "subtotal": 0.0,
  "iva": 0.0,
  "total": 0.0,
  "lineas": [
    {
      "linea_num": 1,
      "id_producto_cliente": "código EXACTO del producto tal como aparece en el documento",
      "descripcion_cliente": "descripción del producto",
      "cantidad": 0.0,
      "precio_unitario": 0.0,
      "importe": 0.0,
      "unidad_medida": "PZA/KG/LT/CJA/PQT/etc"
    }
  ],
  "notas": null
}

== CLIENTE CORRECTO ==
- El PROVEEDOR en el documento es quien vende (SIGMA FOODSERVICE, etc.) — NO es el cliente
- El cliente es quien EMITE/COMPRA: campo COMEDOR, "Nombre de Unidad", membrete del documento
- Identificadores: centro de costos, RFC del cliente, ID de ubicación — NO el folio de OC

== LÍNEAS DE PRODUCTO — MUY IMPORTANTE ==
- La columna de código de producto se llama: "CLAVE ARTICULO", "CLAVE ARTICULOD", "Cód.", "Código", "SKU", "Material", "Referencia"
- Extrae el código TAL COMO APARECE: SIG8912, 8666SIG, 8964RY, SIG7708B, 66, 70060146
- NO confundas el ID cliente SAP, número de proveedor, ni centro de costos con códigos de producto
- Los códigos de producto están en la tabla de líneas del pedido, junto a descripción y cantidad
- Si el código tiene letras como SIG, FSV, RY al inicio o final: inclúyelas tal cual, el sistema las procesará
- Tabla semanal Aramark: suma cantidades de todos los días

== TOTALES ==
- Extrae subtotal, IVA y total del documento si aparecen
- Usa punto decimal, no coma: 1625.00 no 1,625.00
- Si no aparece un valor usa 0

Extrae TODAS las líneas de productos sin omitir ninguna.`

function parseJson(text: string): GeminiOrdenResponse {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(clean) as GeminiOrdenResponse
  } catch {
    throw new Error('La IA devolvió una respuesta que no es JSON válido')
  }
}

async function interpretarConGemini(base64: string, mimeType: string): Promise<GeminiOrdenResponse> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-pro' })
  const result = await model.generateContent([
    { inlineData: { mimeType, data: base64 } },
    { text: `${SYSTEM_PROMPT}\n\nAnaliza este documento:` },
  ])
  return parseJson(result.response.text())
}

async function interpretarConClaude(base64: string, mimeType: string): Promise<GeminiOrdenResponse> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const isPdf = mimeType === 'application/pdf'
  type CB = { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
           | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'|'image/png'|'image/webp'|'image/gif'; data: string } }
           | { type: 'text'; text: string }
  const mediaBlock: CB = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: base64 } }
  const message = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [mediaBlock, { type: 'text', text: 'Analiza este documento:' }] as any }],
  })
  const block = message.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Claude no devolvió texto')
  return parseJson(block.text)
}

export type AIProvider = 'gemini' | 'claude'

export function getActiveProvider(): AIProvider {
  const cfg = process.env.AI_PROVIDER?.toLowerCase()
  if (cfg === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini'
  if (cfg === 'claude' && process.env.ANTHROPIC_API_KEY) return 'claude'
  if (process.env.GEMINI_API_KEY) return 'gemini'
  if (process.env.ANTHROPIC_API_KEY) return 'claude'
  throw new Error('No hay proveedor de IA. Agrega GEMINI_API_KEY o ANTHROPIC_API_KEY.')
}

export async function interpretarOrdenConIA(base64: string, mimeType: string) {
  const proveedor = getActiveProvider()
  const resultado = proveedor === 'gemini'
    ? await interpretarConGemini(base64, mimeType)
    : await interpretarConClaude(base64, mimeType)
  return { resultado, proveedor }
}

export async function interpretarOrdenConGemini(base64: string, mimeType: string) {
  const { resultado } = await interpretarOrdenConIA(base64, mimeType)
  return resultado
}

export const MIME_TYPES_SOPORTADOS: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
}

export function getMimeType(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
  }
  return map[ext || ''] || null
}
