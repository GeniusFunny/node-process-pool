const PowerfulProcessItem = require('./PowerfulProcessItem')
function PowerfulProcessPool({ maxProcessNum = 10, workDir = ''}) {
  this.processList = new Map()
  this.maxProcessNum = maxProcessNum
  this.currentProcessNum = 0
  this.workDir = workDir
}

PowerfulProcessPool.prototype = {
  getConnection() {
    if (this.processList && this.processList.size) {
      for (const p of this.processList) {
        if (p.idle === true) {
          p.idle = false
          return p
        }
      }
      if (this.currentProcessNum < this.maxProcessNum) {
        const process = this.processList.get(this.addProcess())
        process.idle = false
        return process
      } else {
        throw new Error('Too many connections')
      }
    } else {
      if (this.currentProcessNum < this.maxProcessNum) {
        const process = this.processList.get(this.addProcess())
        process.idle = false
        return process
      }
    }
  },
  clearOptions() {
    this.maxProcessNum = 0
    this.currentProcessNum = 0
    this.workDir = null
    this.processList = null
  },
  hasWorkProcessRunning() {
    const processList = this.processList.values()
    for (const p of processList) {
      if (!p.idle || p.state === 1) return true
    }
    return false
  },
  close() {
    console.log(this.hasWorkProcessRunning())
    if (!this.hasWorkProcessRunning()) {
      const processList = this.processList.values()
      for (const p of processList) {
        p.close()
      }
      this.clearOptions()
    } else {
      console.log('有进程正在执行')
    }
  },
  addProcess() {
    const newProcess = new PowerfulProcessItem(this.workDir)
    this.currentProcessNum++
    this.processList.set(newProcess.id, newProcess)
    newProcess.process.on('message', message => {
      if (message === 'finish') {
        newProcess.finishTask()
        newProcess.idle = true
      } else {
        newProcess.unFinishTask()
        newProcess.idle = true
      }
    })
    return newProcess.id
  }
}
module.exports = PowerfulProcessPool
