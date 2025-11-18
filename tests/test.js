import assert from 'node:assert'
import t from 'tap'
import Jobs from '../index.js'
import { testLevel, defer, wait } from './utils.js'

t.test('passes job id into worker fn', async t => {
  const db = testLevel()

  const queue = Jobs(db, worker)
  const jobId = await queue.push({ foo: 'bar' })

  const { promise, resolve } = defer()

  async function worker (id) {
    t.equal(id, jobId + '')
    resolve()
  }

  await promise
})

t.test('infinite concurrency', async t => {
  const db = testLevel()

  const max = 10
  const queue = Jobs(db, worker)

  for (let i = 1; i <= max; i++) {
    queue.push({ n: i })
  }

  let count = 0
  async function worker (id, payload) {
    count++
    t.equal(payload.n, count)
  }

  const { promise, resolve } = defer()
  queue.on('drain', () => {
    if (count === max) {
      t.equal(queue._concurrency, 0)
      db.once('closed', resolve)
      db.close()
    }
  })
  await promise
})

t.test('concurrency of 1', async t => {
  const db = testLevel()

  const max = 10
  const concurrency = 1
  const queue = Jobs(db, worker, concurrency)

  for (let i = 1; i <= max; i++) {
    await queue.push({ n: i })
  }

  let count = 0
  let working = false
  async function worker (id, payload) {
    t.notOk(working, 'should not be concurrent')
    count++
    working = true
    t.equal(payload.n, count)
    await wait(100)
    working = false
  }

  const { promise, resolve } = defer()
  queue.on('drain', () => {
    if (count === max) {
      t.equal(queue._concurrency, 0)
      db.once('closed', resolve)
      db.close()
    }
  })
  await promise
})

t.test('batch mode', async t => {
  const db = testLevel()

  let workerCallsCount = 0
  let workerEntriesCount = 0
  const max = 10
  const batchLength = max / 2
  const queue = Jobs(db, batchWorker, { batchLength })

  for (let i = 1; i <= max; i++) {
    queue.push({ n: i })
  }

  async function batchWorker (entries) {
    workerCallsCount++
    t.equal(entries.length, batchLength)
    entries.forEach(([ id, payload ]) => {
      workerEntriesCount++
      t.equal(payload.n, workerEntriesCount)
    })
  }

  const { promise, resolve } = defer()
  queue.on('drain', () => {
    if (workerEntriesCount === max) {
      t.equal(workerCallsCount, 2)
      t.equal(queue._concurrency, 0)
      db.once('closed', resolve)
      db.close()
    }
  })
  await promise
})

t.test('retries on error', async t => {
  const db = testLevel()
  const erroredOn = {}
  let count = 0

  const max = 10
  const queue = Jobs(db, worker)

  for (let i = 1; i <= max; i++) {
    await queue.push({ n: i })
  }

  async function worker (id, payload) {
    count++
    if (!erroredOn[payload.n]) {
      erroredOn[payload.n] = true
      throw new Error('oops!')
    }
  }

  const { promise, resolve } = defer()
  queue.on('drain', () => {
    if (count === max * 2) {
      t.equal(queue._concurrency, 0)
      resolve()
    }
  })
  await promise
})

t.test('emits retry event on retry', async () => {
  const db = testLevel()
  const queue = Jobs(db, worker)

  async function worker () {
    throw new Error('oops!')
  }
  const { promise, resolve, reject } = defer()
  queue.on('error', reject)
  queue.once('retry', err => {
    t.ok(err)
    resolve()
  })
  queue.push({ foo: 'bar' })
  await promise
})

t.test('has exponential backoff in case of error', async t => {
  const db = testLevel()
  const jobs = Jobs(db, worker)

  async function worker () {
    throw new Error('Oh no!')
  }

  await jobs.push({ foo: 'bar' })

  const { promise, resolve } = defer()
  jobs.once('error', err => {
    t.equal(err.message, 'max retries reached')
    resolve()
  })
  await promise
})

