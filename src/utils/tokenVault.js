/**
 * Token Vault adapter: redirects to direct token storage in publisher.js.
 * PIN-based encryption has been removed in favor of direct token authentication.
 */

import { getStoredToken, setStoredToken, clearStoredToken } from './publisher.js'

export function getMemoryToken() {
  return getStoredToken()
}

export function setMemoryToken(token) {
  setStoredToken(token)
}

export function clearMemoryToken() {
  clearStoredToken()
}

export function hasEncryptedToken() {
  return false
}

export function deleteEncryptedToken() {
  clearStoredToken()
}

export function checkMigration() {
  return false
}
