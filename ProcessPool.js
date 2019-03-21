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
  // this.timeToClose = timeToClose
  this.task = task
  this.taskParamsTodo = taskParams
  this.taskParamsDone = []
  this.maxParallelProcess = maxParallelProcess
  /**
   * @param key // 可用的进程key
   */
  this.reuseProcess = (key) => {
    const workProcess = this.processList.get(key)
    if (this.taskParamsTodo.length) {
      const taskParam = this.taskParamsTodo.shift()
      workProcess.process.send(taskParam)
    }

  }
  /**
   * 进程池启动，处理任务
   * Todo：一方面要实时监控任务状态，另一方面要处理工作进程传递过来的message，由于单线程模型，二者只有一个能运行，目前采用定时器切换工作上下文，应该有更好的方法。
   *
   */
  this.run = () => {
    setInterval(() => {
      let flag = this.hasWorkProcessRunning() // 判断是否有工作进程正在执行
      if (flag === 1 && this.taskParamsTodo.length) {
        // 初始阶段，fork min{任务数，最大进程数} 的进程
        while (this.currentProcessNum <= this.maxParallelProcess && this.currentProcessNum <= this.taskParamsTodo.length) {
          this.addProcess()
        }
      } else if (flag > 0 && !this.taskParamsTodo.length) {
        // 如果有工作进程正在执行且没有新的任务要执行，那么等待工作进程结束任务
        console.log('没有新任务，但有正在执行的任务，耐心等待')
      } else if (flag > 0 && this.taskParamsTodo.length) {
        // 如果有工作进程正在执行且有新的任务要执行，如果有空闲进程，那么重用空闲进程执行新任务
        console.log('有新任务，且有正在执行的任务，重用空闲进程执行新任务')
        const processList = this.processList.values()
        for (const p of processList) {
          if (p.state !== 1 || p.state !== 4) {
            this.reuseProcess(p.id)
          }
        }
      } else if (flag < 0 && this.taskParamsTodo.length) {
        // 如果没有工作进程正在执行且有新的任务要执行，如果有空闲进程，那么重用空闲进程执行新任务，如果没有则新启动进程进行执行任务
        console.log('有新任务，但没有正在执行的任务，重用空闲进程执行新任务')
        const processList = this.processList.values()
        for (const p of processList) {
          if (p.state !== 1 || p.state !== 4) {
            this.reuseProcess(p.id)
          }
        }
      } else if (flag < 0 && !this.taskParamsTodo.length) {
        // 如果没有工作进程正在执行且没有新的任务要执行，关闭连接池，任务完成
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
    if (!this.processList.size) return 1
    for (const p of this.processList.values()) {
      if (p.state === 1) return 2 // 有忙碌的进程
      // if (p.state === 3 || p.state === 2) return p.id
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
      console.log('关闭工作进程' + processItem.id)
      processItem.terminate()
    }
    /**
     * Todo: 清空进程池
     */
    this.processList = null
    console.log('关闭主控进程')
    process.kill(process.pid)
  }
}

module.exports = ProcessPool
