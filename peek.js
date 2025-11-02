import { EntryStream } from 'level-read-stream'

export default peek

async function peek (db) {
  return new Promise((resolve, reject) => {
    try {
      const s = new EntryStream(db, { limit: 1 })

      s.on('error', reject)
      s.once('end', resolve)
      s.once('data', resolve)
    } catch (err) {
      reject(err)
    }
  })
}
