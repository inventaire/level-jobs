import type { AbstractLevel } from 'abstract-level'
import type { JobWorker, QueueOptions, ServerQueue } from './server.js'
import type { ClientQueue } from './client.js'
export type * from './server.js'

export type LevelJobsQueue<Payload> = ServerQueue<Payload> & ClientQueue<Payload>

declare function Jobs <Payload = unknown>(db: AbstractLevel<string, Payload>, worker: JobWorker<Payload>, options?: Partial<QueueOptions>): LevelJobsQueue<Payload>

// Combine Server and Client
export default Jobs
