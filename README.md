### Node ProcessPool

#### 背景

Node是单线程模型，当需要执行多个独立且耗时任务的时候，只能通过child_process来分发任务，提高处理速度；不像Java这种多线程语言，可以通过线程来解决并行问题，Node只能创建进程来进行处理；但是进程相对于线程来说，开销太大。一旦进程数较多时，CPU和内存消耗严重（影响我干其他的事情），所以做了一个简易版的进程池，用来解决并行任务的处理。

#### 思路

主控进程+工作进程群

ProcessPool是我们管理进程的地方，我们通过传递配置参数（任务脚本、脚本需要的参数、最大并行进程数）生成一个ProcessPool实例，然后通过这个实例来管控进程池。

ProcessItem是我们进程池里的进程对象，ProcessItem对象除了process的信息，我们还增加了唯一标识和状态（忙碌、任务失败、任务完成、进程不可用）。

一批任务开始时，我们会一次性fork到最大并行进程数，然后开始监控是否有工作进程完成任务，如果有工作进程完成了任务，那我们就可以复用这个工作进程，让其执行新任务；如果任务执行失败，我们会将任务归还给进程池，等待下一次分发。

由于主控进程即要负责IPC又要不断监听批任务完成的情况，目前我采用的方式是setInterval切割，让IPC和监控能交替进行（ps：应该有更好的方法

#### 实现

##### ProcessPool

```javascript
const ProcessItem = require('./ProcessItem')
/**
 * 进程池类
 * @param maxParallelProcess，最大并行工作进程数
 * @param timeToClose，任务最长耗时时间
 * @param task，任务脚本
 * @param taskParams，所有任务脚本需要的参数
 * Todo: 读写统一文件时出现任务丢失，待修复bug
 */
function ProcessPool({ maxParallelProcess = 50, timeToClose = 60 * 1000, task = '', taskParams = [] }) {
  this.processList = new Map() // 使用Map存储进程对象
  this.currentProcessNum = 0 // 当前活动进程数
  // this.timeToClose = timeToClose
  this.task = task // 任务脚本路径
  this.taskParamsTodo = taskParams // 待完成的任务参数数组，包含了n个小任务所需参数，所以是一个二维数组
  this.taskParamsDone = [] // 已完成的任务参数数组
  this.maxParallelProcess = maxParallelProcess // 最大进程并行数

  /**
   * 复用空闲进程
   * @param key，可复用进程的pid
   */
  this.reuseProcess = (key) => {
    const workProcess = this.processList.get(key)
    if (this.taskParamsTodo.length) {
      const taskParam = this.taskParamsTodo.shift()
      workProcess.state = 1 // 设置为忙碌
      workProcess.process.send(taskParam)
    }
  }
  /**
   * 进程池启动，处理任务
   * Todo：一方面要实时监控任务状态，另一方面要处理工作进程传递过来的message，由于单线程模型，二者只有一个能运行，目前采用定时器切换工作上下文，应该有更好的方法。
   *
   */
  this.run = () => {
    console.log(`开始时间：${Date.now()}`)
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
        // console.log('没有新任务，但有正在执行的任务，耐心等待')
      } else if (flag > 0 && taskTodoNum) {
        // 如果有工作进程正在执行且有新的任务要执行，如果有空闲进程，那么重用空闲进程执行新任务
        // console.log('有新任务，且有正在执行的任务，重用空闲进程执行新任务')
        const processList = this.processList.values()
        for (const p of processList) {
          if (p.state !== 1 || p.state !== 4) {
            this.reuseProcess(p.id)
          }
        }
      } else if (flag < 0 && taskTodoNum) {
        // 如果没有工作进程正在执行且有新的任务要执行，如果有空闲进程，那么重用空闲进程执行新任务，如果没有则新启动进程进行执行任务
        // console.log('有新任务，但没有正在执行的任务，重用空闲进程执行新任务')
        const processList = this.processList.values()
        for (const p of processList) {
          if (p.state !== 1 || p.state !== 4) {
            this.reuseProcess(p.id)
          }
        }
      } else if (flag < 0 && !taskTodoNum) {
        // 如果没有工作进程正在执行且没有新的任务要执行，关闭进程池，任务完成
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
    if (!this.processList.size) return 1 // 进程池刚启动，尚无进程
    for (const p of this.processList.values()) {
      if (p.state === 1) return 2 // 有忙碌的进程
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
      // console.log('关闭工作进程' + processItem.id)
      processItem.terminate()
    }
    // 清空进程池
    this.processList = null
    console.log(`结束时间：${Date.now()}`)
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
  this.finishTask = () => {
    if (this.state === 1) {
      this.state = 2
    }
  }
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

#### 使用方法及示例

##### main 主控进程

```js
// 进程池使用示例
const ProcessPool = require('../src/ProcessPool')
const test = []
for (let i = 0; i < 5000; i++) {
  test[i] = [i]
}
// 创建进程池实例
const processPool = new ProcessPool({
  maxParallelProcess: 50, // 支持最大进程并行数
  timeToClose: 60 * 1000, // 单个任务被执行最大时长
  task: `${__dirname}/task.js`, // 任务脚本
  taskParams: test // 需要执行的任务参数列表，二维数组
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

##### task 任务脚本

```js
const fs = require('fs')
/**
 * @name 工作进程负责的任务
 * @param workParam // 执行任务所需的参数数组
 */
async function task(workParam) {
  // 在这里写你的任务
  fs.appendFileSync('./timestamp.txt', `${workParam[0]}\n`, (err) => {
    if (err) throw new Error(err)
  })
}

/**
 * 当进程被子进程创建后，立刻执行工作任务
 */
async function firstTask() {
  const workParam = process.argv.slice(2)
  await task(workParam)
}

/**
 * 完成任务后，向进程池传递信息
 */
async function finishTask() {
  await process.send('finish')
}

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
```

#### Todo

1. 逻辑完善
2. 代码优化
3. 完善，开源，希望更多人用