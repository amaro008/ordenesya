// ============================================================
// ORDENESYA — Capa de abstracción de IA
// ============================================================
// Soporta: Gemini (Google) y Claude (Anthropic)
//
//   AI_PROVIDER=gemini   → usa Gemini 1.5 Pro
//   AI_PROVIDER=claude   → usa Claude Haiku (default)
//
// Auto-detección: si no se define AI_PROVIDER, usa la key
// disponible. Gemini tiene prioridad.
// ============================================================

import type { GeminiOrdenResponse } from '@/types'

// ============================================================
// PROMPT COMPARTIDO
// ============================================================
const SYSTEM_PROMPT = `Eres un sistema experto en interpretar órdenes de compra (OC) de proveedores de alimentos en México.
Tu tarea es extraer la información estructurada de documentos de OC y devolver ÚNICAMENTE un JSON válido sin markdown ni explicaciones.

El JSON debe tener exactamente esta estructura:
{
  "cliente_detectado": {
    "nombre": "nombre del cliente COMPRADOR (ver reglas abajo)",
    "identificadores": ["lista de identificadores únicos: RFC del cliente, nombre de unidad, centro de costos, folio interno, etc."]
  },
  "numero_oc": "número de orden de compra, o null",
  "fecha_oc": "fecha de emisión en formato YYYY-MM-DD, o null",
  "lineas": [
    {
      "linea_num": 1,
      "id_producto_cliente": "código o ID del producto TAL COMO APARECE en el documento, sin modificar",
      "descripcion_cliente": "descripción del producto como aparece en el documento, o null",
      "cantidad": 0.0,
      "unidad_medida": "unidad: PZA, KG, LT, CJA, PQT, etc., o null"
    }
  ],
  "notas": "observaciones relevantes del documento, o null"
}

== REGLA CRÍTICA: IDENTIFICAR AL CLIENTE CORRECTO ==
El documento tiene DOS empresas: el PROVEEDOR (quien vende) y el CLIENTE (quien compra / emite la OC).
TU OBJETIVO ES IDENTIFICAR AL CLIENTE, NO AL PROVEEDOR.

- Campo "COMEDOR": el cliente es ese valor (ej: "Borgwarner", "Vertiv Apodaca", "NAVISTAR")
- Campo "PROVEEDOR": ese es quien vende — el cliente es quien emite el documento
- Documentos Aramark: el cliente es el campo "Nombre de Unidad" (ej: "NEMAK SALTILLO")
- Incluye en identificadores: nombre del comedor, RFC del cliente, nombre de unidad, centro de costos

== CANTIDADES ==
- Números decimales con punto (no coma): 1625.00 no 1,625.00
- Tabla semanal por días (formato Aramark): suma TODOS los días para el total
- Cantidad no clara: usa 0

== CÓDIGOS DE PRODUCTO ==
- Extrae el id_producto_cliente EXACTAMENTE como aparece: SIG8912, 8666SIG, 8964RY, 66, 70060146
- NO modifiques ni normalices el código
- Columnas típicas: "CLAVE ARTICULO", "CLAVE ARTICULOD", "Cód.", "SKU"

== NÚMERO DE OC ==
- Busca: "MPO XXXXXX", "FOLIO: NKSXXXXXXX", "OC-XXXXX"
- Excluye: solicitud web, folio RC, número de página

Extrae TODAS las líneas de productos.`

function parseJsonResponse(text: string): GeminiOrdenResponse {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try {
    return JSON.parse(clean) as GeminiOrdenResponse
  } catch {
    console.error('Error parsing AI response:', text)
    throw new Error('La IA devolvió una respuesta que no es JSON válido')
  }
}

// ============================================================
// PROVEEDOR: GEMINI
// ============================================================
async function interpretarConGemini(
  archivoBase64: string,
  mimeType: string
): Promise<GeminiOrdenResponse> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
  })
  const result = await model.generateContent([
    { inlineData: { mimeType, data: archivoBase64 } },
    { text: `${SYSTEM_PROMPT}\n\nAnaliza este documento y devuelve el JSON:` },
  ])
  return parseJsonResponse(result.response.text())
}

// ============================================================
// PROVEEDOR: CLAUDE (Anthropic)
// ============================================================
async function interpretarConClaude(
  archivoBase64: string,
  mimeType: string
): Promise<GeminiOrdenResponse> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

  const isPdf = mimeType === 'application/pdf'

  // Construir el content block con tipos explícitos para evitar errores de TypeScript
  type ContentBlock =
    | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
    | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; data: string } }
    | { type: 'text'; text: string }

  const mediaBlock: ContentBlock = isPdf
    ? {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: archivoBase64,
        },
      }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: (mimeType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'),
          data: archivoBase64,
        },
      }

  const textBlock: ContentBlock = {
    type: 'text',
    text: 'Analiza este documento de orden de compra y devuelve el JSON estructurado:',
  }

  const message = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [mediaBlock, textBlock] as any,
      },
    ],
  })

  const textResponse = message.content.find((b) => b.type === 'text')
  if (!textResponse || textResponse.type !== 'text') {
    throw new Error('Claude no devolvió respuesta de texto')
  }

  return parseJsonResponse(textResponse.text)
}

// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================
export type AIProvider = 'gemini' | 'claude'

export function getActiveProvider(): AIProvider {
  const configured = process.env.AI_PROVIDER?.toLowerCase()
  if (configured === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini'
  if (configured === 'claude' && process.env.ANTHROPIC_API_KEY) return 'claude'
  if (process.env.GEMINI_API_KEY) return 'gemini'
  if (process.env.ANTHROPIC_API_KEY) return 'claude'
  throw new Error(
    'No hay proveedor de IA configurado. Agrega GEMINI_API_KEY o ANTHROPIC_API_KEY.'
  )
}

export async function interpretarOrdenConIA(
  archivoBase64: string,
  mimeType: string
): Promise<{ resultado: GeminiOrdenResponse; proveedor: AIProvider }> {
  const proveedor = getActiveProvider()
  console.log(`[AI] Usando proveedor: ${proveedor}`)
  const resultado =
    proveedor === 'gemini'
      ? await interpretarConGemini(archivoBase64, mimeType)
      : await interpretarConClaude(archivoBase64, mimeType)
  return { resultado, proveedor }
}

// Compatibilidad con nombre anterior
export async function interpretarOrdenConGemini(
  archivoBase64: string,
  mimeType: string
): Promise<GeminiOrdenResponse> {
  const { resultado } = await interpretarOrdenConIA(archivoBase64, mimeType)
  return resultado
}

export const MIME_TYPES_SOPORTADOS: Record<string, string> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
  'image/heic': 'image/heic',
}

export function getMimeType(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
  }
  return map[ext || ''] || null
}
