import t from 'tap'
import ClientJobs from '../client.js'
import Jobs from '../index.js'
import { defer, testLevel } from './utils.js'
import assert from 'node:assert'

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

t.test('can insert job with custom id', async t => {
  const db = testLevel()
  const clientQueue = ClientJobs(db)
  const { promise, resolve } = defer()

  const batch = [
    [ 'a', { foo: 'bar', seq: 1 } ],
    [ 'b', { foo: 'bar', seq: 2 } ],
    [ 'c', { foo: 'bar', seq: 3 } ],
  ]

  for (const [ id, payload ] of batch) {
    await clientQueue.pushWithCustomJobId(id, payload)
  }

  const entries = []
  clientQueue.runningStream({})
  .on('data', entry => entries.push(entry))
  .on('end', () => {
    let i = 0
    for (const [ key, value ] of batch) {
      assert.deepEqual(entries[i++], { key, value })
    }
    resolve()
  })

  await promise
})


t.test('can insert jobs in batches with custom ids', async t => {
  const db = testLevel()
  const clientQueue = ClientJobs(db)
  const { promise, resolve } = defer()

  const batch = [
    [ 'a', { foo: 'bar', seq: 1 } ],
    [ 'b', { foo: 'bar', seq: 2 } ],
    [ 'c', { foo: 'bar', seq: 3 } ],
  ]

  await clientQueue.pushBatchWithCustomJobIds(batch)

  const entries = []
  clientQueue.runningStream({})
  .on('data', entry => entries.push(entry))
  .on('end', () => {
    let i = 0
    for (const [ key, value ] of batch) {
      assert.deepEqual(entries[i++], { key, value })
    }
    resolve()
  })

  await promise
})
