import t from 'tap'
import Jobs from '../index.js'
import ClientJobs from '../client.js'
import { testLevel } from './utils.js'

const { test } = t

test('can insert and delete job', function (t) {
  const db = testLevel()
  const jobs = Jobs(db, worker)

  const clientQueue = ClientJobs(db)
  let processed = 0

  function worker (id, payload, done) {
    processed += 1
    t.ok(processed <= 1, 'worker is not called 2 times')

    clientQueue.del(job2Id, function (err) {
      if (err) throw err
      done()
    })

    setTimeout(function () {
      db.once('closed', t.end.bind(t))
      db.close()
    }, 500)
  };

  const job1Id = clientQueue.push({ foo: 'bar', seq: 1 })
  t.type(job1Id, 'number')

  var job2Id = clientQueue.push({ foo: 'bar', seq: 2 })
  t.type(job2Id, 'number')
})

test('can insert and delete jobs in batches', function (t) {
  const db = testLevel()
  const jobs = Jobs(db, worker)

  const clientQueue = ClientJobs(db)
  let processed = 0

  function worker (id, payload, done) {
    processed += 1
    t.ok(processed <= 1, 'worker is not called 2 times')

    const remainingJobsIds = jobBatchIds.slice(1)

    clientQueue.delBatch(remainingJobsIds, function (err) {
      if (err) throw err
      done()
    })

    setTimeout(function () {
      db.once('closed', t.end.bind(t))
      db.close()
    }, 500)
  };

  var jobBatchIds = clientQueue.pushBatch([
    { foo: 'bar', seq: 1 },
    { foo: 'bar', seq: 2 },
    { foo: 'bar', seq: 3 }
  ])

  jobBatchIds.forEach(function (id) {
    t.type(id, 'number')
  })
})
