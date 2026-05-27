import type { Metadata } from 'next'
export const metadata: Metadata = { title: 'Revisar orden' }
import OrdenRevisor from './OrdenRevisor'
export default function PaginaOrden({ params }: { params: { id: string } }) {
  return <OrdenRevisor id={params.id} />
}
