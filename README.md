### Node Process Pool

#### 背景 Background

Node是单线程模型，当需要执行多个独立且耗时任务的时候，只能通过child_process来分发任务，提高处理速度；不像Java这种多线程语言，可以通过线程来解决并行问题，Node只能创建进程来进行处理；但是进程相对于线程来说，开销太大。一旦进程数较多时，CPU和内存消耗严重（影响我干其他的事情），所以做了一个简易版的进程池，用来解决并行任务的处理。

Node is a single-threaded model. When multiple independent and time-consuming tasks need to be performed, tasks can only be distributed through child_process to improve processing speed. Unlike multi-threaded languages like Java, parallel problems can be solved by threads. Node only Processes can be created for processing; but processes are too expensive for threads. Once the number of processes is large, CPU and memory consumption is severe (affecting other things I do), so I made a simple version of the process pool to solve the parallel task processing.

#### 思路 Thinking analysis

主控进程+工作进程群

ProcessPool是我们管理进程的地方，我们通过传递配置参数（任务脚本、脚本需要的参数、最大并行进程数）生成一个ProcessPool实例，然后通过这个实例来管控进程池。

ProcessItem是我们进程池里的进程对象，ProcessItem对象除了process的信息，我们还增加了唯一标识和状态（忙碌、任务失败、任务完成、进程不可用）。

一批任务开始时，我们会一次性fork到最大并行进程数，然后开始监控是否有工作进程完成任务，如果有工作进程完成了任务，那我们就可以复用这个工作进程，让其执行新任务；如果任务执行失败，我们会将任务归还给进程池，等待下一次分发。

由于主控进程即要负责IPC又要不断监听批任务完成的情况，目前我采用的方式是setInterval切割，让IPC和监控能交替进行（ps：应该有更好的方法

Master process + work process group

ProcessPool is where we manage the process. We pass a configuration parameter (the task script, the parameters required by the script, the maximum number of parallel processes) to generate a ProcessPool instance, and then use this instance to manage the process pool.

ProcessItem is the process object in our process pool. In addition to the process information, the ProcessItem object also adds a unique identifier and status (busy, task failed, task completed, process unavailable).

When a batch of tasks starts, we will fork to the maximum number of parallel processes at one time, and then start monitoring whether there is a work process to complete the task. If there is a work process to complete the task, then we can reuse the work process and let it perform new tasks. ; If the task fails, we will return the task to the process pool and wait for the next distribution.

