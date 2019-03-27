const PowerfulProcessItem = require('./PowerfulProcessItem')
const isCorrectType = require('./util').isCorrectType
/**
 * 创建更强大的工作进程池
 * @param maxProcessNum，最大可创建工作进程数
 * @param workDir，调用工作进程池的文件所在目录（用于生产特定脚本到该目录，用于解决脚本内容存在依赖的问题）
 * @constructor
 */
function PowerfulProcessPool({ maxProcessNum = 10, workDir = ''}) {
  try {
    isCorrectType('maxProcessNum', maxProcessNum, 'number')
    isCorrectType('workDir', workDir, 'string')
  } catch (e) {
    console.log(`参数不合法${e}`)
  }
  this.processList = new Map() // 工作进程表
  this.maxProcessNum = maxProcessNum
  this.currentProcessNum = 0 // 当前已创建的工作进程数
  this.workDir = workDir
}

PowerfulProcessPool.prototype = {
  /**
   * 获取一个工作进程的示例
   * @returns {*}
   */
  getConnection() {
    if (!this.processList) {
      throw new Error('工作进程池已经被释放')
    }
    if (this.processList.size) {
      // 检测是否有空闲的工作进程并返回（空闲：指该进程当前尚未被分配任务）
      for (const p of this.processList) {
        if (p.idle === true) {
          p.idle = false
          return p
        }
      }
      // 如果没有空闲的工作进程，那么检测当前进程数是否达到最大值
      if (this.currentProcessNum <= this.maxProcessNum) {
        // 未达到最大值，则新建一个工作进程被返回
        const process = this.processList.get(this.addProcess())
        process.idle = false
        return process
      } else {
        console.log('???')
        // 已达到最大值，要么直到有空闲进程被返回，要么直接返回null
        return null
      }
    } else {
      // 工作进程池刚创建，无工作进程可分配，直接创建新工作进程并返回
      if (this.currentProcessNum < this.maxProcessNum) {
        const process = this.processList.get(this.addProcess())
        process.idle = false
        return process
      }
    }
  },
  /**
   * 关闭工作进程池后清空工作进程池配置
   */
  clearOptions() {
    this.maxProcessNum = 0
    this.currentProcessNum = 0
    this.workDir = null
    this.processList = null
  },
  /**
   * 检测当前是否有正在忙碌的工作进程
   * @returns {boolean}
   */
  hasWorkProcessRunning() {
    const processList = this.processList.values()
    for (const p of processList) {
      if (!p.idle) return true
    }
    return false
  },
  /**
   * 安全关闭工作进程池，待所有工作进程完成分配的任务时执行关闭操作
   */
  close() {
    if (!this.processList) throw new Error('进程已被关闭')
    let timer = setInterval(() => {
      if (!this.hasWorkProcessRunning()) {
        const processList = this.processList.values()
        for (const p of processList) {
          p.close()
        }
        this.clearOptions()
        clearInterval(timer)
      }
    }, 50)
  },
  /**
   * 立即关闭所有工作进程（存在任务丢失情况），不安全
   */
  closeUnsafe() {
    if (!this.processList) throw new Error('进程已被关闭')
    const processList = this.processList.values()
    for (const p of processList) {
      p.close()
    }
    this.clearOptions()
  },
  /**
   * 添加一个工作进程到工作进程池中
   * @returns {string|*}
   */
  addProcess() {
    try {
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
    } catch (e) {
      console.log(`创建工作进程失败，${e}`)
    }
  }
}
module.exports = PowerfulProcessPool
