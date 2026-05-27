// ============================================================
// ORDENESYA — Seed de SKUs desde Excel
// ============================================================
// Uso: node scripts/seed-skus.js ./catalogo.xlsx
//
// Columnas del Excel (por índice o por nombre):
//   - SKU        → código del producto (columna "Sku" o "SKU")
//   - Material   → nombre del producto (columna "Material")
//   - Familia    → categoría (columna "Familia")
//
// Formato soportado:
//   | Sku    | Material                    | Familia   |
//   | 8912   | ADEREZO NACHOS CLASICO 1KG  | ADEREZOS  |
//   | 8666   | CREMA NORTEÑITA 1 LITRO     | LACTEOS   |
//
// Requisitos:
//   npm install xlsx @supabase/supabase-js dotenv
//
// Variables de entorno en .env.local:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// ============================================================

require('dotenv').config({ path: '.env.local' })
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')
const path = require('path')

const ARCHIVO_EXCEL = process.argv[2]

if (!ARCHIVO_EXCEL) {
  console.error('\n❌  Uso: node scripts/seed-skus.js ./tu-catalogo.xlsx\n')
  process.exit(1)
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('\n❌  Faltan variables de entorno. Verifica tu .env.local:\n   NEXT_PUBLIC_SUPABASE_URL\n   SUPABASE_SERVICE_ROLE_KEY\n')
  process.exit(1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Normaliza el nombre de columna para búsqueda flexible
function normalizar(str) {
  return String(str || '').trim().toLowerCase().replace(/\s+/g, '')
}

// Busca el índice de una columna por posibles nombres
function encontrarColumna(headers, ...posibles) {
  for (const posible of posibles) {
    const idx = headers.findIndex(h => normalizar(h) === normalizar(posible))
    if (idx !== -1) return idx
  }
  return -1
}

async function seedSKUs() {
  console.log(`\n📂  Leyendo ${ARCHIVO_EXCEL}...`)

  const workbook = XLSX.readFile(path.resolve(ARCHIVO_EXCEL))
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (rows.length < 2) {
    console.error('❌  El archivo está vacío o no tiene datos.')
    process.exit(1)
  }

  // Detectar columnas por nombre (fila 0 = encabezados)
  const headers = rows[0].map(h => String(h))
  console.log(`📋  Columnas detectadas: ${headers.join(' | ')}`)

  const colSku     = encontrarColumna(headers, 'Sku', 'SKU', 'sku', 'CLAVE', 'Clave', 'codigo', 'Codigo', 'Código')
  const colMat     = encontrarColumna(headers, 'Material', 'material', 'Nombre', 'nombre', 'Descripcion', 'Descripción', 'descripcion')
  const colFamilia = encontrarColumna(headers, 'Familia', 'familia', 'Categoria', 'Categoría', 'categoria', 'Family')

  if (colSku === -1) {
    console.error('❌  No se encontró columna de SKU. Asegúrate de que tenga encabezado "Sku", "SKU" o "Clave".')
    process.exit(1)
  }
  if (colMat === -1) {
    console.error('❌  No se encontró columna de Material. Asegúrate de que tenga encabezado "Material" o "Nombre".')
    process.exit(1)
  }

  console.log(`✅  Columnas mapeadas:`)
  console.log(`     SKU      → columna ${colSku} ("${headers[colSku]}")`)
  console.log(`     Material → columna ${colMat} ("${headers[colMat]}")`)
  if (colFamilia !== -1) {
    console.log(`     Familia  → columna ${colFamilia} ("${headers[colFamilia]}")`)
  } else {
    console.log(`     Familia  → no encontrada (se guardará como null)`)
  }

  const dataRows = rows.slice(1).filter(row => row[colSku] && String(row[colSku]).trim())

  console.log(`\n📊  ${dataRows.length} SKUs encontrados\n`)

  const skus = dataRows.map(row => ({
    sku:         String(row[colSku] || '').trim().toUpperCase(),
    descripcion: String(row[colMat] || '').trim(),
    familia:     colFamilia !== -1 ? String(row[colFamilia] || '').trim() || null : null,
    // Campos heredados — se dejan null con el nuevo formato simplificado
    sublinea:     null,
    linea_ventas: null,
    marca:        null,
    activo:       true,
  })).filter(s => s.sku && s.descripcion)

  if (!skus.length) {
    console.error('❌  No se encontraron filas válidas con SKU y Material.')
    process.exit(1)
  }

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
      console.error(`\n❌  Error en lote ${i + 1}-${Math.min(i + BATCH_SIZE, skus.length)}: ${error.message}`)
      errores += lote.length
    } else {
      insertados += lote.length
      process.stdout.write(`\r⏳  Progreso: ${insertados}/${skus.length} SKUs`)
    }
  }

  console.log(`\n\n✅  Completado: ${insertados} SKUs insertados/actualizados`)
  if (errores > 0) console.log(`⚠️   ${errores} registros con error`)
}

seedSKUs().catch(err => {
  console.error('\n❌  Error fatal:', err.message)
  process.exit(1)
})
