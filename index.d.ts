import type { BatchJobWorker, JobDb, JobWorker, LevelJobsOptions, LevelJobsServer } from './server.js'
import type { LevelJobsClientQueue } from './client.js'
export type * from './server.js'

export type LevelJobsQueue <JobId, Payload> = LevelJobsServer<JobId, Payload> & LevelJobsClientQueue<JobId, Payload>

/** Combine the jobs server and client */
declare function Jobs <JobId extends string, Payload = unknown>(
  db: JobDb<JobId, Payload>,
  worker: JobWorker<JobId, Payload> | BatchJobWorker<JobId, Payload>,
  options?: Partial<LevelJobsOptions>
): LevelJobsQueue<JobId, Payload>

export default Jobs
