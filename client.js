import assert from 'node:assert'
import { inherits } from 'node:util'
import { EventEmitter } from 'node:events'
import stringify from 'json-stringify-safe'
import { timestamp } from './timestamp.js'
import { EntryStream } from 'level-read-stream'

export default ClientQueue

function ClientQueue (db, worker, options) {
  assert.strictEqual(typeof db, 'object', 'need db')
  assert.strictEqual(arguments.length, 1, 'cannot define worker on client')

  return new Queue(db)
}

ClientQueue.Queue = Queue

function Queue (db) {
  EventEmitter.call(this)

  this._db = db
  this._pending = db.sublevel('pending')
  this._work = db.sublevel('work')
}

inherits(Queue, EventEmitter)

const Q = Queue.prototype

/// push

Q.push = function push (payload, cb) {
  const q = this
  const id = timestamp()
  this._work.put(id, stringify(payload), put)

  return id

  function put (err) {
    if (err) {
      if (cb) cb(err)
      else q.emit('error', err)
    } else if (cb) cb()
  }
}

/// pushBatch

Q.pushBatch = function push (payloads, cb) {
  const q = this
  const ids = []

  const ops = payloads.map(payload => {
    const id = timestamp()
    ids.push(id)
    return {
      type: 'put',
      key: id,
      value: stringify(payload)
    }
  })

  this._work.batch(ops, batch)

  return ids

  function batch (err) {
    if (err) {
      if (cb) cb(err)
      else q.emit('error', err)
    } else if (cb) cb()
  }
}

/// del

Q.del = function del (id, cb) {
  this._work.del(id, cb)
}

/// delBatch

Q.delBatch = function del (ids, cb) {
  const ops = ids.map(id => {
    return { type: 'del', key: id }
  })
  this._work.batch(ops, cb)
}

Q.pendingStream = function pendingStream (options) {
  if (!options) options = {}
  else options = { ...options }
  options.valueEncoding = 'json'
  return new EntryStream(this._pending, options)
}

Q.runningStream = function runningStream (options) {
  if (!options) options = {}
  else options = { ...options }
  options.valueEncoding = 'json'
  return new EntryStream(this._work, options)
}
