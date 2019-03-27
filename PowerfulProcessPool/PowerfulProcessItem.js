const fs = require('fs')
const child_process = require('child_process')
const isCorrectType = require('./util').isCorrectType

/**
 * 创建一个强大的进程示例
 * @param workDir，调用进程池的文件所在目录（用于生产特定脚本到该目录，用于解决脚本内容存在依赖的问题）
 * @constructor
 */
function PowerfulProcessItem(workDir) {
  // state: 1表示繁忙，0表示可用
  this.state = 0
  this.process = null
  this.id = ''
  this.idle = true
  this.taskQueue = []
  this.init(workDir)
}
PowerfulProcessItem.prototype = {
  /**
   * 进程初始化
   * @param workDir，同上
   * @returns {Promise<void>}
   */
  async init(workDir) {
    await this.buildTaskScript(workDir)
  },
  /**
   * 进程完成任务后更新状态
   */
  finishTask() {
    if (this.state === 1) {
      this.state = 0
      if (this.taskQueue.length) {
        let task = this.taskQueue.shift()
        this.executeTask(task[0], task[1])
      } else {
        this.resetState()
      }
    }
  },
  /**
   * 进程处理任务失败后更新状态
   */
  unFinishTask() {
    if (this.state === 1) {
      this.state = 0
      if (this.taskQueue.length) {
        let task = this.taskQueue.shift()
        this.executeTask(task[0], task[1])
      } else {
        this.resetState()
      }
    }
  },
  /**
   * 重置进程的状态
   */
  resetState() {
    this.state = 0
  },
  /**
   *
   * @param dependency，任务脚本的依赖
   * @param script，任务脚本的内容
   */
  executeTask(dependency, script) {
    try {
      isCorrectType('dependency', dependency, 'string')
      isCorrectType('script', dependency, 'string')
    } catch (e) {
      console.log(`参数不合法${e}`)
    }
    if (this.state === 0 && this.process) {
      this.state = 1
      this.process.send([dependency, script.toString()])
    } else {
      this.taskQueue.push([dependency, script.toString()])
    }
  },
  /**
   * 根据任务模版创建任务脚本
   * @param workDir
   * @returns {Promise<void>}
   */
  async buildTaskScript(workDir) {
    try {
      this.taskDir = `${workDir}/${Date.now()}.js`
      const templateDir = `${__dirname}/TaskTemplate.js`
      fs.copyFileSync(templateDir, this.taskDir)
      this.process = child_process.fork(this.taskDir)
      this.id = this.process.pid
    } catch (e) {
      console.log(e)
    }
  },
  /**
   * 关闭工作进程
   */
  close() {
    this.process.kill()
    fs.unlinkSync(this.taskDir)
  }
}
module.exports = PowerfulProcessItem
