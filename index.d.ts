import type { ServerQueue } from './server.js'
import type { ClientQueue } from './client.js'

export type LevelJobsQueue <Payload> = ServerQueue<Payload> & ClientQueue

declare function Jobs <Payload = unknown> (db: AbstractLevel, worker: JobWorker<Payload>, options: Partial<QueueOptions>): LevelJobsQueue<Payload>

// Combine Server and Client
export default Jobs
