let lastTime
export function timestamp () {
  let t = Date.now() * 1024 + Math.floor(Math.random() * 1024)
  if (lastTime) t = lastTime + 1
  lastTime = t
  return t
}
