const ProcessPool = require('./ProcessPool')

const processPool = new ProcessPool({
  maxParallelProcess: 50, // 支持最大进程并行数
  timeToClose: 60 * 1000, // 单个任务被执行最大时长
  task: `${__dirname}/task.js`, // 任务脚本
  taskParams: [['xxxx']] // 需要执行的任务参数列表，二维数组
})

processPool.run()