t.test('can set worker timeout', async t => {
  const db = testLevel()
  const workerTimeout = 10
  const jobs = Jobs(db, worker, {
    workerTimeout,
    maxRetries: 2,
    backoff: {
      maxDelay: 0
    }
  })

  async function worker () {
    await wait(10000)
  }

  await jobs.push({ foo: 'bar' })

  const { promise, resolve } = defer()
  jobs.once('retry', err => {
    t.equal(err.name, 'TimeoutError')
    t.equal(err.message, `Promise timed out after ${workerTimeout} milliseconds`)
  })
  jobs.once('error', err => {
    t.equal(err.message, 'max retries reached')
    resolve()
  })
  await promise
})

t.test('can delete job', async t => {
  const db = testLevel()
  let processed = 0
  const jobs = Jobs(db, worker)

  const { promise, resolve } = defer()
  async function worker () {
    processed += 1
    t.ok(processed <= 1, 'worker is not called 2 times')
    await jobs.del(job2Id)
    resolve()
  }

  const job1Id = await jobs.push({ foo: 'bar', seq: 1 })
  t.type(job1Id, 'number')
  const job2Id = await jobs.push({ foo: 'bar', seq: 2 })
  t.type(job2Id, 'number')

  await promise
})

t.test('can get runningStream & pendingStream', async t => {
  const db = testLevel()
  const jobs = Jobs(db, worker)

  const payloads = [
    { foo: 'bar', seq: 1 },
    { foo: 'bar', seq: 2 },
    { foo: 'bar', seq: 3 },
  ]

  const workIds = await Promise.all(payloads.map(async payload => {
    const jobId = await jobs.push(payload)
    return jobId.toString()
  }))

  jobs.runningStream().on('data', onData)
  jobs.pendingStream().on('data', onData)

  const { promise, resolve } = defer()

  let seq = -1
  function onData (d) {
    seq += 1

    const id = d.key
    const payload = d.value
    t.equal(id, workIds[seq])
    const expected = payloads[seq]

    assert.deepEqual(payload, expected)
    if (seq === payloads.length - 1) {
      resolve()
    }
  }

  async function worker () {
    // do nothing
  }

  await promise
})

t.test('doesn\'t skip past failed tasks', async t => {
  const db = testLevel()
  const erroredOn = {}
  let count = 0
  let next = 1

  const max = 10
  const queue = Jobs(db, worker, 1)

  for (let i = 1; i <= max; i++) {
    await queue.push({ n: i })
  }

  async function worker (id, payload) {
    // fail every other one
    if (payload.n % 2 && !erroredOn[payload.n]) {
      erroredOn[payload.n] = true
      throw new Error('oops!')
    } else {
      count++
      t.equal(next++, payload.n)
    }
  }

  const { promise, resolve } = defer()
  queue.on('drain', () => {
    if (count === max) {
      t.equal(queue._concurrency, 0)
      resolve()
    }
  })
  await promise
})

t.test('continues after close and reopen', async t => {
  let db = testLevel()

  const max = 10
  const restartAfter = max / 2 | 0
  let count = 0

  const { promise, resolve } = defer()

  async function worker (id, payload) {
    count++
    t.equal(payload.n, count)
    afterWorker()
  }

  let queue = Jobs(db, worker, 1)
  for (let i = 1; i <= max; i++) {
    await queue.push({ n: i })
  }

  function afterWorker () {
    if (count === restartAfter) {
      db.close(() => {
        db = testLevel()
        queue = Jobs(db, worker, 1)
        queue.on('drain', () => {
          if (count === max) {
            t.equal(queue._concurrency, 0)
            db.once('closed', resolve)
            process.nextTick(() => {
              db.close()
            })
          }
        })
      })
    }
  }

  await promise
})

t.test('empty payload', async t => {
  const db = testLevel()

  const queue = Jobs(db, worker)
  const jobId = 'someCustomId'
  await queue.pushWithCustomJobId(jobId, undefined)

  const { promise, resolve } = defer()

  async function worker (id, payload) {
    t.equal(id, jobId)
    t.equal(payload, undefined)
    resolve()
  }

  await promise
})