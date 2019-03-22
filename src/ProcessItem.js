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
