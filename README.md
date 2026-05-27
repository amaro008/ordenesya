# ordenesya

Captura inteligente de órdenes de compra para equipos de ventas.

## Stack

- **Next.js 14** (App Router)
- **Supabase** (PostgreSQL + Auth + Storage)
- **Gemini API** (interpretación de documentos)
- **Vercel** (deployment)

---

## Setup local

### 1. Clonar e instalar

```bash
git clone https://github.com/amaro008/ordenesya.git
cd ordenesya
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Llena `.env.local` con tus credenciales:

| Variable | Dónde obtenerla |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard > Settings > API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard > Settings > API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard > Settings > API |
| `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey |

### 3. Base de datos

En Supabase SQL Editor, corre el script completo:
```
ordenesya_schema.sql
```

### 4. Storage bucket

En Supabase > Storage > New bucket:
- Nombre: `ordenesya-docs`
- Public: **No**

### 5. Seed de SKUs

```bash
node scripts/seed-skus.js ./tu-catalogo.xlsx
```

El Excel debe tener columnas en este orden:
`Familia | Sublínea | Línea de Ventas | Marca | SKU | Descripción`

### 6. Correr en desarrollo

```bash
npm run dev
```

Abre http://localhost:3000

---

## Deployment en Vercel

1. Push a GitHub
2. Importar repo en Vercel
3. Agregar las mismas variables de `.env.local` en:
   **Vercel > Settings > Environment Variables**
4. Deploy

---

## Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/          # Login y registro
│   ├── (dashboard)/     # App principal (protegida)
│   │   ├── dashboard/   # Home con stats
│   │   ├── ordenes/     # Nueva orden y revisión
│   │   ├── clientes/    # Admin de clientes y equivalencias
│   │   └── skus/        # Catálogo SKUs
│   └── api/             # Route handlers
├── components/
│   └── layout/          # Sidebar
├── lib/
│   ├── supabase.ts      # Clientes de Supabase
│   ├── gemini.ts        # Integración Gemini API
│   ├── sku-matcher.ts   # Lógica de matching de SKUs
│   └── sap-export.ts    # Exportar para SAP (clipboard / Excel)
└── types/               # TypeScript types
```

---

## Flujo principal

1. Asesor sube PDF/imagen de OC
2. Gemini extrae: cliente, productos, cantidades
3. Sistema detecta cliente automáticamente por identificadores
4. SKUs se resuelven: exacto → sufijo → equivalencia → conflicto
5. Asesor revisa tabla, resuelve conflictos, valida cantidades
6. Copia 2 columnas (SKU + cantidad) al portapapeles → pega en SAP VA01

---

## Sufijos de SKU conocidos

Los siguientes sufijos se stripean automáticamente al buscar en el catálogo:
`SIG`, `FSV`, `MPE`, `CH`, `REC`
