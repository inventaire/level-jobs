import Server from './server.js'
import Client from './client.js'

// Combine Server and Client
export default function Jobs (db, worker, options) {
  // @ts-expect-error
  return mixin(Server(db, worker, options), Client.Queue.prototype)
}

function mixin (a, b) {
  const target = Object.create(a) // avoids modifying original
  Object.keys(b).forEach(key => {
    target[key] = b[key]
  })
  return target
}
