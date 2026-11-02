import { useState, useEffect } from 'react'
import { useStore } from '../store/useStore'
import { changePin } from '../utils/tokenVault'

export default function ChangePinModal({ isOpen, onClose }) {
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showCurrentPin, setShowCurrentPin] = useState(false)
  const [showNewPin, setShowNewPin] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const toast = useStore((s) => s.toast)

  useEffect(() => {
    if (isOpen) {
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
      setError('')
      setLoading(false)
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e?.preventDefault()
    setError('')

    if (!currentPin) {
      setError('Please enter your current PIN.')
      return
    }
    if (newPin.length < 8) {
      setError('New PIN must be at least 8 characters.')
      return
    }
    if (newPin !== confirmPin) {
      setError('New PINs do not match.')
      return
    }

    setLoading(true)
    try {
      await changePin(currentPin, newPin)
      toast('PIN changed successfully', 'ok')
      onClose()
    } catch (err) {
      setError(err.message || 'Wrong current PIN.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--surface)',
          padding: '1.75rem',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--ink)' }}>
            Change PIN
          </h3>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close"
            style={{ fontSize: '1.2rem', lineHeight: 1, padding: '.2rem .5rem' }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '.84rem', color: 'var(--muted)', marginBottom: '1.25rem' }}>
          Enter your current PIN to decrypt and re-encrypt your saved token with a new PIN.
        </p>

        {error && (
          <div
            style={{
              padding: '.6rem .75rem',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--dangerbg)',
              color: 'var(--danger)',
              border: '1px solid var(--border)',
              fontSize: '.84rem',
              marginBottom: '1rem',
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '.82rem',
                fontWeight: 600,
                marginBottom: '.3rem',
                color: 'var(--ink)',
              }}
            >
              Current PIN
            </label>
            <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
              <input
                type={showCurrentPin ? 'text' : 'password'}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value)}
                placeholder="Enter current PIN"
                autoFocus
                style={{ flex: 1, fontFamily: showCurrentPin ? 'inherit' : 'monospace' }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowCurrentPin(!showCurrentPin)}
              >
                {showCurrentPin ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '.82rem',
                fontWeight: 600,
                marginBottom: '.3rem',
                color: 'var(--ink)',
              }}
            >
              New PIN
            </label>
            <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
              <input
                type={showNewPin ? 'text' : 'password'}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="At least 8 characters"
                style={{ flex: 1, fontFamily: showNewPin ? 'inherit' : 'monospace' }}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewPin(!showNewPin)}
              >
                {showNewPin ? 'Hide' : 'Show'}
              </button>
            </div>
            <p
              style={{
                fontSize: '.78rem',
                color: 'var(--muted)',
                marginTop: '.35rem',
                marginBottom: 0,
              }}
            >
              Longer is safer. Letters + numbers recommended.
            </p>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '.82rem',
                fontWeight: 600,
                marginBottom: '.3rem',
                color: 'var(--ink)',
              }}
            >
              Confirm New PIN
            </label>
            <input
              type={showNewPin ? 'text' : 'password'}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Re-enter new PIN"
              style={{ width: '100%', fontFamily: showNewPin ? 'inherit' : 'monospace' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !currentPin || !newPin || !confirmPin}
            >
              {loading ? 'Updating…' : 'Update PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

