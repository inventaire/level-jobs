# level-jobs

> Job Queue in LevelDB for Node.js

[![Build Status](https://travis-ci.org/pgte/level-jobs.png?branch=master)](https://travis-ci.org/pgte/level-jobs)

* Define worker functions
* Persist work units
* Work units are retried when failed
* Define maximum concurrency

## Install

```bash
$ npm install level-jobs --save
```

## Use

### Create a levelup database

```javascript
import level from 'classic-level'
const db = level('./db')
```

### Import level-jobs

```javascript
import Jobs from 'level-jobs'
```

### Define a worker function

This function will take care of a work unit.

```javascript
async function worker(id, payload) {
  await doSomething()
}
```

This function gets 3 arguments:

- `id` uniquely identifies a job to be executed.
- `payload` contains everyting `worker` need to process the job.

If the function throws an error, the work unit is retried.

### Wrap the database

```javascript
const queue = Jobs(db, worker)
```

This database will be at the mercy and control of level-jobs, don't use it for anything else!

(this database can be a root levelup database or a sublevel)

You can define a maximum concurrency (the default is `Infinity`):

```javascript
const maxConcurrency = 2
const queue = Jobs(db, worker, maxConcurrency)
```

### More Options

As an alternative the third argument can be an options object with these defaults:

```javascript
const options = {
  maxConcurrency: Infinity,
  maxRetries:     10,
  workerTimeout: Infinity,
  batchLength: 1,
  backoff: {
    randomisationFactor: 0,
    initialDelay: 10,
    maxDelay: 300
  }
}

const queue = Jobs(db, worker, options)
```

### Push work to the queue

```javascript
const payload = { what: 'ever' }

try {
  const jobId = await queue.push(payload))
} catch (err) {
  console.error('Error pushing work into the queue', err.stack)
}
```

or in batch:
```javascript
const payloads = [
  { what: 'ever' },
  { what: 'ever' }
]

try {
  const jobIds = await queue.pushBatch(payloads)
} catch (err) {
  console.error('Error pushing works into the queue', err.stack)
}
```

### Delete pending job

(Only works for jobs that haven't started yet!)

```javascript
try {
  await queue.del(jobId)
} catch (err) {
  console.error('Error deleting job', err.stack)
}
```

or in batch:
```javascript
try {
  await queue.delBatch(jobIds)
} catch (err) {
  console.error('Error deleting jobs', err.stack)
}
```

### Worker batch mode

By default, the worker received one job id and payload at a time, but it's also possible to execute jobs in batches:
```javascript
async function batchWorker(jobEntries) {
  await doSomething()
}
```

This function gets a single argument: `jobEntries`, which is an array of job ids and payloads tuples.

**To use a batch worker, the queue `batchLength` option MUST be above 1**. For example:

```javascript
const queue = Jobs(db, batchWorker, {
  batchLength: 50,
  maxConcurrency: 5,
})
```

### Traverse jobs

`queue.pendingStream()` emits queued jobs. `queue.runningStream()` emits currently running jobs.

```javascript
const stream = queue.pendingStream()
stream.on('data', function (data) {
  const jobId = data.key
  const payload = data.value
  console.log('pending job id: %s, payload: %j', jobId, payload)
})
```

### Events

A queue object emits the following event:

* `drain` — when there are no more jobs pending. Also happens on startup after consuming the backlog work units.
* `error` - when something goes wrong.
* `retry` - when a job is retried because something goes wrong.


## Client isolated API

If you simply want a pure queue client that is only able to push jobs into the queue, you can use `level-jobs/client` like this:

```javascript
import QueueClient from 'level-jobs/client'

const client = QueueClient(db)

try {
  await client.push(work)
  console.log('pushed')
} catch (err) {
  console.error('pushing failed', err)
}
```

## License

MIT
