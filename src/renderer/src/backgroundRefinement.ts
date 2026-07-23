export interface BackgroundRefinementOptions {
  edgeOffset: number
  edgeSmooth: number
  feather: number
  dewhite: number
  colorCleanup: boolean
  colorCleanupStrength: number
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function extractAlpha(data: Uint8ClampedArray): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(data.length / 4)
  for (let source = 3, target = 0; source < data.length; source += 4, target += 1) {
    alpha[target] = data[source]
  }
  return alpha
}

function boxBlur(source: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const blurRadius = Math.max(0, Math.round(radius))
  if (!blurRadius) return source.slice()
  const horizontal = new Float32Array(source.length)
  const output = new Uint8ClampedArray(source.length)

  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let sum = 0
    for (let x = -blurRadius; x <= blurRadius; x += 1) {
      sum += source[row + Math.max(0, Math.min(width - 1, x))]
    }
    const divisor = blurRadius * 2 + 1
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / divisor
      const removeX = Math.max(0, Math.min(width - 1, x - blurRadius))
      const addX = Math.max(0, Math.min(width - 1, x + blurRadius + 1))
      sum += source[row + addX] - source[row + removeX]
    }
  }

  for (let x = 0; x < width; x += 1) {
    let sum = 0
    for (let y = -blurRadius; y <= blurRadius; y += 1) {
      sum += horizontal[Math.max(0, Math.min(height - 1, y)) * width + x]
    }
    const divisor = blurRadius * 2 + 1
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = clampByte(sum / divisor)
      const removeY = Math.max(0, Math.min(height - 1, y - blurRadius))
      const addY = Math.max(0, Math.min(height - 1, y + blurRadius + 1))
      sum += horizontal[addY * width + x] - horizontal[removeY * width + x]
    }
  }
  return output
}

function morphAlpha(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  mode: 'expand' | 'contract'
): Uint8ClampedArray {
  const morphRadius = Math.max(0, Math.round(radius))
  if (!morphRadius) return source.slice()
  const horizontal = new Uint8ClampedArray(source.length)
  const output = new Uint8ClampedArray(source.length)
  const queue = new Int32Array(Math.max(width, height))
  const shouldDiscard = (queued: number, incoming: number): boolean =>
    mode === 'expand' ? queued <= incoming : queued >= incoming

  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let head = 0
    let tail = 0
    let next = 0
    for (let x = 0; x < width; x += 1) {
      const to = Math.min(width - 1, x + morphRadius)
      while (next <= to) {
        const value = source[row + next]
        while (tail > head && shouldDiscard(source[row + queue[tail - 1]], value)) tail -= 1
        queue[tail] = next
        tail += 1
        next += 1
      }
      const from = Math.max(0, x - morphRadius)
      while (tail > head && queue[head] < from) head += 1
      horizontal[row + x] = source[row + queue[head]]
    }
  }

  for (let x = 0; x < width; x += 1) {
    let head = 0
    let tail = 0
    let next = 0
    for (let y = 0; y < height; y += 1) {
      const to = Math.min(height - 1, y + morphRadius)
      while (next <= to) {
        const value = horizontal[next * width + x]
        while (tail > head && shouldDiscard(horizontal[queue[tail - 1] * width + x], value)) tail -= 1
        queue[tail] = next
        tail += 1
        next += 1
      }
      const from = Math.max(0, y - morphRadius)
      while (tail > head && queue[head] < from) head += 1
      output[y * width + x] = horizontal[queue[head] * width + x]
    }
  }
  return output
}

function smoothMask(alpha: Uint8ClampedArray, width: number, height: number, amount: number): Uint8ClampedArray {
  if (amount <= 0) return alpha
  const blurred = boxBlur(alpha, width, height, Math.max(1, Math.round(amount / 3)))
  const strength = Math.min(1, amount / 20)
  const output = new Uint8ClampedArray(alpha.length)
  for (let index = 0; index < alpha.length; index += 1) {
    const normalized = blurred[index] / 255
    const eased = normalized * normalized * (3 - 2 * normalized)
    output[index] = clampByte(alpha[index] * (1 - strength) + eased * 255 * strength)
  }
  return output
}

