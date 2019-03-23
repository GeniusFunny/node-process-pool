### Node.js的简易进程池

#### 背景

Node是单线程模型，当需要执行多个独立且耗时任务的时候，只能通过child_process来分发任务，提高处理速度；不像Java这种多线程语言，可以通过线程来解决并行问题，Node只能创建进程来进行处理；但是进程相对于线程来说，开销太大。一旦进程数较多时，CPU和内存消耗严重（影响我干其他的事情），所以做了一个简易版的进程池，用来解决并行任务的处理。

#### 思路

主控进程+工作进程群

ProcessPool是我们管理进程的地方，我们通过传递配置参数（任务脚本、脚本需要的参数、最大并行进程数）生成一个ProcessPool实例，然后通过这个实例来管控进程池。

ProcessItem是我们进程池里的进程对象，ProcessItem对象除了process的信息，我们还增加了唯一标识和状态（忙碌、任务失败、任务完成、进程不可用）。

一批任务开始时，我们会一次性fork到最大并行进程数，然后开始监控是否有工作进程完成任务，如果有工作进程完成了任务，那我们就可以复用这个工作进程，让其执行新任务；如果任务执行失败，我们会将任务归还给进程池，等待下一次分发。

由于主控进程即要负责IPC又要不断监听批任务完成的情况，目前我采用的方式是setInterval切割，让IPC和监控能交替进行（ps：应该有更好的方法

#### 使用方法

##### 安装

```bash
npm install node-process-pool
```

##### 使用

```js
// 进程池使用示例
const ProcessPool = require('../src/ProcessPool')
const taskParams = []
for (let i = 0; i < 100; i++) {
  taskParams[i] = [i]
}
// 创建进程池实例
const processPool = new ProcessPool({
  maxParallelProcess: 50, // 支持最大进程并行数
  timeToClose: 60 * 1000, // 单个任务被执行最大时长
  dependency: `const path = require('path')`, // 任务脚本依赖
  workDir: __dirname, // 当前目录
  taskName: 'test', // 任务脚本名称
  script: async function task(workParam) {
    console.log(workParam)
  }, // 任务脚本内容
  taskParams // 需要执行的任务参数列表，二维数组
})
// 利用进程池进行处理大规模任务
processPool.run()
```

#### Todo

1. 逻辑完善
2. 代码优化
3. Star && PR