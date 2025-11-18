import type { EventEmitter } from 'node:events'
import type { AbstractLevel, AbstractIteratorOptions, AbstractSublevel } from 'abstract-level'
import type { ReadStreamOptions } from 'level-read-stream'
import type { WriteStream } from 'node:fs'

export type JsonEntryStreamOptions <JobId extends string, Payload> = ReadStreamOptions & Omit<AbstractIteratorOptions<JobId, Payload>, 'keys' | 'values' | 'valueEncoding'>
export type JobWorker <JobId extends string, Payload> = (id: JobId, payload: Payload) => Promise<void>

export type BatchJobEntry<JobId, Payload> = [ JobId, Payload ]
export type BatchJobWorker <JobId, Payload> = (entries: BatchJobEntry<JobId, Payload>[]) => Promise<void>

export type JobSubDb <JobId extends string, Payload> = AbstractSublevel<AbstractLevel<unknown, JobId, Payload>, unknown, JobId, Payload>
export type JobDb <JobId extends string, Payload> = AbstractLevel<JobId, Payload> | JobSubDb<JobId, Payload>

export interface LevelJobsOptions {
  maxConcurrency: number,
  maxRetries: number,
  workerTimeout: number
  batchLength: number
  backoff: {
    /** Must be between 0 and 1 */
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

export interface LevelJobsServer <JobId extends string, Payload> extends EventEmitter {
  _options: Partial<LevelJobsOptions>
  _db: JobDb<JobId, Payload>
  _work: JobSubDb<JobId, Payload> & { _hooks: Hooks }
  _workWriteStream: WriteStream
  _pending: JobSubDb<JobId, Payload>
  _worker: JobWorker<JobId, Payload> | BatchJobWorker<JobId, Payload>
  _concurrency: number

  // Flags
  _starting: boolean
  _flushing: boolean
  _peeking: boolean
  _needsFlush: boolean
  _needsDrain: boolean
}

declare function Jobs <JobId extends string, Payload = unknown> (
  db: JobDb<JobId, Payload>,
  worker: JobWorker<JobId, Payload> | BatchJobWorker<JobId, Payload>,
  options?: Partial<LevelJobsOptions>
): LevelJobsServer<JobId, Payload>

export default Jobs
