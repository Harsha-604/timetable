import { useState, useEffect } from 'react'
import {
  verifyPin,
  getStoredPinHash,
  setPinUnlocked,
  clearStoredPinHash,
  clearStoredToken,
  clearAuthCache,
} from '../utils/publisher'

export default function PinScreen({ onUnlockSuccess, onForgotPin }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [showForgotConfirm, setShowForgotConfirm] = useState(false)

  // Countdown timer for 60-second cooldown after 5 failed attempts
  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          setFailedAttempts(0)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownSeconds])

  const handleUnlock = async (e) => {
    e?.preventDefault()
    if (cooldownSeconds > 0) return
    if (!pin.trim()) {
      setError('Please enter your PIN.')
      return
    }

    const storedHash = getStoredPinHash()
    const isValid = await verifyPin(pin.trim(), storedHash)

    if (isValid) {
      setPinUnlocked(true)
      setFailedAttempts(0)
      setError('')
      onUnlockSuccess()
    } else {
      const nextFailures = failedAttempts + 1
      setFailedAttempts(nextFailures)
      setPin('')
      if (nextFailures >= 5) {
        setCooldownSeconds(60)
        setError('Too many failed attempts. Please wait 60 seconds before retrying.')
      } else {
        setError(`Incorrect PIN. (${5 - nextFailures} attempts remaining before cooldown)`)
      }
    }
  }

  const handleResetPin = () => {
    clearStoredPinHash()
    clearStoredToken()
    clearAuthCache()
    setPinUnlocked(false)
    onForgotPin()
  }

  const handleBackToPublic = () => {
    window.location.hash = ''
  }

  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: 400,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          padding: '2rem',
        }}
      >
        <h2
          style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            marginBottom: '.3rem',
            color: 'var(--ink)',
          }}
        >
          Enter PIN
        </h2>
        <p style={{ fontSize: '.84rem', color: 'var(--muted)', marginBottom: '1.5rem' }}>
          This browser session is locked. Enter your coordinator PIN to continue.
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

        <form onSubmit={handleUnlock}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '.82rem',
                fontWeight: 600,
                marginBottom: '.3rem',
                color: 'var(--ink)',
              }}
            >
              PIN (4 to 8 digits)
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              disabled={cooldownSeconds > 0}
              autoFocus
              style={{
                width: '100%',
                fontSize: '1.2rem',
                letterSpacing: '.3rem',
                textAlign: 'center',
              }}
            />
            {cooldownSeconds > 0 && (
              <p
                style={{
                  fontSize: '.8rem',
                  color: 'var(--danger)',
                  marginTop: '.35rem',
                  textAlign: 'center',
                }}
              >
                Locked for {cooldownSeconds}s
              </p>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={cooldownSeconds > 0 || !pin.trim()}
            style={{ width: '100%', marginBottom: '1rem' }}
          >
            Unlock Editor
          </button>
        </form>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '.5rem', alignItems: 'center' }}>
          {!showForgotConfirm ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--muted)', fontSize: '.8rem' }}
              onClick={() => setShowForgotConfirm(true)}
            >
              Forgot PIN?
            </button>
          ) : (
            <div
              style={{
                width: '100%',
                padding: '.75rem',
                background: 'var(--surface2)',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'center',
              }}
            >
              <p style={{ fontSize: '.78rem', color: 'var(--ink)', marginBottom: '.6rem' }}>
                Resetting your PIN requires logging in with your GitHub token again. Your saved timetable data will not be deleted.
              </p>
              <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ background: 'var(--danger)', color: '#fff', fontSize: '.75rem' }}
                  onClick={handleResetPin}
                >
                  Reset PIN & Log in
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '.75rem' }}
                  onClick={() => setShowForgotConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--muted)', fontSize: '.8rem' }}
            onClick={handleBackToPublic}
          >
            ← Back to public timetable
          </button>
        </div>
      </div>
    </div>
  )
}

