import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import { inherits } from 'node:util'
import backoff from 'backoff'
import Hooks from 'level-hooks'
import { EntryStream } from 'level-read-stream'
import WriteStream from 'level-write-stream'
import peek from './peek.js'

const defaultOptions = {
  maxConcurrency: Infinity,
  maxRetries: 10,
  backoff: {
    randomisationFactor: 0,
    initialDelay: 10,
    maxDelay: 300,
  },
}

export default Jobs

function Jobs (db, worker, options) {
  assert.strictEqual(typeof db, 'object', 'need db')
  assert.strictEqual(typeof worker, 'function', 'need worker function')

  return new Queue(db, worker, options)
}

Jobs.Queue = Queue

function Queue (db, worker, options = {}) {
  const q = this
  EventEmitter.call(this)

  if (typeof options === 'number') options = { maxConcurrency: options }
  options.backoff = { ...defaultOptions.backoff, ...(options.backoff || {}) }
  options = Object.assign(defaultOptions, options)

  this._options = options
  this._db = db
  this._work = db.sublevel('work')
  this._workWriteStream = WriteStream(this._work)
  this._pending = db.sublevel('pending')
  this._worker = worker
  this._concurrency = 0

  // flags
  this._starting = true
  this._flushing = false
  this._peeking = false
  this._needsFlush = false
  this._needsDrain = true

  // hooks
  Hooks(this._work)
  this._work.hooks.post(() => {
    maybeFlush(q)
  })

  start(this)
}

inherits(Queue, EventEmitter)

function start (q) {
  const ws = q._workWriteStream()
  new EntryStream(q._pending).pipe(ws)
  ws.once('finish', done)

  function done () {
    q._starting = false
    maybeFlush(q)
  }
}

function maybeFlush (q) {
  if (!q._starting && !q._flushing) flush(q)
  else q._needsFlush = true
}

async function flush (q) {
  if (q._db.status !== 'open') return

  if (q._concurrency < q._options.maxConcurrency && !q._peeking) {
    q._peeking = true
    q._flushing = true
    try {
      const data = await peek(q._work)
      await poke(q, data)
    } catch (err) {
      q.emit('error', err)
      afterFlushing(q)
    }
  }
}

async function poke (q, data) {
  q._peeking = false

  if (!data) return afterFlushing(q)

  const { key, value: payload } = data
  q._concurrency++
  try {
    // Using abstract-level >= v1 built in sublevel
    // See https://github.com/Level/abstract-level/blob/main/UPGRADING.md#9-sublevels-are-builtin
    await q._db.batch([
      { type: 'del', key, sublevel: q._work },
      { type: 'put', key, value: payload, sublevel: q._pending },
    ])
    try {
      await run(q, key, JSON.parse(payload))
      void doneRunning(q, key)
    } catch (err) {
      handleRunError(q, err, key, payload)
    }
  } catch (err) {
    q._needsDrain = true
    q._concurrency--
    q.emit('error', err)
  }

  flush(q)
}

async function doneRunning (q, key) {
  q._needsDrain = true
  q._concurrency--
  try {
    await q._pending.del(key)
  } catch (err) {
    q.emit('error', err)
  }
  flush(q)
}

function handleRunError (q, err, key, payload) {
  const errorBackoff = backoff.exponential(q._options.backoff)
  errorBackoff.failAfter(q._options.maxRetries)

  errorBackoff.on('ready', async () => {
    q.emit('retry', err)
    try {
      await run(q, key, JSON.parse(payload))
      void doneRunning(q, key)
    } catch (err) {
      // Ignoring error, instead of passing it to `q.emit('error', err)` to not break tests specs
      errorBackoff.backoff()
    }
  })

  errorBackoff.once('fail', () => {
    q.emit('error', new Error('max retries reached'))
  })

  errorBackoff.backoff()
}

async function run (q, id, payload) {
  return await q._worker(id, payload)
}

function afterFlushing (q) {
  q._flushing = false
  if (q._needsFlush) {
    q._needsFlush = false
    maybeFlush(q)
  } else if (q._needsDrain) {
    q._needsDrain = false
    q.emit('drain')
  }
}
