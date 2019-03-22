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
