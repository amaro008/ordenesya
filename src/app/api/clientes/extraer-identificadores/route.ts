// POST /api/clientes/extraer-identificadores
// Recibe una OC de ejemplo y extrae identificadores del cliente
// NO guarda nada — solo devuelve los datos extraídos para que el usuario confirme

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase'
import { getMimeType } from '@/lib/ai-provider'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'

const PROMPT_IDENTIFICADORES = `Eres un sistema experto en leer órdenes de compra de empresas en México.
Analiza este documento y extrae ÚNICAMENTE la información del CLIENTE (quien compra/emite la OC), NO del proveedor.

Devuelve SOLO un JSON válido sin markdown con esta estructura exacta:
{
  "nombre_cliente": "nombre del comedor, unidad o negocio que emite la OC",
  "razon_social": "razón social del cliente si aparece, o null",
  "identificadores": [
    { "tipo": "nombre_negocio", "valor": "nombre exacto como aparece en el documento" },
    { "tipo": "centro_costos", "valor": "número de centro de costos si aparece" },
    { "tipo": "id_ubicacion",  "valor": "ID de ubicación o número de proveedor asignado" },
    { "tipo": "rfc",           "valor": "RFC del cliente si aparece" }
  ]
}

Tipos válidos: nombre_negocio, centro_costos, id_ubicacion, rfc, otro

Reglas:
- El campo COMEDOR o "Nombre de Unidad" es el cliente — úsalo como nombre_cliente
- El PROVEEDOR en el documento es quien RECIBE la OC (no es el cliente)
- Incluye TODOS los identificadores únicos que encuentres
- NO incluyas el folio/número de OC como identificador (eso es del pedido, no del cliente)
- NO incluyas datos del proveedor
- Si no encuentras un valor, omite ese identificador del array`

async function extraerConGemini(base64: string, mimeType: string) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-1.5-pro' })
  const result = await model.generateContent([
    { inlineData: { mimeType, data: base64 } },
    { text: PROMPT_IDENTIFICADORES },
  ])
  return result.response.text()
}

async function extraerConClaude(base64: string, mimeType: string) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const isPdf = mimeType === 'application/pdf'

  const mediaBlock: any = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }

  const message = await client.messages.create({
    model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [mediaBlock, { type: 'text', text: PROMPT_IDENTIFICADORES }] as any,
    }],
  })

  const textBlock = message.content.find(b => b.type === 'text')
  return textBlock && textBlock.type === 'text' ? textBlock.text : ''
}

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

    // Usar el proveedor disponible
    let responseText = ''
    const proveedor = process.env.AI_PROVIDER?.toLowerCase()
    if (proveedor === 'gemini' && process.env.GEMINI_API_KEY) {
      responseText = await extraerConGemini(base64, mimeType)
    } else if (process.env.ANTHROPIC_API_KEY) {
      responseText = await extraerConClaude(base64, mimeType)
    } else if (process.env.GEMINI_API_KEY) {
      responseText = await extraerConGemini(base64, mimeType)
    } else {
      return NextResponse.json({ error: 'No hay proveedor de IA configurado' }, { status: 500 })
    }

    // Limpiar y parsear JSON
    const clean = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(clean)

    // Filtrar identificadores vacíos o nulos
    const identificadores = (parsed.identificadores || [])
      .filter((id: any) => id.valor && String(id.valor).trim())
      .map((id: any) => ({
        tipo: id.tipo || 'otro',
        valor: String(id.valor).trim(),
      }))

    return NextResponse.json({
      nombre_cliente: parsed.nombre_cliente || null,
      razon_social: parsed.razon_social || null,
      identificadores,
    })
  } catch (error: any) {
    console.error('Error extrayendo identificadores:', error)
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
  }
}
