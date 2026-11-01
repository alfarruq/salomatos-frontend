import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PullToRefresh } from './PullToRefresh'

const original = window.matchMedia

function setInstalled(matches: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia
}

function pull(target: Element, fromY: number, toY: number, x = 100, toX = x) {
  fireEvent.touchStart(target, { touches: [{ clientX: x, clientY: fromY }] })
  fireEvent.touchMove(target, { touches: [{ clientX: (x + toX) / 2, clientY: (fromY + toY) / 2 }] })
  fireEvent.touchMove(target, { touches: [{ clientX: toX, clientY: toY }] })
  fireEvent.touchEnd(target, { touches: [] })
}

beforeEach(() => {
  vi.useFakeTimers()
  setInstalled(true)
})

afterEach(() => {
  vi.useRealTimers()
  window.matchMedia = original
})

describe('PullToRefresh', () => {
  it('refreshes after a long enough pull from the top', async () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    render(
      <>
        <PullToRefresh label="Refreshing" onRefresh={onRefresh} />
        <p>content</p>
      </>,
    )

    pull(screen.getByText('content'), 100, 300)

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Refreshing')
    await act(() => vi.advanceTimersByTimeAsync(600))
    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('ignores a short pull', () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    render(
      <>
        <PullToRefresh label="Refreshing" onRefresh={onRefresh} />
        <p>content</p>
      </>,
    )

    pull(screen.getByText('content'), 100, 160)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('ignores sideways swipes, e.g. across a wide table', () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    render(
      <>
        <PullToRefresh label="Refreshing" onRefresh={onRefresh} />
        <p>content</p>
      </>,
    )

    pull(screen.getByText('content'), 100, 320, 20, 340)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('leaves dialogs and scrolled inner lists alone', () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    render(
      <>
        <PullToRefresh label="Refreshing" onRefresh={onRefresh} />
        <div role="dialog">
          <p>in dialog</p>
        </div>
        <div data-testid="list">
          <p>in list</p>
        </div>
      </>,
    )
    const list = screen.getByTestId('list')
    Object.defineProperty(list, 'scrollTop', { configurable: true, value: 40 })

    pull(screen.getByText('in dialog'), 100, 300)
    pull(screen.getByText('in list'), 100, 300)

    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('renders nothing outside the installed app', () => {
    setInstalled(false)
    const onRefresh = vi.fn(() => Promise.resolve())
    render(
      <>
        <PullToRefresh label="Refreshing" onRefresh={onRefresh} />
        <p>content</p>
      </>,
    )

    pull(screen.getByText('content'), 100, 300)

    expect(onRefresh).not.toHaveBeenCalled()
    expect(screen.queryByTestId('pull-to-refresh-indicator')).toBeNull()
  })
})
