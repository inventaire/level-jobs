import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import { inherits } from 'node:util'
import Hooks from 'level-hooks'
import { EntryStream } from 'level-read-stream'
import WriteStream from 'level-write-stream'
import peek from './peek.js'
import { setTimeout } from 'node:timers/promises'
import pTimeout from 'p-timeout'

const defaultOptions = Object.freeze({
  maxConcurrency: Infinity,
  maxRetries: 10,
  workerTimeout: Infinity,
  batchLength: 1,
  backoff: {
    randomisationFactor: 0,
    initialDelay: 10,
    maxDelay: 300,
  },
})

export default function Jobs (db, worker, options) {
  assert.strictEqual(typeof db, 'object', 'need db')
  assert.strictEqual(typeof worker, 'function', 'need worker function')
  if (options?.batchLength > 1) {
    assert.strictEqual(worker.length, 1, 'worker function in batch mode needs to accept an array of [ jobId, payload ] entries as single argument')
  } else {
    // Commented-out as a custom jobId without payload could be enough for the worker
    // assert.strictEqual(worker.length, 2, 'worker function in non-batch mode needs to accept a jobId and a payload')
  }
  return new Queue(db, worker, options)
}

Jobs.Queue = Queue

function Queue (db, worker, options = {}) {
  const q = this
  EventEmitter.call(this)

  if (typeof options === 'number') options = { maxConcurrency: options }
  options.backoff = { ...defaultOptions.backoff, ...(options.backoff || {}) }
  options = Object.assign({}, defaultOptions, options)
  validateOptions(options)

  this._options = options
  this._db = db
  this._work = db.sublevel('work')
  this._workWriteStream = WriteStream(this._work)
  this._pending = db.sublevel('pending')
  this._worker = worker
  this._concurrency = 0
  this._batchMode = q._options.batchLength > 1

  this._starting = true
  this._flushing = false
  this._peeking = false
  this._needsFlush = false
  this._needsDrain = true

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
      const entries = await peek(q._work, q._options.batchLength)
      await poke(q, entries)
    } catch (err) {
      q.emit('error', err)
      afterFlushing(q)
    }
  }
}

async function poke (q, entries) {
  q._peeking = false

  if (!entries || entries.length === 0) return afterFlushing(q)

  q._concurrency++
  try {
    const ops = entries.flatMap(({ key, value }) => {
      return [
        // Using abstract-level >= v1 built in sublevel
        // See https://github.com/Level/abstract-level/blob/main/UPGRADING.md#9-sublevels-are-builtin
        { type: 'del', key, sublevel: q._work },
        { type: 'put', key, value, sublevel: q._pending },
      ]
    })
    await q._db.batch(ops)
    await persistentRun(q, entries)
  } catch (err) {
    q._needsDrain = true
    q._concurrency--
    q.emit('error', err)
  }

  flush(q)
}

async function persistentRun (q, entries) {
  async function runWorker (attempts = 0) {
    try {
      if (q._batchMode) {
        const batchWorkerEntries = entries.map(({ key, value }) => {
          return [ key, parsePayload(value)]
        })
        await pTimeout(q._worker(batchWorkerEntries), { milliseconds: q._options.workerTimeout })
      } else {
        const { key, value: payload } = entries[0]
        await pTimeout(q._worker(key, parsePayload(payload)), { milliseconds: q._options.workerTimeout })
      }
      void doneRunning(q, entries)
    } catch (err) {
      if (attempts < q._options.maxRetries) {
        await backoff(attempts, q._options.backoff)
        q.emit('retry', err)
        return runWorker(attempts + 1)
      } else {
        // Stop trying and drop job
        const finalErr = new Error('max retries reached')
        finalErr.cause = err
        q.emit('error', finalErr)
      }
    }
  }
  await runWorker()
}

function parsePayload (value) {
  // The payload can be empty, if all the data the job needs is already in the custom job id
  if (value !== '') return JSON.parse(value)
}

async function doneRunning (q, entries) {
  q._needsDrain = true
  q._concurrency--
  try {
    const ops = entries.map(({ key }) => ({ type: 'del', key }))
    await q._pending.batch(ops)
  } catch (err) {
    q.emit('error', err)
  }
  flush(q)
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

async function backoff (attempts, options) {
  const baseBackoffDelay = options.initialDelay * 2 ** attempts
  const randomisationMultiple = 1 + Math.random() * options.randomisationFactor
  const randomizedDelay = Math.round(baseBackoffDelay * randomisationMultiple)
  const delay = Math.min(randomizedDelay, options.maxDelay)
  await setTimeout(delay)
}

function validateOptions (options) {
  const { initialDelay, maxDelay, randomisationFactor } = options
  if (maxDelay <= initialDelay) {
    throw new Error('The maximal backoff delay must be greater than the initial backoff delay.')
  }
  if (randomisationFactor < 0 || randomisationFactor > 1) {
    throw new Error('The randomisation factor must be between 0 and 1.');
  }
}
