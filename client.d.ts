import type { EventEmitter } from 'node:events'
import type { AbstractLevel } from 'abstract-level'
import type { JobId, JsonEntryStreamOptions, JobDb, BatchJobEntry } from './server.js'
import type { EntryStream } from 'level-read-stream'

export interface LevelJobsClientQueue <Payload> extends EventEmitter {
  _db: AbstractLevel<string, Payload>
  _pending: AbstractLevel<string, Payload>
  _work: AbstractLevel<string, Payload>
  push: (payload: Payload) => Promise<JobId>
  pushWithCustomJobId: (id: JobId, payload: Payload) => Promise<void>
  pushBatch: (payloads: Payload[]) => Promise<JobId[]>
  pushBatchWithCustomJobIds: (entries: BatchJobEntry<Payload>) => Promise<void>
  del: (id: JobId) => Promise<void>
  delBatch: (ids: JobId[]) => Promise<void>
  pendingStream: (options?: JsonEntryStreamOptions) => EntryStream<string, Payload>
  runningStream: (options?: JsonEntryStreamOptions) => EntryStream<string, Payload>
}

declare function Client <Payload = unknown>(db: JobDb<Payload>): LevelJobsClientQueue<Payload>

export default Client
