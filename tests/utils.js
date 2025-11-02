import { MemoryLevel } from 'memory-level'

export const testLevel = () => new MemoryLevel()

export const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * @returns {{ promise: Promise, resolve: () => {}, reject: (err: Error) => {} }}
 */
export function defer () {
  let resolve, reject
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })
  if (typeof resolve !== 'function') throw new Error('resolve not initialized')
  if (typeof reject !== 'function') throw new Error('reject not initialized')
  return { promise, resolve, reject }
}
