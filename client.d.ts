import type { EventEmitter } from 'node:events'
import type { AbstractLevel } from 'abstract-level'
import type { JobId, JsonEntryStreamOptions, JobDb } from './server.js'
import type { EntryStream } from 'level-read-stream'

export interface LevelJobsClientQueue <Payload> extends EventEmitter {
  _db: AbstractLevel<string, Payload>
  _pending: AbstractLevel<string, Payload>
  _work: AbstractLevel<string, Payload>
  push: (payload: Payload) => JobId
  pushBatch: (payloads: Payload[]) => JobId[]
  del: (id: JobId) => void
  delBatch: (ids: JobId[]) => void
  pendingStream: (options?: JsonEntryStreamOptions) => EntryStream<string, Payload>
  runningStream: (options?: JsonEntryStreamOptions) => EntryStream<string, Payload>
}

declare function Client <Payload = unknown>(db: JobDb<Payload>): LevelJobsClientQueue<Payload>

export default Client
