export default function LeaguePage({ params }: { params: { id: string } }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-content-muted">
      <span className="text-5xl mb-4">🏆</span>
      <h1 className="text-lg font-bold text-content-primary mb-2">League #{params.id}</h1>
      <p className="text-sm">League tables &amp; fixtures coming in M4</p>
    </div>
  )
}
