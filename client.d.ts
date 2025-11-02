import type { EventEmitter } from 'node:events'
import type { AbstractLevel } from 'abstract-level'
import type { JobId, JsonEntryStreamOptions, JobWorker, QueueOptions, Callback } from './server.js'
import type { EntryStream } from 'level-read-stream'

export interface ClientQueue extends EventEmitter {
  _db: AbstractLevel
  _pending: AbstractLevel
  _work: AbstractLevel
  push: (payload: unknown, cb?: Callback) => JobId
  pushBatch: (payloads: unknown[], cb?: Callback) => JobId[]
  del: (id: JobId, cb?: Callback) => void
  delBatch: (ids: JobId[], cb?: Callback) => void
  pendingStream: (options?: JsonEntryStreamOptions) => EntryStream
  runningStream: (options?: JsonEntryStreamOptions) => EntryStream
}

declare function ClientQueue <Payload = unknown> (db: AbstractLevel, worker?: JobWorker<Payload>, options?: QueueOptions): ClientQueue

export default ClientQueue
