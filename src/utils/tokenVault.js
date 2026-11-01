/**
 * Token Vault: Secures the coordinator GitHub token via client-side encryption.
 * The token is encrypted with PBKDF2 (SHA-256, 600,000 iterations) -> AES-GCM 256
 * and stored in localStorage under 'tt_publish_token_enc'.
 * The decrypted token lives ONLY in memory in a module-level variable.
 */

export const VAULT_STORAGE_KEY = 'tt_publish_token_enc'

// In-memory token store: never written to storage, console, or payloads
let memoryToken = ''

export function getMemoryToken() {
  return memoryToken
}

export function setMemoryToken(token) {
  memoryToken = (token || '').trim()
}

export function clearMemoryToken() {
  memoryToken = ''
}

export function hasEncryptedToken() {
  if (typeof localStorage === 'undefined') return false
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return !!(parsed && parsed.ct && parsed.salt && parsed.iv)
  } catch {
    return false
  }
}

export function deleteEncryptedToken() {
  clearMemoryToken()
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(VAULT_STORAGE_KEY)
    localStorage.removeItem('tt_publish_token')
    localStorage.removeItem('tt_editor_pin')
  } catch {}
}

export function uint8ArrayToBase64(u8) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8).toString('base64')
  }
  let binary = ''
  const len = u8.byteLength
  const chunkSize = 8192
  for (let i = 0; i < len; i += chunkSize) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, Math.min(i + chunkSize, len)))
  }
  return btoa(binary)
}

export function base64ToUint8Array(b64) {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'))
  }
  const binary = atob(b64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const cryptoSubtle = () => {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    return window.crypto.subtle
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle
  }
  throw new Error('Web Cryptography API is not available')
}

const getCrypto = () => {
  if (typeof window !== 'undefined' && window.crypto) return window.crypto
  if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto
  throw new Error('Web Cryptography API is not available')
}

/**
 * Derives an AES-GCM 256-bit key from a PIN and salt using PBKDF2 (SHA-256, 600,000 iterations).
 */
export async function deriveKey(pin, saltBytes) {
  const subtle = cryptoSubtle()
  const enc = new TextEncoder()
  const baseKey = await subtle.importKey(
    'raw',
    enc.encode(pin),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 600000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts a token with a PIN, generating a random 16-byte salt and 12-byte IV.
 * Saves the result to localStorage and updates in-memory token.
 */
export async function encryptToken(token, pin) {
  if (!token || !pin) {
    throw new Error('Token and PIN are required')
  }
  if (pin.length < 8) {
    throw new Error('PIN must be at least 8 characters')
  }

  const subtle = cryptoSubtle()
  const cr = getCrypto()

  const saltBytes = new Uint8Array(16)
  cr.getRandomValues(saltBytes)

  const ivBytes = new Uint8Array(12)
  cr.getRandomValues(ivBytes)

  const aesKey = await deriveKey(pin, saltBytes)
  const enc = new TextEncoder()
  const tokenBytes = enc.encode(token.trim())

  const ctBuffer = await subtle.encrypt(
    { name: 'AES-GCM', iv: ivBytes },
    aesKey,
    tokenBytes
  )

  const vault = {
    v: 1,
    salt: uint8ArrayToBase64(saltBytes),
    iv: uint8ArrayToBase64(ivBytes),
    ct: uint8ArrayToBase64(new Uint8Array(ctBuffer)),
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault))
    // Ensure plaintext key and old pin hash are removed
    localStorage.removeItem('tt_publish_token')
    localStorage.removeItem('tt_editor_pin')
  }

  setMemoryToken(token)
  return vault
}

/**
 * Decrypts the stored token using the provided PIN.
 * On success, stores the token in memory and returns it.
 * Throws on incorrect PIN or missing vault.
 */
export async function decryptToken(pin) {
  if (!pin) throw new Error('PIN is required')

  if (typeof localStorage === 'undefined') {
    throw new Error('Storage is not available')
  }

  const raw = localStorage.getItem(VAULT_STORAGE_KEY)
  if (!raw) {
    throw new Error('No encrypted token found')
  }

  let vault
  try {
    vault = JSON.parse(raw)
  } catch {
    throw new Error('Invalid token vault format')
  }

  if (!vault.salt || !vault.iv || !vault.ct) {
    throw new Error('Incomplete token vault')
  }

  const subtle = cryptoSubtle()
  const saltBytes = base64ToUint8Array(vault.salt)
  const ivBytes = base64ToUint8Array(vault.iv)
  const ctBytes = base64ToUint8Array(vault.ct)

  let aesKey
  try {
    aesKey = await deriveKey(pin, saltBytes)
  } catch {
    throw new Error('Key derivation failed')
  }

  let decryptedBuffer
  try {
    decryptedBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      aesKey,
      ctBytes
    )
  } catch (err) {
    throw new Error('Wrong PIN')
  }

  const token = new TextDecoder().decode(decryptedBuffer)
  setMemoryToken(token)
  return token
}

/**
 * Changes the PIN by decrypting with current PIN and re-encrypting with new PIN
 * (generating fresh random salt and IV).
 */
export async function changePin(currentPin, newPin) {
  if (newPin.length < 8) {
    throw new Error('New PIN must be at least 8 characters')
  }
  const token = await decryptToken(currentPin)
  return await encryptToken(token, newPin)
}

/**
 * Migration helper:
 * If plaintext 'tt_publish_token' exists in localStorage, moves it to memory,
 * deletes 'tt_publish_token' and 'tt_editor_pin', and returns true (needs Set PIN).
 */
export function checkMigration() {
  if (typeof localStorage === 'undefined') return false
  try {
    const plainToken = localStorage.getItem('tt_publish_token')
    if (plainToken && plainToken.trim()) {
      setMemoryToken(plainToken.trim())
      localStorage.removeItem('tt_publish_token')
      localStorage.removeItem('tt_editor_pin')
      return true
    }
    // Clean up old pin hash if present
    localStorage.removeItem('tt_editor_pin')
  } catch {}
  return false
}

