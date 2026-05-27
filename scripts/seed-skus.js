// ============================================================
// ORDENESYA — Seed de SKUs desde Excel
// ============================================================
// Uso: node scripts/seed-skus.js ./catalogo.xlsx
//
// Columnas del Excel (por índice):
//   0 = Familia
//   1 = Sublínea
//   2 = Línea de Ventas
//   3 = Marca
//   4 = SKU
//   5 = Descripción (Material)
//
// Requisitos:
//   npm install xlsx @supabase/supabase-js dotenv
//
// Variables de entorno necesarias en .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  ← usa el service role para bypass de RLS
// ============================================================

require('dotenv').config({ path: '.env.local' })
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')

const ARCHIVO_EXCEL = process.argv[2]

if (!ARCHIVO_EXCEL) {
  console.error('❌  Uso: node scripts/seed-skus.js ./tu-catalogo.xlsx')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function seedSKUs() {
  console.log(`\n📂  Leyendo ${ARCHIVO_EXCEL}...`)

  const workbook = XLSX.readFile(path.resolve(ARCHIVO_EXCEL))
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  // Saltar la fila de encabezados
  const dataRows = rows.slice(1).filter((row) => row[4]) // Filtrar filas con SKU

  console.log(`📊  ${dataRows.length} SKUs encontrados`)

  const skus = dataRows.map((row) => ({
    familia:      String(row[0] || '').trim() || null,
    sublinea:     String(row[1] || '').trim() || null,
    linea_ventas: String(row[2] || '').trim() || null,
    marca:        String(row[3] || '').trim() || null,
    sku:          String(row[4] || '').trim().toUpperCase(),
    descripcion:  String(row[5] || '').trim(),
    activo:       true,
  })).filter((s) => s.sku && s.descripcion)

  // Insertar en lotes de 500
  const BATCH_SIZE = 500
  let insertados = 0
  let errores = 0

  for (let i = 0; i < skus.length; i += BATCH_SIZE) {
    const lote = skus.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('oya_skus')
      .upsert(lote, { onConflict: 'sku' })

    if (error) {
      console.error(`❌  Error en lote ${i}-${i + BATCH_SIZE}:`, error.message)
      errores += lote.length
    } else {
      insertados += lote.length
      process.stdout.write(`\r✅  Progreso: ${insertados}/${skus.length} SKUs`)
    }
  }

  console.log(`\n\n✅  Seed completado: ${insertados} SKUs insertados/actualizados, ${errores} errores`)
}

seedSKUs().catch((err) => {
  console.error('❌  Error fatal:', err)
  process.exit(1)
})
