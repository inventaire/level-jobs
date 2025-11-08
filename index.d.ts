import type { JobDb, JobWorker, QueueOptions, LevelJobsServer } from './server.js'
import type { LevelJobsClientQueue } from './client.js'
export type * from './server.js'

export type LevelJobsQueue<Payload> = LevelJobsServer<Payload> & LevelJobsClientQueue<Payload>

/** Combine the jobs server and client */
declare function Jobs <Payload = unknown>(db: JobDb<Payload>, worker: JobWorker<Payload>, options?: Partial<QueueOptions>): LevelJobsQueue<Payload>

export default Jobs
