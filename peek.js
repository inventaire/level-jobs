import { EntryStream } from 'level-read-stream'

export default peek

async function peek (db, batchLength) {
  return new Promise((resolve, reject) => {
    try {
      const entries = []
      new EntryStream(db, { limit: batchLength })
      .on('data', entry => entries.push(entry))
      .on('error', reject)
      .once('end', () => resolve(entries))
    } catch (err) {
      reject(err)
    }
  })
}
