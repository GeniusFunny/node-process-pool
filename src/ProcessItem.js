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
