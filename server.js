import assert from 'node:assert'
import { inherits } from 'node:util'
import { EventEmitter } from 'node:events'
import backoff from 'backoff'
import Hooks from 'level-hooks'
import WriteStream from 'level-write-stream'
import peek from './peek.js'
import { EntryStream } from 'level-read-stream'

const defaultOptions = {
  maxConcurrency: Infinity,
  maxRetries: 10,
  backoff: {
    randomisationFactor: 0,
    initialDelay: 10,
    maxDelay: 300
  }
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

/// start

function start (q) {
  const ws = q._workWriteStream()
  new EntryStream(q._pending).pipe(ws)
  ws.once('finish', done)

  function done () {
    q._starting = false
    maybeFlush(q)
  }
}

/// maybeFlush

function maybeFlush (q) {
  if (!q._starting && !q._flushing) flush(q)
  else q._needsFlush = true
}

/// flush

function flush (q) {
  if(q._db.status !== 'open') return

  if (q._concurrency < q._options.maxConcurrency && !q._peeking) {
    q._peeking = true
    q._flushing = true
    peek(q._work, poke)
  }

  function poke (err, key, work) {
    q._peeking = false
    if (err) {
      if (err.code === 'LEVEL_DATABASE_NOT_OPEN' || err.code === 'LEVEL_ITERATOR_NOT_OPEN') return
      else return q.emit('error', err)
    }

    let done = false

    if (key) {
      q._concurrency++
      // Using abstract-level >= v1 built in sublevel
      // See https://github.com/Level/abstract-level/blob/main/UPGRADING.md#9-sublevels-are-builtin
      q._db.batch([
        { type: 'del', key, sublevel: q._work },
        { type: 'put', key, value: work, sublevel: q._pending }
      ], transfered)
    } else {
      q._flushing = false
      if (q._needsFlush) {
        q._needsFlush = false
        maybeFlush(q)
      } else if (q._needsDrain) {
        q._needsDrain = false
        q.emit('drain')
      }
    }

    function transfered (err) {
      if (err) {
        q._needsDrain = true
        q._concurrency--
        q.emit('error', err)
      } else {
        run(q, key, JSON.parse(work), ran)
      }
      flush(q)
    }

    function ran (err) {
      if (!err) {
        if (!done) {
          done = true
          q._needsDrain = true
          q._concurrency--
          q._pending.del(key, deletedPending)
        }
      } else handleRunError(err)
    }

    function deletedPending (_err) {
      if (err) q.emit('error', _err)
      flush(q)
    }

    function handleRunError (err) {
      const errorBackoff = backoff.exponential(q._options.backoff)
      errorBackoff.failAfter(q._options.maxRetries)

      errorBackoff.on('ready', () => {
        q.emit('retry', err)
        run(q, key, JSON.parse(work), ranAgain)
      })

      errorBackoff.once('fail', () => {
        q.emit('error', new Error('max retries reached'))
      })

      function ranAgain (err) {
        if (err) errorBackoff.backoff()
        else ran()
      }

      errorBackoff.backoff()
    }
  }
}

/// run

function run (q, id, work, cb) {
  q._worker(id, work, cb)
}
