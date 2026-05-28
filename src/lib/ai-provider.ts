import type { GeminiOrdenResponse } from '@/types'

// Lee el proveedor activo desde BD (oya_configuracion) o fallback a env vars
export async function getProveedorActivo(): Promise<{ provider: 'claude' | 'gemini'; model: string }> {
  try {
    // Intentar leer de Supabase
    const { createClient } = await import('./supabase')
    const supabase = createClient()
    const { data } = await supabase
      .from('oya_configuracion')
      .select('clave, valor')
      .in('clave', ['ai_provider', 'ai_model'])

    const cfg: Record<string, string> = {}
    data?.forEach(r => { cfg[r.clave] = r.valor })

    const provider = (cfg['ai_provider'] || process.env.AI_PROVIDER || 'claude') as 'claude' | 'gemini'
    const model = cfg['ai_model'] ||
      (provider === 'claude'
        ? process.env.CLAUDE_MODEL || 'claude-haiku-4-5'
        : process.env.GEMINI_MODEL || 'gemini-1.5-pro')

    return { provider, model }
  } catch {
    // Fallback a env vars si no hay BD disponible
    const provider = (process.env.AI_PROVIDER || 'claude') as 'claude' | 'gemini'
    const model = provider === 'claude'
      ? process.env.CLAUDE_MODEL || 'claude-haiku-4-5'
      : process.env.GEMINI_MODEL || 'gemini-1.5-pro'
    return { provider, model }
  }
}

// Compatibilidad anterior
export type AIProvider = 'gemini' | 'claude'
export function getActiveProvider(): AIProvider {
  return (process.env.AI_PROVIDER || 'claude') as AIProvider
}

const SYSTEM_PROMPT = `Eres un sistema experto en interpretar órdenes de compra (OC) de proveedores de alimentos en México.
Devuelve ÚNICAMENTE un JSON válido sin markdown ni explicaciones.

ESTRUCTURA EXACTA:
{
  "cadena_detectada": {
    "nombre": "nombre de la empresa/cadena que COMPRA — la del membrete/logo del documento",
    "rfc": "RFC del comprador del membrete o null",
    "identificadores": ["otros identificadores del comprador: dominio de correo, nombre de plataforma"]
  },
  "comedor": "valor del campo COMEDOR del documento (Borgwarner, Navistar, NEMAK SALTILLO, etc.) o null",
  "numero_oc": "MPO XXXX, MPE XXXX, FOLIO NKSXXXX, etc. o null",
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

== DOS BLOQUES DE EMPRESA EN EL DOCUMENTO ==

BLOQUE 1 — MEMBRETE/LOGO (esquina superior izquierda del documento):
→ Es el COMPRADOR — va en "cadena_detectada"
→ Ejemplos reales: "Arte Di Piatto" RFC ADP021022MM0, "Favorite Vegan Food" RFC FVF1607088M2, "Aramark" RFC AME950116SJ1
→ Si el nombre detectado contiene "SIGMA" o "FOODSERVICE" está INCORRECTO — busca el membrete

BLOQUE 2 — Campo "PROVEEDOR" dentro del cuerpo del documento:
→ Es el VENDEDOR: SIGMA FOODSERVICE COMERCIAL S DE R.L DE C.V (RFC CNO930113K12)  
→ IGNORAR COMPLETAMENTE — nunca va en cadena_detectada

COMEDOR = campo "COMEDOR" del documento: Borgwarner, Navistar, Vertiv Apodaca, Lab Griffith

== LÍNEAS DE PRODUCTO ==
- Columnas: "CLAVE ARTICULO", "CLAVE ARTICULOD", "Cód.", "SKU", "Código"
- Extrae el código TAL COMO APARECE: SIG8912, 8666SIG, 8964RY, 66, 70060146, 942SIG, 307
- Tabla semanal Aramark: suma cantidades de todos los días

== TOTALES ==
Punto decimal no coma. Si no aparece usa 0.`

function parseJson(text: string): GeminiOrdenResponse {
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  try { return JSON.parse(clean) as GeminiOrdenResponse }
  catch { throw new Error('La IA devolvió una respuesta que no es JSON válido') }
}

async function interpretarConGemini(base64: string, mimeType: string, model: string): Promise<GeminiOrdenResponse> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const m = genAI.getGenerativeModel({ model })
  const result = await m.generateContent([
    { inlineData: { mimeType, data: base64 } },
    { text: `${SYSTEM_PROMPT}\n\nAnaliza este documento:` },
  ])
  return parseJson(result.response.text())
}

async function interpretarConClaude(base64: string, mimeType: string, model: string): Promise<GeminiOrdenResponse> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const isPdf = mimeType === 'application/pdf'
  type CB =
    | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
    | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg'|'image/png'|'image/webp'|'image/gif'; data: string } }
    | { type: 'text'; text: string }
  const mediaBlock: CB = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: base64 } }
  const message = await client.messages.create({
    model,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [mediaBlock, { type: 'text', text: 'Analiza este documento:' }] as any }],
  })
  const block = message.content.find(b => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('Claude no devolvió texto')
  return parseJson(block.text)
}

export async function interpretarOrdenConIA(base64: string, mimeType: string) {
  const { provider, model } = await getProveedorActivo()
  console.log(`[AI] ${provider} / ${model}`)
  const resultado = provider === 'gemini'
    ? await interpretarConGemini(base64, mimeType, model)
    : await interpretarConClaude(base64, mimeType, model)
  return { resultado, proveedor: provider }
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
