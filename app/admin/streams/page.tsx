import { redirect } from 'next/navigation'
import { getSession } from '@/lib/server/auth'
import { AdminStreams } from '@/components/admin/AdminStreams'

export const dynamic = 'force-dynamic'

export default async function AdminStreamsPage() {
  const session = await getSession()
  if (session?.role !== 'admin') redirect('/login?next=/admin/streams')

  return <AdminStreams username={session.username} />
}
