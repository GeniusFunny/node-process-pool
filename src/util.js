function isFunction(func) {
  if (typeof func !== 'function') {
    throw new Error(`${func} must be a function`)
  }
}
