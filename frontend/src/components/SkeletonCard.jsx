/* Skeleton card for loading states */
export default function SkeletonCard() {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="skeleton" style={{ aspectRatio: '2/3', width: '100%' }} />
      <div style={{ padding: '0.5rem 0.6rem 0.6rem' }}>
        <div className="skeleton" style={{ height: 12, width: '80%', borderRadius: 6, marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 12, width: '55%', borderRadius: 6 }} />
      </div>
    </div>
  )
}
