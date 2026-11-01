import { useStore } from '../store/useStore'

export default function Toast() {
  const _toast = useStore((s) => s._toast)
  const clearToast = useStore((s) => s.clearToast)
  if (!_toast) return null
  return (
    <div
      className={`toast-el${_toast.kind === 'err' ? ' err' : _toast.kind === 'ok' ? ' ok' : ''}`}
      key={_toast.id}
      style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}
    >
      <span>
        {_toast.msg}
        {_toast.url && (
          <a
            href={_toast.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginLeft: '.5rem',
              color: 'inherit',
              textDecoration: 'underline',
              fontWeight: 600,
            }}
          >
            View Actions
          </a>
        )}
      </span>
      <button
        type="button"
        onClick={clearToast}
        aria-label="Close"
        title="Close"
        style={{
          background: 'none',
          border: 'none',
          color: 'inherit',
          fontSize: '1.1rem',
          lineHeight: 1,
          padding: '0 .15rem',
          cursor: 'pointer',
          opacity: 0.7,
        }}
      >
        ×
      </button>
    </div>
  )
}
