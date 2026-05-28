import type { GeminiOrdenResponse } from '@/types'

const SYSTEM_PROMPT = `Eres un sistema experto en interpretar órdenes de compra (OC) de proveedores de alimentos en México.
Devuelve ÚNICAMENTE un JSON válido sin markdown ni explicaciones.

ESTRUCTURA EXACTA:
{
  "cadena_detectada": {
    "nombre": "nombre de la empresa/cadena que EMITE la OC (el emisor del documento: Arte Di Piatto, Aramark, Favorite Vegan Food, etc.)",
    "rfc": "RFC del emisor si aparece en el documento",
    "identificadores": ["otros identificadores del emisor: nombre del sistema, plataforma, etc."]
  },
  "comedor": "nombre del comedor o ubicación específica — campo COMEDOR del documento (Borgwarner, Navistar, Vertiv Apodaca, NEMAK SALTILLO, etc.)",
  "numero_oc": "número de OC (MPO XXXX, MPE XXXX, FOLIO NKSXXXX, etc.) o null",
  "fecha_oc": "YYYY-MM-DD o null",
  "subtotal": 0.0,
  "iva": 0.0,
  "total": 0.0,
  "lineas": [
    {
      "linea_num": 1,
      "id_producto_cliente": "código EXACTO del producto tal como aparece",
      "descripcion_cliente": "descripción del producto",
      "cantidad": 0.0,
      "precio_unitario": 0.0,
      "importe": 0.0,
      "unidad_medida": "PZA/KG/LT/CJA/PQT/etc"
    }
  ],
  "notas": null
}

== REGLA CRÍTICA: DOS NIVELES DE EMPRESA ==
Estos documentos tienen DOS entidades distintas que NO debes confundir:

NIVEL 1 — CADENA/EMISOR (quien emite la OC, el comprador):
- Es la empresa del membrete del documento: Arte Di Piatto, Favorite Vegan Food, Aramark, etc.
- Tiene su propio RFC: ADP021022MM0, FVF1607088M2, AME950116SJ1, etc.
- Va en "cadena_detectada"

NIVEL 2 — COMEDOR/UBICACIÓN (la ubicación específica que recibe el pedido):
- Es el campo "COMEDOR" del documento: Borgwarner, Navistar, Vertiv Apodaca, NEMAK SALTILLO, Lab Griffith
- Es UNA ubicación específica de la cadena
- Va en el campo "comedor"

NIVEL 3 — PROVEEDOR/VENDEDOR (quien RECIBE la OC):
- Es SIGMA FOODSERVICE COMERCIAL S DE R.L DE C.V con RFC CNO930113K12
- Aparece en el campo "PROVEEDOR" del cuerpo del documento
- NUNCA va en cadena_detectada — es el vendedor, no el comprador
- Su RFC CNO930113K12 NO debe aparecer como identificador de la cadena

== LÍNEAS DE PRODUCTO ==
- Columnas: "CLAVE ARTICULO", "CLAVE ARTICULOD", "Cód.", "SKU", "Código"
- Extrae el código TAL COMO APARECE: SIG8912, 8666SIG, 8964RY, 66, 70060146, 942SIG, 307
- NO confundas centros de costos ni IDs de sistema con códigos de producto
- Tabla semanal Aramark: suma cantidades de todos los días

== TOTALES ==
- Extrae subtotal, IVA y total si aparecen
- Punto decimal, no coma: 1625.00 no 1,625.00
- Si no aparece usa 0`

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
  type CB =
    | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
    | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string } }
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
