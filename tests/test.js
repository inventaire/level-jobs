import t from 'tap'
import async from 'async'
import Jobs from '../index.js'
import { testLevel } from './utils.js'

const { test } = t

test('passes job id into worker fn', function (t) {
  const db = testLevel()

  const queue = Jobs(db, worker)
  const jobId = queue.push({ foo: 'bar' }, t.ifError.bind(t))

  function worker (id, work, cb) {
    t.equal(id, jobId + '')
    t.end()
  };
})

test('infinite concurrency', function (t) {
  const db = testLevel()

  const max = 10
  const queue = Jobs(db, worker)

  for (let i = 1; i <= max; i++) {
    queue.push({ n: i }, pushed)
  }

  function pushed (err) {
    if (err) throw err
  }

  let count = 0
  const cbs = []
  function worker (id, work, cb) {
    count++
    t.equal(work.n, count)
    cbs.push(cb)
    if (count == max) callback()
  };

  function callback () {
    while (cbs.length) cbs.shift()()
  }
  queue.on('drain', function () {
    if (count == max) {
      t.equal(cbs.length, 0)
      t.equal(queue._concurrency, 0)
      db.once('closed', t.end.bind(t))
      db.close()
    }
  })
})

test('concurrency of 1', function (t) {
  const db = testLevel()

  const max = 10
  const concurrency = 1
  const queue = Jobs(db, worker, concurrency)

  for (let i = 1; i <= max; i++) {
    queue.push({ n: i }, pushed)
  }

  function pushed (err) {
    if (err) throw err
  }

  let count = 0
  let working = false
  function worker (id, work, cb) {
    t.notOk(working, 'should not be concurrent')
    count++
    working = true
    t.equal(work.n, count)
    setTimeout(function () {
      working = false
      cb()
    }, 100)
  };

  queue.on('drain', function () {
    if (count == max) {
      t.equal(queue._concurrency, 0)
      db.once('closed', t.end.bind(t))
      db.close()
    }
  })
})

test('retries on error', function (t) {
  const db = testLevel()

  const max = 10
  const queue = Jobs(db, worker)

  for (let i = 1; i <= max; i++) {
    queue.push({ n: i }, pushed)
  }

  function pushed (err) {
    if (err) throw err
  }

  const erroredOn = {}
  let count = 0
  let working = false
  function worker (id, work, cb) {
    count++
    if (!erroredOn[work.n]) {
      erroredOn[work.n] = true
      cb(new Error('oops!'))
    } else {
      working = true
      cb()
    }
  };

  queue.on('drain', function () {
    if (count == max * 2) {
      t.equal(queue._concurrency, 0)
      db.once('closed', t.end.bind(t))
      db.close()
    }
  })
})

test('emits retry event on retry', function (t) {
  const db = testLevel()
  const queue = Jobs(db, worker)

  queue.on('error', Function())

  queue.once('retry', function (err) {
    db.once('closed', t.end.bind(t))
    db.close()
  })

  function worker (id, work, cb) {
    cb(new Error('oops!'))
  };

  queue.push({ foo: 'bar' })
})

test('works with no push callback', function (t) {
  const db = testLevel()
  const jobs = Jobs(db, worker)

  function worker (id, payload, done) {
    done()
    process.nextTick(function () {
      db.once('closed', t.end.bind(t))
      db.close()
    })
  };

  jobs.push({ foo: 'bar' })
})

test('has exponential backoff in case of error', function (t) {
  const db = testLevel()
  const jobs = Jobs(db, worker)

  function worker (id, payload, done) {
    done(new Error('Oh no!'))
  };

  jobs.once('error', function (err) {
    t.equal(err.message, 'max retries reached')
    db.once('closed', t.end.bind(t))
    db.close()
  })

  jobs.push({ foo: 'bar' })
})

test('can delete job', function (t) {
  const db = testLevel()
  const jobs = Jobs(db, worker)

  let processed = 0

  function worker (id, payload, done) {
    processed += 1
    t.ok(processed <= 1, 'worker is not called 2 times')

    jobs.del(job2Id, function (err) {
      if (err) throw err
      done()
    })

    setTimeout(function () {
      db.once('closed', t.end.bind(t))
      db.close()
    }, 500)
  };

  const job1Id = jobs.push({ foo: 'bar', seq: 1 })
  t.type(job1Id, 'number')
  var job2Id = jobs.push({ foo: 'bar', seq: 2 })
  t.type(job2Id, 'number')
})

test('can get runningStream & pendingStream', function (t) {
  const db = testLevel()
  const jobs = Jobs(db, worker)

  const works = [
    { foo: 'bar', seq: 1 },
    { foo: 'bar', seq: 2 },
    { foo: 'bar', seq: 3 }
  ]

  const workIds = []

  async.each(works, insert, doneInserting)

  function insert (work, done) {
    workIds.push(jobs.push(work, done).toString())
  }

  function doneInserting (err) {
    if (err) throw err

    jobs.runningStream().on('data', onData)
    jobs.pendingStream().on('data', onData)

    let seq = -1
    function onData (d) {
      seq += 1

      const id = d.key
      const work = d.value
      t.equal(id, workIds[seq])
      const expected = works[seq]

      t.deepEqual(work, expected)
      if (seq == works.length - 1) {
        process.nextTick(function () {
          db.once('closed', t.end.bind(t))
          db.close()
        })
      }
    }
  }

  function worker (id, payload, done) {
    // do nothing
  };
})

test('doesn\'t skip past failed tasks', function (t) {
  const db = testLevel()

  const max = 10
  const queue = Jobs(db, worker, 1)

  for (let i = 1; i <= max; i++) {
    queue.push({ n: i }, pushed)
  }

  function pushed (err) {
    if (err) throw err
  }

  const erroredOn = {}
  let count = 0
  let next = 1
  let working = false
  function worker (id, work, cb) {
    // fail every other one
    if (work.n % 2 && !erroredOn[work.n]) {
      erroredOn[work.n] = true
      cb(new Error('oops!'))
    } else {
      count++
      working = true
      t.equal(next++, work.n)
      cb()
    }
  };

  queue.on('drain', function () {
    if (count === max) {
      t.equal(queue._concurrency, 0)
      db.once('closed', t.end.bind(t))
      process.nextTick(function () {
        db.close()
      })
    }
  })
})

test('continues after close and reopen', function (t) {
  let db = testLevel()

  const max = 10
  const restartAfter = max / 2 | 0
  let queue = Jobs(db, worker, 1)

  for (let i = 1; i <= max; i++) {
    queue.push({ n: i }, pushed)
  }

  function pushed (err) {
    if (err) throw err
  }

  let count = 0
  function worker (id, work, cb) {
    count++
    t.equal(work.n, count)
    cb()

    if (count === restartAfter) {
      db.close(function () {
        db = testLevel()
        queue = Jobs(db, worker, 1)
        queue.on('drain', function () {
          if (count === max) {
            t.equal(queue._concurrency, 0)
            db.once('closed', t.end.bind(t))
            process.nextTick(function () {
              db.close()
            })
          }
        })
      })
    }
  };
})
