const PowerfulProcessPool = require('./PowerfulProcessPool')

const powerfulInstance = new PowerfulProcessPool({
  maxProcessNum: 5,
  workDir: __dirname
})
let connection = powerfulInstance.getConnection()
connection.executeTask(``, async function task() {
  console.log('1-1')
})
connection.executeTask(``, async function task() {
  console.log('1-2')
})
powerfulInstance.getConnection().executeTask(``, async function task() {
  console.log(2)
})
powerfulInstance.getConnection().executeTask(``, async function task() {
  console.log(3)
})
powerfulInstance.getConnection().executeTask(``, async function task() {
  console.log(4)
})
powerfulInstance.getConnection().executeTask(``, async function task() {
  console.log(5)
})
setTimeout(() => {
  console.log(powerfulInstance)
  powerfulInstance.getConnection().executeTask(``, async function task() {
    console.log(6)
  })
  powerfulInstance.close()
}, 500)
