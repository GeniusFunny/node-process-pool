/**
 * 完成任务，提示进程池已完成，工作进程空闲
 */
async function finishTask() {
  await process.send('finish')
}
/**
 * 任务失败，提示进程池未完成，归还任务
 */
async function unFinishTask() {
  await process.send('failed')
}
/**
 * 监听进程池指派的任务
 */
process.on('message', async workParam => {
  // 这是更新函数
  if (workParam && typeof workParam[1] === 'string' && workParam[1].indexOf('function') !== -1) {
    eval(workParam[0])
    eval(workParam[1])
  }
  await task(workParam)
  try {
    await finishTask()
  } catch (e) {
    await unFinishTask()
  }
})
/**
 * @name 工作进程负责的任务
 * @param workParam // 执行任务所需的参数数组
 * 动态添加任务脚本到此文件尾部
 */
