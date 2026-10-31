import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import {
  getStoredToken,
  publish as publishApi,
  getLatestWorkflowRun,
  buildProjectPayload,
} from './publisher'
import { auditTimetableHardViolations } from './validator'

export function usePublish({ onNavigate } = {}) {
  const store = useStore()
  const {
    classes,
    faculty,
    rooms,
    subjects,
    timetable,
    settings,
    assignments,
    lastGeneratedAt,
    toast,
  } = store

  const [publishing, setPublishing] = useState(false)
  const [deployStatus, setDeployStatus] = useState(null)
  const pollTimerRef = useRef(null)
  const pollCountRef = useRef(0)

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    pollCountRef.current = 0
  }, [])

  // Stop polling on unmount (e.g. when user leaves page)
  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  const startPolling = useCallback(
    (owner, repo, branch, token) => {
      stopPolling()
      setDeployStatus({ status: 'Deploying…', state: 'deploying' })
      pollCountRef.current = 0

      const checkRun = async () => {
        pollCountRef.current += 1
        const run = await getLatestWorkflowRun({ owner, repo, branch, token })
        if (run) {
          setDeployStatus(run)
          if (run.state === 'live' || run.state === 'failed') {
            stopPolling()
            return
          }
        }
        // Poll every 15s up to 5 minutes (20 polls)
        if (pollCountRef.current >= 20) {
          stopPolling()
        }
      }

      // First check after 3 seconds, then every 15 seconds
      const initialTimer = setTimeout(() => {
        checkRun()
        pollTimerRef.current = setInterval(checkRun, 15000)
      }, 3000)

      return () => clearTimeout(initialTimer)
    },
    [stopPolling]
  )

  const handlePublish = async () => {
    if (publishing) return

    // Pre-check 1: Token saved?
    const token = getStoredToken()
    if (!token) {
      toast('No token saved. Configure token in Settings → Publishing.', 'err')
      if (onNavigate) {
        onNavigate('settings')
      }
      return
    }

    // Pre-check 2: Any class has no timetable?
    const missingClasses = classes.filter(
      (c) => !timetable[c.id] || Object.keys(timetable[c.id]).length === 0
    )
    if (missingClasses.length > 0) {
      toast(
        `Cannot publish: Timetable missing for ${missingClasses.map((c) => c.id).join(', ')}. Generate first.`,
        'err'
      )
      return
    }

    // Pre-check 3: Hard violations check
    const audit = auditTimetableHardViolations({
      classes,
      timetables: timetable,
      subjects,
      faculty,
      rooms,
      assignments,
      settings,
    })
    if (audit.hardViolations && audit.hardViolations.length > 0) {
      toast(
        `Cannot publish: ${audit.hardViolations.length} hard conflict(s) detected. Fix them or re-generate.`,
        'err'
      )
      return
    }

    // Confirmation dialog
    const lastGen = lastGeneratedAt
      ? new Date(lastGeneratedAt).toLocaleString()
      : store.savedAt
      ? new Date(store.savedAt).toLocaleString()
      : 'Just now'

    const confirmMsg = `Publish Timetable?\n• Classes: ${classes.length}\n• Faculty: ${faculty.length}\n• Last Generated: ${lastGen}\n\nThis will update the public timetable for everyone.`
    if (!window.confirm(confirmMsg)) {
      return
    }

    setPublishing(true)
    const owner = settings.publishing?.owner || 'Harsha-604'
    const repo = settings.publishing?.repo || 'timetable'
    const branch = settings.publishing?.branch || 'master'
    const actionsUrl = `https://github.com/${owner}/${repo}/actions`

    try {
      const now = new Date().toISOString()
      const payload = buildProjectPayload(store, now)

      await publishApi({
        owner,
        repo,
        branch,
        token,
        projectData: payload,
      })

      toast('Published. The site updates in about 1 minute.', 'ok', actionsUrl)
      startPolling(owner, repo, branch, token)
    } catch (err) {
      if (err.status === 401) {
        toast('Token invalid or expired, update it in Settings', 'err')
      } else if (err.status === 403 || err.status === 404) {
        toast('Token cannot write to this repo', 'err')
      } else if (err.status === 0 || err.message === 'Could not reach GitHub') {
        toast('Could not reach GitHub', 'err')
      } else {
        toast(err.message || 'Publish failed', 'err')
      }
    } finally {
      setPublishing(false)
    }
  }

  return {
    publishing,
    deployStatus,
    handlePublish,
  }
}

