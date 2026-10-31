import { useEffect } from 'react'
import { useStore } from '../store/useStore'

export default function Toast() {
  const _toast = useStore(s => s._toast)
  if (!_toast) return null
  return (
    <div
      className={`toast-el${_toast.kind === 'err' ? ' err' : _toast.kind === 'ok' ? ' ok' : ''}`}
      key={_toast.id}
    >
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
    </div>
  )
}
