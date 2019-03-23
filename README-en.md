### ProcessPool of Node.js 

#### Background

Node is a single-threaded model. When multiple independent and time-consuming tasks need to be performed, tasks can only be distributed through child_process to improve processing speed. Unlike multi-threaded languages like Java, parallel problems can be solved by threads. Node only Processes can be created for processing; but processes are too expensive for threads. Once the number of processes is large, CPU and memory consumption is severe (affecting other things I do), so I made a simple version of the process pool to solve the parallel task processing.

#### Thinking analysis

Master process + work process group

ProcessPool is where we manage the process. We pass a configuration parameter (the task script, the parameters required by the script, the maximum number of parallel processes) to generate a ProcessPool instance, and then use this instance to manage the process pool.

ProcessItem is the process object in our process pool. In addition to the process information, the ProcessItem object also adds a unique identifier and status (busy, task failed, task completed, process unavailable).

When a batch of tasks starts, we will fork to the maximum number of parallel processes at one time, and then start monitoring whether there is a work process to complete the task. If there is a work process to complete the task, then we can reuse the work process and let it perform new tasks. ; If the task fails, we will return the task to the process pool and wait for the next distribution.

Since the master process is responsible for the IPC and constantly monitors the completion of the batch task, the current method I use is setInterval cutting, so that IPC and monitoring can be alternated (ps: there should be a better way

#### How to use?

#### Installation

```bash
npm install node-process-pool
```

##### Usage

```js
// Process pool usage example
const ProcessPool = require('node-process-pool')
const taskParams = []
for (let i = 0; i < 5000; i++) {
  taskParams[i] = [i]
}
// Create a process pool instance
const processPool = new ProcessPool({
  maxParallelProcess: 50, // Supports maximum number of process parallelism
  timeToClose: 60 * 1000, // The maximum time for a single task to be executed
  dependency: `const path = require('path')`, // task script dependencies
  workDir: __dirname, // current directory
  taskName: 'test', // task script name
  script: async function task(taskParams) {
    console.log(taskParams)
  },
  taskParams // Need to perform the task parameter list, two-dimensional array
})
// Process pools are used to handle large scale tasks
processPool.run()
```

#### Todo

1. Fixed logic
2. Optimize the code