Since the master process is responsible for the IPC and constantly monitors the completion of the batch task, the current method I use is setInterval cutting, so that IPC and monitoring can be alternated (ps: there should be a better way

#### 实现 achieve

##### ProcessPool.js

```javascript
const fs = require('fs')
const ProcessItem = require('./ProcessItem')
/**
 * 进程池类
 * @param maxParallelProcess，最大并行工作进程数
 * @param timeToClose，任务最长耗时时间
 * @param taskParams，所有任务脚本需要的参数
 * @param dependency，任务脚本所需依赖
 * @param taskName, 工作脚本名称
 * @param script 脚本内容
 * @param workDir 工作目录
 * Todo: 读写同一文件时出现任务丢失，待修复bug
 */
function ProcessPool({
    maxParallelProcess = 50,
    timeToClose = 60 * 1000,
    taskParams = [],
    dependency = '',
    workDir ='',
    taskName = Date.now(),
    script = '',}) {
  if (typeof script !== 'function' && script.name === 'task') {
    throw new Error('script must be a async function that named task')
  }
  if (typeof maxParallelProcess !== 'number' || maxParallelProcess < 1) {
    throw new Error('maxParallelProcess must be a integer and > 0')
  }
  if (typeof timeToClose !== 'number' || timeToClose < 1) {
    throw new Error('timeToClose must be a integer and > 0')
  }
  if (typeof dependency !== 'string') {
    throw new Error('dependency must be a string')
  }
  if (typeof workDir !== 'string') {
    throw new Error('dependency must be a path')
  }
  this.timeToClose = timeToClose
  this.processList = new Map() // 使用Map存储进程对象
  this.currentProcessNum = 0 // 当前活动进程数
  this.dependency = dependency // 任务脚本依赖
  this.workDir = workDir // 主控函数工作目录
  this.taskName = taskName // 任务脚本名称
  this.task = `${this.workDir}/${this.taskName}.js`// 任务脚本路径
  this.taskParamsTodo = taskParams // 待完成的任务参数数组，包含了n个小任务所需参数，所以是一个二维数组
  this.taskParamsDone = [] // 已完成的任务参数数组
  this.maxParallelProcess = maxParallelProcess // 最大进程并行数
  this.script = script
  try {
    this.writeScript()
  } catch (e) {
    throw new Error('创建工作脚本失败' + e)
  }
}
/**
 * 将内容写进脚本
 */
ProcessPool.prototype.writeScript = function() {
  /**
   * Todo：生产工作进程脚本
   * 1. 在工作目录下新建脚本
   * 2. 注入依赖
   * 3. 引入task模版
   * 4. 倒入任务脚本内容
   */
  if (this.fileIsExist()) {
    fs.writeFileSync(this.task, '')
  }
  try {
    fs.appendFileSync(this.task, `${this.dependency}\n`, (err) => {
      if (err) throw new Error('依赖写入失败')
    })
  } catch (e) {
    throw new Error('依赖写入失败')
  }
  try {
    fs.copyFileSync(`${__dirname}/task.js`, this.task)
  } catch (e) {
    throw new Error('复制task模版失败')
  }
  try {
    fs.appendFileSync(this.task, this.script.toString(), err => {
      if (err) throw new Error('任务脚本写入失败')
    })
  } catch (e) {
    throw new Error('任务脚本写入失败')
  }
}
/**
 * 复用空闲进程
 * @param key，可复用进程的pid
 */
ProcessPool.prototype.reuseProcess = function(key) {
  const workProcess = this.processList.get(key)
  if (this.taskParamsTodo.length) {
    const taskParam = this.taskParamsTodo.shift()
    workProcess.state = 1 // 设置为忙碌
    workProcess.process.send(taskParam)
  }
}
/**
 * 监测当前是否有正在处理任务的进程
 * @returns {number}
 */
ProcessPool.prototype.hasWorkProcessRunning = function() {
  if (!this.processList.size) return 1 // 进程池刚启动，尚无进程
  for (const p of this.processList.values()) {
    if (p.state === 1) return 2 // 有忙碌的进程
  }
  return -1
}
ProcessPool.prototype.listenProcessFinish = function(workProcess, params) {
  workProcess.process.on('message', message => {
    if (message === 'finish') {
      this.taskParamsDone.push(params)
      workProcess.finishTask()
    } else if (message === 'failed') {
      this.taskParamsTodo.unshift(params)
      workProcess.unFinishTask()
    }
  })
}
ProcessPool.prototype.addProcess = function() {
  if (this.currentProcessNum <= this.maxParallelProcess) {
    let workParam = this.taskParamsTodo.shift()
    const newProcess = new ProcessItem({task: this.task, workParam})
    this.processList.set(newProcess.id, newProcess)
    this.currentProcessNum++
    this.listenProcessFinish(newProcess, workParam)
  }
}
/**
 * 从进程池中移除[进程id]
 * @param id
 */
ProcessPool.prototype.removeProcess = function(id) {
  if (this.processList.has(id)) {
    const processToTerminate = this.processList.get(id)
    processToTerminate.terminate()
    this.currentProcessNum--
  }
}
/**
 * 关闭所有进程并清空进程池
 */
ProcessPool.prototype.closeProcessPool = function() {
  const processItems = this.processList.values()
  for (const processItem of processItems) {
    processItem.terminate()
  }
  // 清空进程池
  this.processList = null
  process.kill(process.pid)
}
/**
 * 检查任务脚本是否已经存在
 */
ProcessPool.prototype.fileIsExist = function() {
  fs.access(this.task, fs.constants.F_OK, err => {
    return !err
  })
}
/**
 * 进程池启动，处理任务
 * Todo：一方面要实时监控任务状态，另一方面要处理工作进程传递过来的message，由于单线程模型，二者只有一个能运行，目前采用定时器切换工作上下文，应该有更好的方法。
 *
 */
ProcessPool.prototype.run = function() {
  setInterval(() => {
    let flag = this.hasWorkProcessRunning() // 判断是否有工作进程正在执行或是否是第一次处理任务
    const taskTodoNum = this.taskParamsTodo.length

    if (flag === 1 && taskTodoNum) {
      // 初始阶段，fork min{任务数，最大进程数} 的进程
      while (this.currentProcessNum <= this.maxParallelProcess && this.currentProcessNum <= taskTodoNum) {
        this.addProcess()
      }
    } else if (flag > 0 && !taskTodoNum) {
      // 如果有工作进程正在执行且没有新的任务要执行，那么等待工作进程结束任务
    } else if (flag > 0 && taskTodoNum) {
      // 如果有工作进程正在执行且有新的任务要执行，如果有空闲进程，那么重用空闲进程执行新任务
      const processList = this.processList.values()
      for (const p of processList) {
        if (p.state !== 1 || p.state !== 4) {
          this.reuseProcess(p.id)
        }
      }
    } else if (flag < 0 && taskTodoNum) {
      // 如果没有工作进程正在执行且有新的任务要执行，如果有空闲进程，那么重用空闲进程执行新任务，如果没有则新启动进程进行执行任务
      const processList = this.processList.values()
      for (const p of processList) {
        if (p.state !== 1 || p.state !== 4) {
          this.reuseProcess(p.id)
        }
      }
    } else if (flag < 0 && !taskTodoNum) {
      // 如果没有工作进程正在执行且没有新的任务要执行，关闭进程池，任务完成
      this.closeProcessPool()
    }
  }, 0)
}
module.exports = ProcessPool
```

##### ProcessItem.js

```js
const ChildProcess = require('child_process')
/**
 * 工作进程类
 */
function ProcessItem({ task = './task.js', workParam = [] }) {
  /**
   * state 状态码
   * 1: 忙碌
   * 2: 完成任务
   * 3: 未完成任务
   * 4： 不可用
   */
  if (!Array.isArray(workParam)) {
    throw new Error('workParam must be a array')
  }
  if (typeof task !== 'string') {
    throw new Error('workParam must be a string')
  }
  this.process = this.createProcess(task, workParam)
  this.state = 1
  this.id = this.process.pid
}
ProcessItem.prototype.finishTask = function() {
  if (this.state === 1) {
    this.state = 2
  }
}
ProcessItem.prototype.unFinishTask = function() {
  this.state = 3
}
ProcessItem.prototype.terminate = function() {
  try {
    this.process.kill()
    this.state = 4
  } catch (e) {
    throw new Error(`关闭进程${this.id}失败`)
  }
}
ProcessItem.prototype.createProcess = function (task, workParam) {
  let childProcess = ChildProcess.fork(task, workParam)
  if (childProcess) {
    return childProcess
  } else {
    throw new Error('create process failed')
  }
}

module.exports = ProcessItem
```

##### Task.js

```js
/**
 * 当进程被子进程创建后，立刻执行工作任务
 */
async function firstTask() {
  const workParam = process.argv.slice(2)
  await task(workParam)
}
/**
 * 完成任务，提示进程池已完成，工作进程空闲
 */
async function finishTask() {
  await process.send('finish')
}
/**
 * 任务失败，提示进程池未完成，归还任务
 */
async function unFinishTask() {
  await process.send('failed')
}
/**
 * 监听进程池后续指派的任务
 */
process.on('message', async workParam => {
  await task(workParam)
  try {
    await finishTask()
  } catch (e) {
    await unFinishTask()
  }
})
/**
 * 进程被创建时立即执行进程池指派的任务
 * @returns {Promise<void>}
 */
async function main() {
  try {
    await firstTask()
    await finishTask()
  } catch (e) {
    await unFinishTask()
  }
}
main()
/**
 * @name 工作进程负责的任务
 * @param workParam // 执行任务所需的参数数组
 * 动态添加任务脚本到此文件尾部
 */
```

#### 使用方法

##### 安装

```bash
npm install node-process-pool
```

##### 使用

```js
// 进程池使用示例
const ProcessPool = require('../src/ProcessPool')
const taskParams = []
for (let i = 0; i < 100; i++) {
  taskParams[i] = [i]
}
// 创建进程池实例
const processPool = new ProcessPool({
  maxParallelProcess: 50, // 支持最大进程并行数
  timeToClose: 60 * 1000, // 单个任务被执行最大时长
  dependency: `const path = require('path')`, // 任务脚本依赖
  workDir: __dirname, // 当前目录
  taskName: 'test', // 任务脚本名称
  script: async function task(workParam) {
    console.log(workParam)
  }, // 任务脚本内容
  taskParams // 需要执行的任务参数列表，二维数组
})
// 利用进程池进行处理大规模任务
processPool.run()

// 测试任务1：写时间戳到文本中
// 进程池：5000个任务，耗时2.7s，每个任务耗时0.54ms
// 单线程：5000个任务，耗时0.456s，每个任务耗时0.0934ms

// 测试任务2：写时间戳到文本中，但每个任务需要至少耗时20ms（while空循环）
// 进程池：5000个任务，耗时15.089s，每个任务耗时3.02ms
// 单线程：5000个任务，耗时100.260s，每个任务耗时20.052ms

// 显然，当处理独立且耗时任务时，使用进程池更加合适。例如爬取信息，直接会将对方服务器503，2333333～
```

#### Todo

1. 逻辑完善
2. 代码优化