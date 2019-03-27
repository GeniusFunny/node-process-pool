const fs = require('fs')
const child_process = require('child_process')
function PowerfulProcessItem(workDir) {
  this.state = 0
  this.process = null
  this.id = ''
  this.idle = true
  this.init(workDir)
}
PowerfulProcessItem.prototype = {
  async init(workDir) {
    await this.buildTaskScript(workDir)
  },
  finishTask() {
    if (this.state === 1) {
      this.state = 2
    }
  },
  unFinishTask() {
    if (this.state === 1) {
      this.state = 0
    }
  },
  resetState() {
    this.state = 0
  },
  // 执行任务
  executeTask(dependency, script) {
    if (this.state !== 1 && this.process) {
      this.state = 1
      this.process.send([dependency, script.toString()])
    }
  },
  // 复制模版
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
  close() {
    this.process.kill()
    fs.unlinkSync(this.taskDir)
  }
}
module.exports = PowerfulProcessItem
