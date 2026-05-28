import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getMimeType } from '@/lib/ai-provider'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT = `Analiza esta orden de compra y extrae información del EMISOR (quien compra/emite la OC).
Devuelve SOLO JSON sin markdown:
{
  "nombre_cadena": "nombre de la empresa emisora del documento (membrete): Arte Di Piatto, Aramark, Favorite Vegan Food, etc.",
  "razon_social": "razón social completa del emisor si aparece, o null",
  "rfc_emisor": "RFC del emisor (ej: ADP021022MM0, FVF1607088M2) o null",
  "comedor": "valor del campo COMEDOR o ubicación específica (Borgwarner, Navistar, etc.) o null",
  "identificadores": [
    { "tipo": "nombre_cadena", "valor": "nombre exacto de la cadena como aparece" },
    { "tipo": "rfc_emisor", "valor": "RFC del emisor" }
  ]
}

REGLAS:
- El EMISOR es quien aparece en el membrete: Arte Di Piatto, Aramark, Favorite Vegan Food
- El PROVEEDOR (SIGMA FOODSERVICE) es el vendedor — NO lo incluyas
- El COMEDOR (Borgwarner, Navistar) es la ubicación — ponlo en "comedor" pero NO en identificadores
- El RFC del emisor es el identificador más importante
- NO incluyas el folio/número de OC como identificador`

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const formData = await request.formData()
    const archivo = formData.get('archivo') as File
    if (!archivo) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const mimeType = getMimeType(archivo.name)
    if (!mimeType) return NextResponse.json({ error: 'Formato no soportado' }, { status: 400 })

    const arrayBuffer = await archivo.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    let responseText = ''

    if (process.env.AI_PROVIDER === 'gemini' && process.env.GEMINI_API_KEY) {
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-pro' })
      const result = await model.generateContent([
        { inlineData: { mimeType, data: base64 } },
        { text: PROMPT },
      ])
      responseText = result.response.text()
    } else if (process.env.ANTHROPIC_API_KEY) {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const isPdf = mimeType === 'application/pdf'
      const message = await client.messages.create({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            isPdf
              ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf' as const, data: base64 } } as any
              : { type: 'image', source: { type: 'base64', media_type: mimeType as any, data: base64 } } as any,
            { type: 'text', text: PROMPT },
          ],
        }],
      })
      const block = message.content.find(b => b.type === 'text')
      responseText = block && block.type === 'text' ? block.text : ''
    } else {
      return NextResponse.json({ error: 'No hay proveedor de IA configurado' }, { status: 500 })
    }

    const clean = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)

    const identificadores = (parsed.identificadores || [])
      .filter((id: any) => id.valor && String(id.valor).trim())
      .map((id: any) => ({ tipo: id.tipo || 'otro', valor: String(id.valor).trim() }))

    return NextResponse.json({
      nombre_cadena: parsed.nombre_cadena || null,
      razon_social: parsed.razon_social || null,
      rfc_emisor: parsed.rfc_emisor || null,
      comedor: parsed.comedor || null,
      identificadores,
    })
  } catch (error: any) {
    console.error('Error extrayendo identificadores:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
