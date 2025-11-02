let lastTime
export function timestamp () {
  if (lastTime) {
    lastTime++
  } else {
    lastTime = Date.now() * 1024 + Math.floor(Math.random() * 1024)
  }
  return lastTime
}
