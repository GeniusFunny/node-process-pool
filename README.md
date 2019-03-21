### Node ProcessPool

#### 背景

Node是单线程模型，当需要执行多个独立的任务的时候，只能通过child_process来分发任务，但是进程相对于线程来说，开销太大。一旦进程数较多时，CPU和内存顶不住了，所以自己做了一个简易版的进程池，用来解决并行任务的处理。

#### 思路

主控进程+工作进程群

ProcessPool是我们管理进程的地方，我们通过传递配置参数（任务脚本、脚本需要的参数、最大并行进程数）生成一个ProcessPool实例。

ProcessItem是我们进程池里的对象，对象除了process的信息，我们还增加了唯一标识和状态（忙碌、任务失败、任务完成、进程不可用）。

一个大规模任务开始时，我们会一次性fork到最大并行进程数，然后开始监控是否有进程完成小任务，如果有进程完成小任务，那我们就可以复用这个进程执行新的小任务。

由于主控进程进程即要负责IPC又要不断监听大规模任务完成的情况，由于Node单线程模型，目前我采用的方式是setInterval切割，让IPC和监控能交替进行（ps：应该有更好的方法

#### 实现

##### ProcessPool

```javascript
const ProcessItem = require('./ProcessItem')
/**
 * 进程池类
 * @param maxParallelProcess // 最大并行工作进程数
 * @param timeToClose // 任务最长耗时时间
 * @param task // 任务脚本
 * @param taskParams // 任务脚本需要的参数
 */
function ProcessPool({ maxParallelProcess = 50, timeToClose = 60 * 1000, task = '', taskParams = [] }) {
  this.processList = new Map()
  this.currentProcessNum = 0
  // this.timeToClose = timeToClose
  this.task = task
  this.taskParamsTodo = taskParams
  this.taskParamsDone = []
  this.maxParallelProcess = maxParallelProcess
  /**
   * @param key // 可用的进程key
   */
  this.reuseProcess = (key) => {
    const workProcess = this.processList.get(key)
    if (this.taskParamsTodo.length) {
      const taskParam = this.taskParamsTodo.shift()
      workProcess.process.send(taskParam)
    }

  }
  /**
   * 进程池启动，处理任务
   * Todo：一方面要实时监控任务状态，另一方面要处理工作进程传递过来的message，由于单线程模型，二者只有一个能运行，目前采用定时器切换工作上下文，应该有更好的方法。
   *
   */
  this.run = () => {
    setInterval(() => {
      let flag = this.hasWorkProcessRunning() // 判断是否有工作进程正在执行
      if (flag === 1 && this.taskParamsTodo.length) {
        // 初始阶段，fork min{任务数，最大进程数} 的进程
        while (this.currentProcessNum <= this.maxParallelProcess && this.currentProcessNum <= this.taskParamsTodo.length) {
          this.addProcess()
        }
      } else if (flag > 0 && !this.taskParamsTodo.length) {
        // 如果有工作进程正在执行且没有新的任务要执行，那么等待工作进程结束任务
        console.log('没有新任务，但有正在执行的任务，耐心等待')
      } else if (flag > 0 && this.taskParamsTodo.length) {
        // 如果有工作进程正在执行且有新的任务要执行，如果有空闲进程，那么重用空闲进程执行新任务
        console.log('有新任务，且有正在执行的任务，重用空闲进程执行新任务')
        const processList = this.processList.values()
        for (const p of processList) {
          if (p.state !== 1 || p.state !== 4) {
            this.reuseProcess(p.id)
          }
        }
      } else if (flag < 0 && this.taskParamsTodo.length) {
        // 如果没有工作进程正在执行且有新的任务要执行，如果有空闲进程，那么重用空闲进程执行新任务，如果没有则新启动进程进行执行任务
        console.log('有新任务，但没有正在执行的任务，重用空闲进程执行新任务')
        const processList = this.processList.values()
        for (const p of processList) {
          if (p.state !== 1 || p.state !== 4) {
            this.reuseProcess(p.id)
          }
        }
      } else if (flag < 0 && !this.taskParamsTodo.length) {
        // 如果没有工作进程正在执行且没有新的任务要执行，关闭连接池，任务完成
        console.log('所有任务已完成')
        this.closeProcessPool()
      }
    }, 1)
  }
  /**
   * 监测当前是否有正在处理任务的进程
   * @returns {number}
   */
  this.hasWorkProcessRunning = () => {
    if (!this.processList.size) return 1
    for (const p of this.processList.values()) {
      if (p.state === 1) return 2 // 有忙碌的进程
      // if (p.state === 3 || p.state === 2) return p.id
    }
    return -1
  }
  this.listenProcessFinish = (workProcess, params) => {
    workProcess.process.on('message', message => {
      if (message === 'finish') {
        // console.log(`收到来自工作进程${workProcess.id}的完成消息`)
        this.taskParamsDone.push(params)
        workProcess.finishTask()
      } else if (message === 'failed') {
        this.taskParamsTodo.unshift(params)
        // console.log(`收到来自工作进程${workProcess.id}的失败消息`)
        workProcess.unFinishTask()
      }
    })
  }
  this.addProcess = () => {
    if (this.currentProcessNum <= this.maxParallelProcess) {
      let workParam = this.taskParamsTodo.shift()
      const newProcess = new ProcessItem({task: this.task, workParam})
      this.processList.set(newProcess.id, newProcess)
      this.currentProcessNum++
      this.listenProcessFinish(newProcess, workParam)
    } else {
      console.log('已经达到系统最大进程并行数' + this.currentProcessNum)
    }
  }
  /**
   * 从进程池中移除[进程id]
   * @param id
   */
  this.removeProcess = (id) => {
    if (this.processList.has(id)) {
      const processToTerminate = this.processList.get(id)
      console.log('系统正关闭进程' + processToTerminate.id)
      processToTerminate.terminate()
      this.currentProcessNum--
    } else {
      console.log('不存在进程' + id)
    }
  }
  /**
   * 关闭所有进程并清空进程池
   */
  this.closeProcessPool = () => {
    console.log('关闭所有工作进程')
    const processItems = this.processList.values()
    for (const processItem of processItems) {
      console.log('关闭工作进程' + processItem.id)
      processItem.terminate()
    }
    /**
     * Todo: 清空进程池
     */
    this.processList = null
    console.log('关闭主控进程')
    process.kill(process.pid)
  }
}

module.exports = ProcessPool

```

