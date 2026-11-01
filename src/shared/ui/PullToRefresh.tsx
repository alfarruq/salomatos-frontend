import { Loader2, RefreshCw } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { springs, useTransition } from '@/shared/lib/motion'
import { useMediaQuery } from '@/shared/lib/useMediaQuery'

/** Distance the finger must travel (after resistance) before a release refreshes. */
const THRESHOLD = 72
/** The indicator stops following the finger past this point. */
const MAX_PULL = 112
/** Finger travel is halved so the pull feels like it has weight. */
const RESISTANCE = 0.5
/** Movement below this is a tap or jitter, not a gesture with a direction yet. */
const SLOP = 8
/** A refresh that resolves instantly would flash the spinner; hold it this long at least. */
const MIN_SPINNER_MS = 500

/**
 * Only the installed app needs this: a browser tab already has its own
 * pull-to-refresh (or a reload button), and a mouse cannot "pull" anyway.
 */
const QUERY = '(display-mode: standalone) and (pointer: coarse)'

/**
 * Surfaces that scroll on their own or must not lose a drag to a reload.
 * Radix marks the body while a modal is open; menus and listboxes are
 * portalled outside it, so they are named too.
 */
const IGNORED_TARGETS =
  '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-pull-to-refresh="off"]'

function isPullable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (window.scrollY > 0) return false
  if (document.body.hasAttribute('data-scroll-locked')) return false
  if (target.closest(IGNORED_TARGETS) !== null) return false
  // An inner scroller that is not at its top gets the drag, as it would natively.
  for (let el: Element | null = target; el !== null; el = el.parentElement) {
    if (el.scrollTop > 0) return false
  }
  return true
}

type Gesture =
  | { phase: 'idle' }
  | { phase: 'pending'; x: number; y: number }
  | { phase: 'pulling'; y: number }

export interface PullToRefreshProps {
  /** Resolves when fresh data is in. Rejections are swallowed: the screens show their own errors. */
  onRefresh: () => Promise<unknown>
  /** Announced to screen readers while refreshing. */
  label: string
}

/**
 * Instagram-style pull-to-refresh for the installed PWA, where the browser's
 * own gesture is not available. Renders nothing interactive: it listens on
 * the window and draws an indicator under the top bar.
 */
export function PullToRefresh({ onRefresh, label }: PullToRefreshProps) {
  const isEnabled = useMediaQuery(QUERY)
  const [distance, setDistance] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const transition = useTransition(springs.control)

  // Listeners are attached once per enable; they read the latest values here.
  const latest = useRef({ onRefresh, isRefreshing, distance })
  latest.current = { onRefresh, isRefreshing, distance }

  useEffect(() => {
    if (!isEnabled) return
    let gesture: Gesture = { phase: 'idle' }

    const reset = () => {
      gesture = { phase: 'idle' }
      setIsDragging(false)
      setDistance(0)
    }

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (event.touches.length !== 1 || touch === undefined) return
      if (latest.current.isRefreshing || !isPullable(event.target)) return
      gesture = { phase: 'pending', x: touch.clientX, y: touch.clientY }
    }

    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (gesture.phase === 'idle' || touch === undefined) return
      if (gesture.phase === 'pending') {
        const dx = touch.clientX - gesture.x
        const dy = touch.clientY - gesture.y
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        // Sideways (a wide table) or upwards (ordinary scrolling) is not ours.
        if (dy <= 0 || Math.abs(dx) >= dy) {
          gesture = { phase: 'idle' }
          return
        }
        gesture = { phase: 'pulling', y: gesture.y }
        setIsDragging(true)
      }
      if (window.scrollY > 0) {
        reset()
        return
      }
      // Stops iOS rubber-banding the page underneath the indicator.
      if (event.cancelable) event.preventDefault()
      const pulled = Math.max(0, (touch.clientY - gesture.y) * RESISTANCE)
      setDistance(Math.min(MAX_PULL, pulled))
    }

    const onEnd = () => {
      if (gesture.phase !== 'pulling') {
        gesture = { phase: 'idle' }
        return
      }
      const shouldRefresh = latest.current.distance >= THRESHOLD
      gesture = { phase: 'idle' }
      setIsDragging(false)
      if (!shouldRefresh) {
        setDistance(0)
        return
      }
      setIsRefreshing(true)
      setDistance(THRESHOLD)
      const minimum = new Promise((resolve) => setTimeout(resolve, MIN_SPINNER_MS))
      void Promise.allSettled([latest.current.onRefresh(), minimum]).then(() => {
        setIsRefreshing(false)
        setDistance(0)
      })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    // Not passive: the move handler has to be able to cancel the native overscroll.
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', reset)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', reset)
    }
  }, [isEnabled])

  if (!isEnabled) return null

  const progress = Math.min(1, distance / THRESHOLD)

  return (
    <>
      <motion.div
        animate={{ x: '-50%', y: distance - 48, opacity: isRefreshing ? 1 : progress }}
        aria-hidden="true"
        className={cn(
          'pointer-events-none fixed top-16 left-1/2 z-30',
          'flex size-10 items-center justify-center rounded-full',
          'border border-border bg-surface text-accent-text',
        )}
        data-testid="pull-to-refresh-indicator"
        initial={false}
        transition={isDragging ? { duration: 0 } : transition}
      >
        {isRefreshing ? (
          <Loader2 className="size-5 motion-safe:animate-spin" />
        ) : (
          <RefreshCw
            className="size-5"
            style={{ transform: `rotate(${String(Math.round(progress * 270))}deg)` }}
          />
        )}
      </motion.div>
      <span aria-live="polite" className="sr-only" role="status">
        {isRefreshing ? label : ''}
      </span>
    </>
  )
}
