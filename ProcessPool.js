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
  this.timeToClose = timeToClose
  this.task = task
  this.taskParamsToDo = taskParams
  this.taskParamsDone = []
  this.maxParallelProcess = maxParallelProcess
  /**
   * 将工作进程加入到进程池
   */
  this.addProcess = () => {
    if (this.currentProcessNum <= this.maxParallelProcess) {
      let workParam = this.taskParamsToDo.shift()
      const newProcess = new ProcessItem({task, workParam})
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
    console.log('关闭所有进程')
    const processItems = this.processList.values()
    for (const processItem of processItems) {
      console.log('关闭进程' + processItem.id)
      processItem.terminate()
      /**
       * Todo: 清空进程池
       */
    }
  }
  this.run = () => {
    while (this.hasWorkProcessRunningOrFailed() > 0 || this.taskParamsToDo.length) {
      // 新建进程进行处理
      while (this.currentProcessNum <= this.maxParallelProcess && this.currentProcessNum <= this.taskParamsToDo.length) {
        this.addProcess()
      }
      // 若存在空闲进程直接分配任务
      // console.log(this.taskParamsToDo.length)
    }
  }
  this.hasWorkProcessRunningOrFailed = () => {
    if (!this.processList.size) return 1
    for (const p of this.processList.values()) {
      if (p.state === 1) return 2
    }
    return -1
  }
  this.listenProcessFinish = (workProcess, params) => {
    workProcess.process.on('message', message => {
      if (message === 'finish') {
        console.log(`收到来自工作进程${workProcess.id}的完成消息`)
        this.taskParamsDone.push(params)
        workProcess.finishTask()
      } else if (message === 'failed') {
        this.taskParamsToDo.unshift(params)
        console.log(`收到来自工作进程${workProcess.id}的失败消息`)
        workProcess.unFinishTask()
      }
    })
  }
}

module.exports = ProcessPool
