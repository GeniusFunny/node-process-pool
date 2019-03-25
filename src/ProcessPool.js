const fs = require('fs')
const ProcessItem = require('./ProcessItem')
const isCorrectType = require('./util').isCorrectType
/**
 * 进程池类
 * @param maxParallelProcess，最大并行工作进程数
 * @param timeToClose，任务最长耗时时间
 * @param taskParams，所有任务脚本需要的参数
 * @param dependency，任务脚本所需依赖
 * @param taskName, 工作脚本名称
 * @param script 脚本内容
 * @param workDir 工作目录
 */
function ProcessPool({
    maxParallelProcess = 50,
    timeToClose = 60 * 1000,
    taskParams = [],
    dependency = '',
    workDir ='',
    taskName = Date.now(),
    script = '',}) {
  this.start = Date.now()    
  try {
    isCorrectType('task', script, 'function')
    isCorrectType('maxParallelProcess', maxParallelProcess, 'number')
    isCorrectType('timeToClose', timeToClose, 'number')
    isCorrectType('dependency', dependency, 'string')
    isCorrectType('workDir', workDir, 'string')
  } catch (e) {
    throw new Error('参数不合法' + e)
  }
  this.timeToClose = timeToClose
  this.processList = new Map() // 使用Map存储进程对象
  this.currentProcessNum = 0 // 当前活动进程数
  this.dependency = dependency // 任务脚本依赖
  this.workDir = workDir // 主控函数工作目录
  this.taskName = taskName // 任务脚本名称
  this.task = `${this.workDir}/${this.taskName}.js`// 任务脚本路径
  this.taskParamsTodo = taskParams // 待完成的任务参数数组，包含了n个小任务所需参数，所以是一个二维数组
  this.maxParallelProcess = maxParallelProcess // 最大进程并行数
  this.script = script // 任务脚本内容
  this.ready = false // 任务脚本是否构建完成
  this.count = 0 // 已完成任务数
  try {
    this.buildTaskScript() // 根据模版创建任务脚本
  } catch (e) {
    throw new Error('创建任务脚本失败' + e)
  }
}
/**
 * 启动进程池
 */
ProcessPool.prototype.run = function() {
  if (this.ready) {
    let flag = this.hasWorkProcessRunning() // 判断是否有工作进程正在执行或是否是第一次处理任务
    const taskTodoNum = this.taskParamsTodo.length
    if (flag === 1 && taskTodoNum) {
      // 初始阶段，fork min{任务数，最大进程数} 的进程
      while (this.currentProcessNum < this.maxParallelProcess && this.currentProcessNum < taskTodoNum) {
        this.addProcess()
      }
    } else if (flag === 2 && !taskTodoNum) {
      // 有忙碌的工作进程，且任务已下发完
    } else if (flag === 2 && taskTodoNum) {
      // 有忙碌的工作进程，但还有任务需下发
      const processList = this.processList.values()
      for (const p of processList) {
        if (p.state !== 1 || p.state !== 4) {
          this.reuseProcess(p.id)
        }
      }
    } else if (flag === -1 && taskTodoNum) {
      // 所有工作进程空闲，但还有任务需下发
      const processList = this.processList.values()
      for (const p of processList) {
        if (p.state !== 1 || p.state !== 4) {
          this.reuseProcess(p.id)
        }
      }
    } else if (flag < 0 && !taskTodoNum) {
      // 所有进程空闲，且任务已下发完
      this.closeProcessPool()
    }
  }
}
/**
 * 生成任务脚本
 */
ProcessPool.prototype.buildTaskScript = function() {
  const taskDir = this.task
  const templateDir = `${__dirname}/TaskTemplate.js`
  const dependency = `${this.dependency}\n`
  const taskBody = this.script.toString()
  const templateReadStream = fs.createReadStream(templateDir)
  const taskWriteStream = fs.createWriteStream(taskDir)
  taskWriteStream.write(dependency)
  templateReadStream.pipe(taskWriteStream).write(taskBody)
  taskWriteStream.on('finish', () => {
    this.ready = true
    this.run()
  })
}
/**
 * 添加一个工作进程、指派任务且监听IPC
 */
ProcessPool.prototype.addProcess = function() {
  if (this.currentProcessNum <= this.maxParallelProcess) {
    let workParam = this.taskParamsTodo.shift()
    const newProcess = new ProcessItem({task: this.task, workParam})
    this.processList.set(newProcess.id, newProcess)
    this.currentProcessNum++
    this.listenProcessState(newProcess, workParam)
  }
}
/**
 * 工作进程与主控进程IPC
 * @param workProcess
 * @param params
 */
ProcessPool.prototype.listenProcessState = function(workProcess, params) {
  workProcess.process.on('message', message => {
    if (message === 'finish') {
      workProcess.finishTask()
      this.count++
    } else if (message === 'failed') {
      this.taskParamsTodo.unshift(params)
      workProcess.unFinishTask()
    }
    this.run()
  })
}
/**
 * 监测当前是否有正在处理任务的工作进程
 * @returns {number}
 */
ProcessPool.prototype.hasWorkProcessRunning = function() {
  if (!this.processList) return -1
  if (this.processList && !this.processList.size) return 1 // 进程池刚启动，尚无工作进程
  const processList = this.processList.values()
  for (const p of processList) {
    if (p.state === 1) return 2 // 有忙碌的进程
  }
  return -1
}
/**
 * 复用空闲进程
 * @param id，工作进程的pid
 */
ProcessPool.prototype.reuseProcess = function(id) {
  const workProcess = this.processList.get(id)
  if (this.taskParamsTodo.length && workProcess && workProcess.state !== 1) {
    const taskParam = this.taskParamsTodo.shift()
    workProcess.state = 1 // 设置为忙碌
    workProcess.process.send(taskParam)
  }
}
/**
 * 关闭工作进程
 * @param id
 */
ProcessPool.prototype.removeProcess = function(id) {
  let workProcess = this.processList.get(id)
  if (workProcess) {
    workProcess.terminate()
    this.currentProcessNum--
  }
}
/**
 * 关闭所有工作进程
 */
ProcessPool.prototype.removeAllProcess = function() {
  const processItems = this.processList.values()
  for (const processItem of processItems) {
    processItem.terminate()
  }
}
/**
 * 关闭进程池
 */
ProcessPool.prototype.closeProcessPool = function() {
  this.removeAllProcess()
  this.ready = false
  this.processList = null
  this.deleteTask()
  this.log()
}
/**
 * 删除任务脚本
 */
ProcessPool.prototype.deleteTask = function() {
  fs.unlink(this.task, err => {
    if (err) console.log('删除任务脚本失败')
  })
}
ProcessPool.prototype.log = function() {
  let now = Date.now()

  console.log('任务已完成，具体信息如下：')
  console.log(`完成${this.count}个子任务，总计耗时${now - this.start}ms`)
  console.log(`每个子任务平均耗时${(now - this.start) / this.count}ms`)

  console.log('The task has been completed, the specific information is as follows:')
  console.log(`Completed ${this.count} subtasks, It takes a total of ${now - this.start}ms`)
  console.log(`Each subtask takes ${(now - this.start) / this.count}ms`)
}
module.exports = ProcessPool
