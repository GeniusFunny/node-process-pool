<p align="center">
	<img src="https://i.loli.net/2019/03/24/5c973b70e65b3.png"/>
<p>
<h1 align="center">A Process Pool for Node.js</h1>
[![npm package](https://img.shields.io/npm/v/node-process-pool.svg)](https://www.npmjs.org/package/node-process-pool)[![NPM downloads](https://img.shields.io/npm/dw/node-process-pool.svg)](http://npmjs.com/node-process-pool)![](https://img.shields.io/bundlephobia/min/node-process-pool.svg)![](https://img.shields.io/npm/l/node-process-pool.svg)

English | [简体中文](./README-zh_CN.md)

## 🖥 Background

Node.js is a single-threaded model. When multiple independent and time-consuming tasks need to be performed, tasks can only be distributed through child_process to improve processing speed. Unlike multi-threaded languages like Java, parallel problems can be solved by threads. Node.js only Processes can be created for processing; but processes are too expensive for threads. Once the number of processes is large, CPU and memory consumption is severe (affecting other things I do), so I made a simple version of the process pool to solve the parallel task processing.

Applicable scenarios: The same and independent and time-consuming tasks, for example, get the account password of 1000 users of a website, I want their information now, climb him, node-process-pool is very suitable.

## 🤔Thinking

Master process + work process group

ProcessPool is where we manage the process. We pass a configuration parameter (the task script, the parameters required by the script, the maximum number of parallel processes) to generate a ProcessPool instance, and then use this instance to manage the process pool.

ProcessItem is the process object in our process pool. In addition to the process information, the ProcessItem object also adds a unique identifier and status (busy, task failed, task completed, process unavailable).

When a batch of tasks starts, we will fork to the maximum number of parallel processes at one time, and then start monitoring whether there is a work process to complete the task. If there is a work process to complete the task, then we can reuse the work process and let it perform new tasks. ; If the task fails, we will return the task to the process pool and wait for the next distribution.

Because it is the same, independent and time-consuming task, when a work process completes the task, it is necessary to detect whether all the work processes have completed the task, not just reuse the work process, we have to batch one Batch reuse! ! !

Because the same task is started almost at the same time, when a work process is completed, it is entirely convinced that other work processes also complete the task, so all rounds of work processes are detected, and if they are idle, they are assigned new tasks.

Since it is a batch assignment task, there will be no hard work in a certain work process. Other work processes are on the sidelines, hahahahaha, and it’s always rainy.

Do we really need setInterval to poll the task status, when do we need to poll the task status and then schedule?
When the status of the work process changes, it is the time we need to detect the task status and scheduling; therefore, we can also use the IPC to notify the master process to detect the status and scheduling of the task.
Ps: Of course, there are better ways, lol

## ✨ Features
- ##### Fast

  A university system, 12,000 users, each user login requires two API accesses, two API accesses must have a 0.5s interval, and then the information is written to the text.

  Single thread (not tested, theoretically): 12000*0.5 —> at least **6000s**.

  Process pool (tested, process pool with capacity 50): **206s**, average 17.1ms per task

  **Increased efficiency: nearly 30 times**
## 📦 Install

```bash
npm install node-process-pool
```

## 🔨 Usage

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
## 🤝 Contributing [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

I welcome all contributions. You can submit any ideas as [pull requests](https://github.com/geniusfunny/node-process-pool/pulls) or as [GitHub issues](https://github.com/geniusfunny/node-process/issues). If you'd like to improve code, please create a Pull Request.
