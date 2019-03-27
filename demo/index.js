// 进程池使用示例
const fs = require('fs')
const ProcessPool = require('../src/ProcessPool')
const taskParams = []
for (let i = 0; i < 1000; i++) {
  taskParams[i] = [i]
}
// 创建进程池实例
const processPool = new ProcessPool({
  maxParallelProcess: 50, // 支持最大进程并行数
  timeToClose: 60 * 1000, // 单个任务被执行最大时长
  dependency: `const fs = require('fs')`, // 任务脚本依赖
  workDir: __dirname, // 当前目录
  taskName: 'writeNumber.js', // 任务脚本名称
  script: async function task(workParam) {
    let start = Date.now()
    while (Date.now() <= start + 200) {}
    try {
      fs.appendFileSync(`${__dirname}/numbers.txt`, `${workParam[0]}\n`)
    } catch (e) {
      console.log(e)
    }
  }, // 任务脚本内容
  taskParams // 需要执行的任务参数列表，二维数组
})
// 利用进程池进行处理大规模任务
processPool.run()

// 测试任务1：写时间戳到文本中
// 进程池：5000个任务，耗时2.7s，每个任务耗时0.54ms
// 单线程：5000个任务，耗时0.456s，每个任务耗时0.0934ms

// 测试任务2：写时间戳到文本中，但每个任务需要至少耗时20ms（while空循环）
// 进程池：5000个任务，耗时15.089s，每个任务耗时3.02ms
// 单线程：5000个任务，耗时100.260s，每个任务耗时20.052ms

// 显然，当处理独立且耗时任务时，使用进程池更加合适。例如爬取信息，直接会将对方服务器503，2333333～