function cleanEdgeColors(
  pixels: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  strength: number
): void {
  if (strength <= 0) return
  const mixStrength = Math.min(1, strength / 100)
  let colors = pixels.slice()
  const next = pixels.slice()

  for (let pass = 0; pass < 3; pass += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const pixel = y * width + x
        const currentAlpha = alpha[pixel]
        if (currentAlpha === 0 || currentAlpha >= 250) continue
        let red = 0
        let green = 0
        let blue = 0
        let weight = 0
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const sampleY = y + offsetY
          if (sampleY < 0 || sampleY >= height) continue
          for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const sampleX = x + offsetX
            if ((!offsetX && !offsetY) || sampleX < 0 || sampleX >= width) continue
            const sample = sampleY * width + sampleX
            if (alpha[sample] <= currentAlpha + 18) continue
            const sampleWeight = alpha[sample] / 255
            const source = sample * 4
            red += colors[source] * sampleWeight
            green += colors[source + 1] * sampleWeight
            blue += colors[source + 2] * sampleWeight
            weight += sampleWeight
          }
        }
        if (!weight) continue
        const edgeWeight = mixStrength * (1 - currentAlpha / 255)
        const target = pixel * 4
        next[target] = clampByte(colors[target] * (1 - edgeWeight) + (red / weight) * edgeWeight)
        next[target + 1] = clampByte(colors[target + 1] * (1 - edgeWeight) + (green / weight) * edgeWeight)
        next[target + 2] = clampByte(colors[target + 2] * (1 - edgeWeight) + (blue / weight) * edgeWeight)
      }
    }
    colors = next.slice()
  }
  pixels.set(colors)
}

export function refineBackgroundRemoval(
  modelResult: ImageData,
  original: ImageData,
  options: BackgroundRefinementOptions
): ImageData {
  const { width, height } = modelResult
  const source = modelResult.data
  const originalPixels = original.data
  let alpha = extractAlpha(source)

  if (options.edgeOffset > 0) alpha = morphAlpha(alpha, width, height, options.edgeOffset, 'expand')
  if (options.edgeOffset < 0) alpha = morphAlpha(alpha, width, height, Math.abs(options.edgeOffset), 'contract')
  alpha = smoothMask(alpha, width, height, options.edgeSmooth)
  if (options.feather > 0) alpha = boxBlur(alpha, width, height, Math.max(1, Math.round(options.feather)))

  const output = source.slice()
  const dewhiteStrength = Math.min(1, Math.max(0, options.dewhite / 100))
  for (let pixel = 0; pixel < alpha.length; pixel += 1) {
    const target = pixel * 4
    const modelAlpha = source[target + 3] / 255
    const outputAlpha = alpha[pixel]
    if (outputAlpha > 0 && source[target + 3] === 0) {
      output[target] = originalPixels[target]
      output[target + 1] = originalPixels[target + 1]
      output[target + 2] = originalPixels[target + 2]
    }
    if (dewhiteStrength > 0 && modelAlpha > 0.01 && modelAlpha < 0.995) {
      const edgeWeight = dewhiteStrength * (1 - modelAlpha)
      for (let channel = 0; channel < 3; channel += 1) {
        const unmatted = (source[target + channel] - 255 * (1 - modelAlpha)) / modelAlpha
        output[target + channel] = clampByte(source[target + channel] * (1 - edgeWeight) + unmatted * edgeWeight)
      }
    }
    output[target + 3] = outputAlpha
  }

  if (options.colorCleanup) {
    cleanEdgeColors(output, alpha, width, height, options.colorCleanupStrength)
  }
  return new ImageData(output, width, height)
}

export function applyManualAlphaDelta(
  refined: ImageData,
  original: ImageData,
  delta: Int16Array | null
): ImageData {
  if (!delta) return refined
  const output = refined.data.slice()
  for (let pixel = 0; pixel < delta.length; pixel += 1) {
    const difference = delta[pixel]
    if (!difference) continue
    const target = pixel * 4
    const nextAlpha = clampByte(output[target + 3] + difference)
    if (difference > 0) {
      const strength = Math.min(1, difference / 255)
      output[target] = clampByte(output[target] * (1 - strength) + original.data[target] * strength)
      output[target + 1] = clampByte(output[target + 1] * (1 - strength) + original.data[target + 1] * strength)
      output[target + 2] = clampByte(output[target + 2] * (1 - strength) + original.data[target + 2] * strength)
    }
    output[target + 3] = nextAlpha
  }
  return new ImageData(output, refined.width, refined.height)
}

export function captureManualAlphaDelta(current: ImageData, refined: ImageData): Int16Array {
  const delta = new Int16Array(current.width * current.height)
  for (let pixel = 0; pixel < delta.length; pixel += 1) {
    const target = pixel * 4 + 3
    delta[pixel] = current.data[target] - refined.data[target]
  }
  return delta
}
