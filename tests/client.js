import t from 'tap'
import ClientJobs from '../client.js'
import Jobs from '../index.js'
import { defer, testLevel } from './utils.js'

t.test('can insert and delete job', async t => {
  const db = testLevel()
  Jobs(db, worker)

  const clientQueue = ClientJobs(db)
  let processed = 0

  const { promise, resolve } = defer()

  async function worker () {
    processed += 1
    t.ok(processed <= 1, 'worker is not called 2 times')

    await clientQueue.del(job2Id)

    setTimeout(() => {
      db.once('closed', resolve)
      db.close()
    }, 500)
  };

  const job1Id = await clientQueue.push({ foo: 'bar', seq: 1 })
  t.type(job1Id, 'number')

  const job2Id = await clientQueue.push({ foo: 'bar', seq: 2 })
  t.type(job2Id, 'number')

  await promise
})

t.test('can insert and delete jobs in batches', async t => {
  const db = testLevel()
  Jobs(db, worker)

  const clientQueue = ClientJobs(db)
  let processed = 0

  const { promise, resolve } = defer()

  async function worker () {
    processed += 1
    t.ok(processed <= 1, 'worker is not called 2 times')

    const remainingJobsIds = jobBatchIds.slice(1)

    await clientQueue.delBatch(remainingJobsIds)

    setTimeout(() => {
      db.once('closed', resolve)
      db.close()
    }, 500)
  }

  const jobBatchIds = await clientQueue.pushBatch([
    { foo: 'bar', seq: 1 },
    { foo: 'bar', seq: 2 },
    { foo: 'bar', seq: 3 },
  ])

  jobBatchIds.forEach(id => {
    t.type(id, 'number')
  })

  await promise
})