##### ProcessItem

```js
/**
 * 工作进程类
 */
const ChildProcess = require('child_process')

function ProcessItem({ task = '', workParam = [] }) {
  /**
   * state 状态码
   * 1: 忙碌
   * 2: 完成任务
   * 3: 未完成任务
   * 4： 不可用
   */
  this.process = this.createProcess(task, workParam)
  this.state = 1
  this.id = this.process.pid
  this.receiveTask = (workParam) => {
    this.process.send(workParam)
  }
  this.finishTask = () => {
    if (this.state === 1) {
      this.state = 2
    }
  }
  this.sendMessageToPool = () => {}
  this.terminate = () => {
    this.process.kill()
    this.state = 4
  }
  this.unFinishTask = () => {
    this.state = 3
  }
}
ProcessItem.prototype.createProcess = (task, workParam) => {
  let childProcess = ChildProcess.fork(task, workParam)
  if (childProcess) {
    return childProcess
  } else {
    console.log('创建进程失败')
    throw new Error('create process failed')
  }
}

module.exports = ProcessItem

```

##### main 主控进程

```js
const ProcessPool = require('./ProcessPool')
const test = []
for (let i = 0; i < 500; i++) {
  test[i] = [i]
}
const processPool = new ProcessPool({
  maxParallelProcess: 50, // 支持最大进程并行数
  timeToClose: 60 * 1000, // 单个任务被执行最大时长
  task: `${__dirname}/task.js`, // 任务脚本
  taskParams: test // 需要执行的任务参数列表，二维数组
})

processPool.run()

```

##### task 任务脚本

```js
/**
 * @name 工作进程负责的任务
 * @param workParam // 需要执行任务所需的参数
 * @body 具体的任务
 */
async function task(workParam) {
  let start = Date.now()
  while (Date.now() < start + 50) {}
  console.log(workParam)
}

/**
 * 当进程被子进程创建后，立刻执行工作任务
 */
async function firstTask() {
  await task(process.argv[2])
}

/**
 * 完成任务后，像线程池传递信息
 */
async function finishTask() {
  await process.send('finish')
}

async function unFinishTask() {
  await process.send('failed')
}
/**
 * 监听后续线程池指派的任务
 */
process.on('message', async m => {
  await task(m)
  try {
    await finishTask()
  } catch (e) {
    await unFinishTask()
  }
})
setImmediate(async () => {
  try {
    await firstTask()
    await finishTask()
  } catch (e) {
    await unFinishTask()
  }
})

```

#### 使用方法(示例)

```js
const query = require('../util/query')
const ProcessPool = require('./pool/ProcessPool')
const fs = require('fs')
// 获取数据库中的用户信息
async function getUserId() {
  let data = await query('SELECT * from user;')
  return data.map(item => item.id)
}
async function main() {
  let users = await getUserId()
  users = users.map(item => [item, item])
  const processPool = new ProcessPool({
    task: './task.js', // 任务脚本
    timeToClose: 60 * 1000,
    maxParallelProcess: 60,
    taskParams: users
  })
  processPool.run()
}
setImmediate(async () => {
  await main()
})
```

上面是我一个个人项目的部分代码，引用了ProcessPool，单机Dos，10s，把别人教务系统503了，哈哈哈哈哈哈哈哈哈

上面这个项目也是ProcessPool诞生的原因，纯属兴趣，解决个人项目遇到的问题，哈哈哈哈～

#### Todo

1. 逻辑完善
2. 代码优化
3. 完善，开源，希望更多人用