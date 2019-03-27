const PowerfulProcessPool = require('./PowerfulProcessPool')

const powerfulInstance = new PowerfulProcessPool({
  maxProcessNum: 10,
  workDir: __dirname
})

powerfulInstance.getConnection().executeTask(`var isCorrectType = require('./util').isCorrectType`, async function task() {
  let a = '123'
  try {
    isCorrectType('a', a, 'number')
  } catch (e) {
    console.log(e)
  }
})
powerfulInstance.getConnection().executeTask(`var path = require('path')`, async function task() {
  console.log(Date.now())
})
powerfulInstance.close()
