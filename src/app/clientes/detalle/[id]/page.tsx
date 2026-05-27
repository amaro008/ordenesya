import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Detalle cliente' }
import ClienteDetalle from './ClienteDetalle'
export default function PaginaClienteDetalle({ params }: { params: { id: string } }) {
  return <ClienteDetalle id={params.id} />
}
