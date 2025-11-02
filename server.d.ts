import type { EventEmitter } from 'node:events'
import type { AbstractLevel, AbstractIteratorOptions } from 'abstract-level'
import type { ReadStreamOptions } from 'level-read-stream'
import type { WriteStream } from 'node:fs'

export type JobId = string
export type JsonEntryStreamOptions = ReadStreamOptions & Omit<AbstractIteratorOptions<K, V>, 'keys' | 'values' | 'valueEncoding'>
export type Callback = () => void
export type JobWorker <Payload> = (id: JobId, payload: Payload, cb: Callback) => void

export interface QueueOptions {
  maxConcurrency: number,
  maxRetries: number,
  backoff: {
    randomisationFactor: number,
    initialDelay: number,
    maxDelay: number,
  }
}

type Hook = () => void
type Remover = (array: Hook[], item: Hook) => void
type HookSetter = (prefix: string, hook: Hook) => Remover
interface Hooks {
  pre: HookSetter
  post: HookSetter
  posthooks: Hook[]
  prehooks: Hook[]
}

export interface ServerQueue <Payload> extends EventEmitter {
  _options: Partial<QueueOptions>
  _db: AbstractLevel
  _work: AbstractLevel<string, Payload> & { _hooks: Hooks }
  _workWriteStream: WriteStream
  _pending: AbstractLevel
  _worker: worker
  _concurrency: number

  // Flags
  _starting: boolean
  _flushing: boolean
  _peeking: boolean
  _needsFlush: boolean
  _needsDrain: boolean
}

declare function Jobs <Payload = unknown> (db: AbstractLevel, worker: JobWorker<Payload>, options?: Partial<QueueOptions>): ServerQueue<Payload>

export default Jobs
