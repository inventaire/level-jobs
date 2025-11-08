import type { EventEmitter } from 'node:events'
import type { AbstractLevel, AbstractIteratorOptions, AbstractSublevel } from 'abstract-level'
import type { ReadStreamOptions } from 'level-read-stream'
import type { WriteStream } from 'node:fs'

export type JobId = string
export type JsonEntryStreamOptions = ReadStreamOptions & Omit<AbstractIteratorOptions<K, V>, 'keys' | 'values' | 'valueEncoding'>
export type JobWorker <Payload> = (id: JobId, payload: Payload) => Promise<void>

export type JobSubDb <Payload> = AbstractSublevel<AbstractLevel<unknown, unknown, unknown>, unknown, unknown, Payload>
export type JobDb <Payload> = AbstractLevel<string, Payload> | JobSubDb<Payload>

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

export interface LevelJobsServer <Payload> extends EventEmitter {
  _options: Partial<QueueOptions>
  _db: JobDb<Payload>
  _work: JobSubDb<Payload> & { _hooks: Hooks }
  _workWriteStream: WriteStream
  _pending: JobSubDb<Payload>
  _worker: JobWorker<Payload>
  _concurrency: number

  // Flags
  _starting: boolean
  _flushing: boolean
  _peeking: boolean
  _needsFlush: boolean
  _needsDrain: boolean
}

declare function Jobs <Payload = unknown>(db: JobDb<Payload>, worker: JobWorker<Payload>, options?: Partial<QueueOptions>): LevelJobsServer<Payload>

export default Jobs
