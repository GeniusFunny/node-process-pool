const fs = require('fs')
/**
 * @name 工作进程负责的任务
 * @param workParam // 执行任务所需的参数数组
 */
async function task(workParam) {
  // 在这里写你的任务
  fs.appendFileSync('./timestamp.txt', `${workParam[0]}\n`, (err) => {
    if (err) throw new Error(err)
  })
}

/**
 * 当进程被子进程创建后，立刻执行工作任务
 */
async function firstTask() {
  const workParam = process.argv.slice(2)
  await task(workParam)
}

/**
 * 完成任务后，向进程池传递信息
 */
async function finishTask() {
  await process.send('finish')
}

async function unFinishTask() {
  await process.send('failed')
}
/**
 * 监听进程池后续指派的任务
 */
process.on('message', async workParam => {
  await task(workParam)
  try {
    await finishTask()
  } catch (e) {
    await unFinishTask()
  }
})

/**
 * 进程被创建时立即执行进程池指派的任务
 * @returns {Promise<void>}
 */
async function main() {
  try {
    await firstTask()
    await finishTask()
  } catch (e) {
    await unFinishTask()
  }
}

main()
