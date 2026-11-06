import { useEffect, useState } from 'react'
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { useStore } from '../store/useStore'
import { buildProjectPayload } from '../utils/projectPayload'

const sharedProjectRef = doc(db, 'sharedTimetables', 'main')

function getSignature(payload) {
  const { savedAt, ...data } = payload || {}
  return JSON.stringify(data)
}

function decodePayload(documentData) {
  const storedPayload = documentData?.payloadJson ?? documentData?.payload
  if (typeof storedPayload === 'string') return JSON.parse(storedPayload)
  return storedPayload
}

function makeCloudDocument(payload, user) {
  return {
    // Firestore rejects arrays nested inside arrays; a JSON string preserves the project shape.
    payloadJson: JSON.stringify(payload),
    updatedAt: serverTimestamp(),
    updatedBy: user.email || '',
  }
}

function getCloudError(error) {
  if (error?.code === 'permission-denied') {
    return 'This Google account is not on the Firestore access list. Add its email in Firestore Rules, then try again.'
  }
  return error?.message || 'Could not connect to the shared timetable.'
}

export function useCloudProjectSync(user) {
  const [ready, setReady] = useState(false)
  const [status, setStatus] = useState('connecting')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) {
      setReady(false)
      setStatus('connecting')
      setError('')
      return undefined
    }

    let active = true
    let latestSignature = ''
    let localDirty = false
    let storeUnsubscribe = null
    let documentUnsubscribe = null
    let saveTimer = null

    setReady(false)
    setStatus('connecting')
    setError('')

    const startSync = async () => {
      try {
        const snapshot = await getDoc(sharedProjectRef)
        if (!active) return

        if (snapshot.exists()) {
          const cloudPayload = decodePayload(snapshot.data())
          if (!cloudPayload || typeof cloudPayload !== 'object') {
            throw new Error('The shared Firestore document has an unexpected format.')
          }

          latestSignature = getSignature(cloudPayload)
          useStore.getState().loadProject(cloudPayload)
        } else {
          // The first approved user seeds the shared document from this browser's project.
          const localPayload = buildProjectPayload(useStore.getState())
          latestSignature = getSignature(localPayload)
          await setDoc(sharedProjectRef, makeCloudDocument(localPayload, user))
        }

        if (!active) return

        documentUnsubscribe = onSnapshot(
          sharedProjectRef,
          (cloudSnapshot) => {
            if (!active || !cloudSnapshot.exists()) return
            const cloudPayload = decodePayload(cloudSnapshot.data())
            if (!cloudPayload || typeof cloudPayload !== 'object') return

            const cloudSignature = getSignature(cloudPayload)
            const localSignature = getSignature(buildProjectPayload(useStore.getState()))

            if (cloudSignature !== localSignature) {
              // Keep a local edit that's still waiting to be written; don't replace it
              // with an older snapshot arriving from another device.
              if (localDirty) return
              useStore.getState().loadProject(cloudPayload)
            }

            latestSignature = cloudSignature
            localDirty = false
            setError('')
            setStatus('synced')
          },
          (snapshotError) => {
            if (!active) return
            setError(getCloudError(snapshotError))
            setStatus('error')
          }
        )

        storeUnsubscribe = useStore.subscribe((state) => {
          const localPayload = buildProjectPayload(state)
          const localSignature = getSignature(localPayload)
          if (localSignature === latestSignature) return

          localDirty = true
          setStatus('saving')
          if (saveTimer) clearTimeout(saveTimer)
          saveTimer = setTimeout(async () => {
            try {
              await setDoc(sharedProjectRef, makeCloudDocument(localPayload, user))
              if (!active) return
              latestSignature = localSignature
              const currentSignature = getSignature(buildProjectPayload(useStore.getState()))
              if (currentSignature === localSignature) {
                localDirty = false
                setError('')
                setStatus('synced')
              }
            } catch (saveError) {
              if (!active) return
              setError(getCloudError(saveError))
              setStatus('error')
            }
          }, 700)
        })

        setReady(true)
        setStatus('synced')
      } catch (syncError) {
        if (!active) return
        setError(getCloudError(syncError))
        setStatus('error')
      }
    }

    startSync()

    return () => {
      active = false
      if (saveTimer) clearTimeout(saveTimer)
      storeUnsubscribe?.()
      documentUnsubscribe?.()
    }
  }, [user])

  return { ready, status, error }
}
