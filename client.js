import assert from 'node:assert'
import { EventEmitter } from 'node:events'
import { inherits } from 'node:util'
import stringify from 'json-stringify-safe'
import { EntryStream } from 'level-read-stream'
import { timestamp } from './timestamp.js'

export default function ClientQueue (db) {
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

Q.push = async function push (payload) {
  const id = timestamp()
  await this._work.put(id, stringifyPayload(payload))
  return id
}

Q.pushWithCustomJobId = async function pushWithCustomJobId (id, payload) {
  await this._work.put(id, stringifyPayload(payload))
}

Q.pushBatch = async function pushBatch (payloads) {
  const ids = []

  const ops = payloads.map(payload => {
    const id = timestamp()
    ids.push(id)
    return {
      type: 'put',
      key: id,
      value: stringifyPayload(payload),
    }
  })

  await this._work.batch(ops)

  return ids
}

Q.pushBatchWithCustomJobIds = async function pushBatch (entries) {
  const ops = entries.map(([ id, payload ]) => {
    return {
      type: 'put',
      key: id,
      value: stringifyPayload(payload),
    }
  })
  await this._work.batch(ops)
}

Q.del = async function del (id) {
  return this._work.del(id)
}

Q.delBatch = async function del (ids) {
  const ops = ids.map(id => {
    return { type: 'del', key: id }
  })
  return this._work.batch(ops)
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

function stringifyPayload (payload) {
  // Allow to pass an empty payload, if all the data the job needs is already in the custom job id
  if (payload != null) return stringify(payload)
  else return ''
}
