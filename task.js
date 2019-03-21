/**
 * @name 工作进程负责的任务
 * @param workParam // 需要执行任务所需的参数
 * @body 具体的任务
 */
async function task(workParam) {
  let start = Date.now()
  while (Date.now() < start + 50) {}
  console.log(workParam)
}

/**
 * 当进程被子进程创建后，立刻执行工作任务
 */
async function firstTask() {
  await task(process.argv[2])
}

/**
 * 完成任务后，像线程池传递信息
 */
async function finishTask() {
  await process.send('finish')
}

async function unFinishTask() {
  await process.send('failed')
}
/**
 * 监听后续线程池指派的任务
 */
process.on('message', async m => {
  await task(m)
  try {
    await finishTask()
  } catch (e) {
    await unFinishTask()
  }
})
setImmediate(async () => {
  try {
    await firstTask()
    await finishTask()
  } catch (e) {
    await unFinishTask()
  }
})
