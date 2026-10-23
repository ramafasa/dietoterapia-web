/**
 * runInBackground – praca po odpowiedzi (waitUntil z @vercel/functions; poza Vercelem no-op).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushBackgroundTasks, runInBackground } from '@/lib/shop/background'

const waitUntil = vi.hoisted(() => vi.fn())
vi.mock('@vercel/functions', () => ({ waitUntil }))

describe('runInBackground', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns immediately, runs the task and registers it with waitUntil', async () => {
    let done = false
    let release!: () => void
    runInBackground('[test]', async () => {
      await new Promise<void>((r) => (release = r))
      done = true
    })

    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise)
    expect(done).toBe(false)

    await vi.waitFor(() => expect(release).toBeDefined())
    release()
    await flushBackgroundTasks()
    expect(done).toBe(true)
  })

  it('task error → logged by name only, never an unhandled rejection', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      runInBackground('[test]', async () => {
        throw new TypeError('secret anna@example.com')
      })
      await flushBackgroundTasks()
      await new Promise((r) => setImmediate(r))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
    expect(error).toHaveBeenCalledWith('[test] Background task failed', { name: 'TypeError' })
  })

  it('works when waitUntil itself throws (no request context)', async () => {
    waitUntil.mockImplementationOnce(() => {
      throw new Error('no context')
    })
    const task = vi.fn().mockResolvedValue(undefined)
    expect(() => runInBackground('[test]', task)).not.toThrow()
    await flushBackgroundTasks()
    expect(task).toHaveBeenCalledTimes(1)
  })
})
