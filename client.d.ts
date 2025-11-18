import type { EventEmitter } from 'node:events'
import type { AbstractLevel } from 'abstract-level'
import type { JsonEntryStreamOptions, JobDb, BatchJobEntry } from './server.js'
import type { EntryStream } from 'level-read-stream'

export interface LevelJobsClientQueue <JobId extends string, Payload> extends EventEmitter {
  _db: AbstractLevel<string, Payload>
  _pending: AbstractLevel<string, Payload>
  _work: AbstractLevel<string, Payload>
  push: (payload: Payload) => Promise<string>
  pushWithCustomJobId: (id: JobId, payload: Payload) => Promise<void>
  pushBatch: (payloads: Payload[]) => Promise<string[]>
  pushBatchWithCustomJobIds: (entries: [ JobId, Payload ][]) => Promise<void>
  del: (id: JobId) => Promise<void>
  delBatch: (ids: JobId[]) => Promise<void>
  pendingStream: (options?: JsonEntryStreamOptions<JobId, Payload>) => EntryStream<JobId, Payload>
  runningStream: (options?: JsonEntryStreamOptions<JobId, Payload>) => EntryStream<JobId, Payload>
}

declare function Client <JobId extends string, Payload = unknown>(db: JobDb<JobId, Payload>): LevelJobsClientQueue<JobId, Payload>

export default Client
