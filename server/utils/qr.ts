// Lightweight QR Code Model 2 encoder adapted for server-side document rendering.
// It intentionally has no runtime dependencies so institutional PDFs can be
// generated in bridge/direct deployments without adding a binary image stack.

type EccLevel = 'L' | 'M' | 'Q' | 'H'

const ECC_FORMAT_BITS: Record<EccLevel, number> = { L: 1, M: 0, Q: 3, H: 2 }
const ECC_INDEX: Record<EccLevel, number> = { L: 0, M: 1, Q: 2, H: 3 }

const ECC_CODEWORDS_PER_BLOCK = [
  [-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30],
  [-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
  [-1,13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30],
  [-1,17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
]

const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
  [-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
  [-1,1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
  [-1,1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81],
]

const getBit = (value: number, index: number) => ((value >>> index) & 1) !== 0

const appendBits = (value: number, length: number, bits: number[]) => {
  const normalized = Number(value)
  if (!Number.isFinite(normalized) || normalized < 0 || !Number.isInteger(normalized)) {
    throw new RangeError('Invalid QR bit value')
  }
  if (length < 0 || length > 31) throw new RangeError('Invalid QR bit length')
  if (length === 0) {
    if (normalized !== 0) throw new RangeError('Invalid QR bit range')
    return
  }
  if (normalized >= 2 ** length) throw new RangeError('Invalid QR bit range')
  for (let i = length - 1; i >= 0; i--) bits.push((normalized >>> i) & 1)
}

const getNumRawDataModules = (version: number) => {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (version >= 7) result -= 36
  }
  return result
}

const getNumDataCodewords = (version: number, ecl: EccLevel) => {
  const idx = ECC_INDEX[ecl]
  return Math.floor(getNumRawDataModules(version) / 8) - ECC_CODEWORDS_PER_BLOCK[idx][version] * NUM_ERROR_CORRECTION_BLOCKS[idx][version]
}

const reedSolomonMultiply = (x: number, y: number) => {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

const reedSolomonComputeDivisor = (degree: number) => {
  const result = Array(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = reedSolomonMultiply(root, 0x02)
  }
  return result
}

const reedSolomonComputeRemainder = (data: number[], divisor: number[]) => {
  const result = Array(divisor.length).fill(0)
  for (const byte of data) {
    const factor = byte ^ result.shift()
    result.push(0)
    for (let i = 0; i < result.length; i++) result[i] ^= reedSolomonMultiply(divisor[i], factor)
  }
  return result
}

const getAlignmentPatternPositions = (version: number) => {
  if (version === 1) return [] as number[]
  const size = version * 4 + 17
  const numAlign = Math.floor(version / 7) + 2
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2
  const result: number[] = []
  for (let i = 0, pos = size - 7; i < numAlign - 1; i++, pos -= step) result.unshift(pos)
  result.unshift(6)
  return result
}

const penaltyScore = (modules: boolean[][]) => {
  const size = modules.length
  let result = 0

  for (let y = 0; y < size; y++) {
    let runColor = false
    let runX = 0
    const runHistory = [0, 0, 0, 0, 0, 0, 0]
    for (let x = 0; x < size; x++) {
      if (modules[y][x] === runColor) {
        runX++
        if (runX === 5) result += 3
        else if (runX > 5) result++
      } else {
        penaltyFinderAddHistory(runX, runHistory)
        if (!runColor) result += penaltyFinderCountPatterns(runHistory) * 40
        runColor = modules[y][x]
        runX = 1
      }
    }
    result += penaltyTerminateAndCount(runColor, runX, runHistory, size) * 40
  }

  for (let x = 0; x < size; x++) {
    let runColor = false
    let runY = 0
    const runHistory = [0, 0, 0, 0, 0, 0, 0]
    for (let y = 0; y < size; y++) {
      if (modules[y][x] === runColor) {
        runY++
        if (runY === 5) result += 3
        else if (runY > 5) result++
      } else {
        penaltyFinderAddHistory(runY, runHistory)
        if (!runColor) result += penaltyFinderCountPatterns(runHistory) * 40
        runColor = modules[y][x]
        runY = 1
      }
    }
    result += penaltyTerminateAndCount(runColor, runY, runHistory, size) * 40
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y][x]
      if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) result += 3
    }
  }

  let dark = 0
  modules.forEach((row) => row.forEach((cell) => { if (cell) dark++ }))
  const total = size * size
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
  result += Math.max(0, k) * 10
  return result
}

const penaltyFinderAddHistory = (currentRunLength: number, runHistory: number[]) => {
  if (runHistory[0] === 0) currentRunLength += runHistory.length > 0 ? 0 : 0
  runHistory.pop()
  runHistory.unshift(currentRunLength)
}

const penaltyFinderCountPatterns = (runHistory: number[]) => {
  const n = runHistory[1]
  const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n
  if (!core) return 0
  let count = 0
  if (runHistory[0] >= n * 4 && runHistory[6] >= n) count++
  if (runHistory[6] >= n * 4 && runHistory[0] >= n) count++
  return count
}

const penaltyTerminateAndCount = (currentRunColor: boolean, currentRunLength: number, runHistory: number[], size: number) => {
  if (currentRunColor) {
    penaltyFinderAddHistory(currentRunLength, runHistory)
    currentRunLength = 0
  }
  currentRunLength += size
  penaltyFinderAddHistory(currentRunLength, runHistory)
  return penaltyFinderCountPatterns(runHistory)
}

const maskBit = (mask: number, x: number, y: number) => {
  switch (mask) {
    case 0: return (x + y) % 2 === 0
    case 1: return y % 2 === 0
    case 2: return x % 3 === 0
    case 3: return (x + y) % 3 === 0
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
    case 5: return (x * y) % 2 + (x * y) % 3 === 0
    case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0
    case 7: return ((x + y) % 2 + (x * y) % 3) % 2 === 0
    default: throw new RangeError('Invalid QR mask')
  }
}

class QrCodeBuilder {
  readonly version: number
  readonly size: number
  readonly ecl: EccLevel
  modules: boolean[][]
  isFunction: boolean[][]

  constructor(version: number, ecl: EccLevel, dataCodewords: number[]) {
    this.version = version
    this.size = version * 4 + 17
    this.ecl = ecl
    this.modules = Array.from({ length: this.size }, () => Array(this.size).fill(false))
    this.isFunction = Array.from({ length: this.size }, () => Array(this.size).fill(false))
    this.drawFunctionPatterns()
    const allCodewords = this.addEccAndInterleave(dataCodewords)
    this.drawCodewords(allCodewords)
    this.applyBestMask()
  }

  setFunctionModule(x: number, y: number, dark: boolean) {
    this.modules[y][x] = dark
    this.isFunction[y][x] = true
  }

  drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.setFunctionModule(6, i, i % 2 === 0)
      this.setFunctionModule(i, 6, i % 2 === 0)
    }
    this.drawFinderPattern(3, 3)
    this.drawFinderPattern(this.size - 4, 3)
    this.drawFinderPattern(3, this.size - 4)

    const alignPatPos = getAlignmentPatternPositions(this.version)
    const numAlign = alignPatPos.length
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0)) continue
        this.drawAlignmentPattern(alignPatPos[i], alignPatPos[j])
      }
    }
    this.drawFormatBits(0)
    this.drawVersion()
  }

  drawFinderPattern(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || xx >= this.size || yy < 0 || yy >= this.size) continue
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        this.setFunctionModule(xx, yy, dist !== 2 && dist !== 4)
      }
    }
  }

  drawAlignmentPattern(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) this.setFunctionModule(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
    }
  }

  drawFormatBits(mask: number) {
    const data = (ECC_FORMAT_BITS[this.ecl] << 3) | mask
    let rem = data
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((data << 10) | rem) ^ 0x5412

    for (let i = 0; i <= 5; i++) this.setFunctionModule(8, i, getBit(bits, i))
    this.setFunctionModule(8, 7, getBit(bits, 6))
    this.setFunctionModule(8, 8, getBit(bits, 7))
    this.setFunctionModule(7, 8, getBit(bits, 8))
    for (let i = 9; i < 15; i++) this.setFunctionModule(14 - i, 8, getBit(bits, i))

    for (let i = 0; i < 8; i++) this.setFunctionModule(this.size - 1 - i, 8, getBit(bits, i))
    for (let i = 8; i < 15; i++) this.setFunctionModule(8, this.size - 15 + i, getBit(bits, i))
    this.setFunctionModule(8, this.size - 8, true)
  }

  drawVersion() {
    if (this.version < 7) return
    let rem = this.version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (this.version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const color = getBit(bits, i)
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.setFunctionModule(a, b, color)
      this.setFunctionModule(b, a, color)
    }
  }

  addEccAndInterleave(data: number[]) {
    const idx = ECC_INDEX[this.ecl]
    const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[idx][this.version]
    const blockEccLen = ECC_CODEWORDS_PER_BLOCK[idx][this.version]
    const rawCodewords = Math.floor(getNumRawDataModules(this.version) / 8)
    const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
    const shortBlockLen = Math.floor(rawCodewords / numBlocks)
    const rsDiv = reedSolomonComputeDivisor(blockEccLen)
    const blocks: number[][] = []
    let k = 0

    for (let i = 0; i < numBlocks; i++) {
      const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1)
      const dat = data.slice(k, k + datLen)
      k += dat.length
      const ecc = reedSolomonComputeRemainder(dat, rsDiv)
      if (i < numShortBlocks) dat.push(0)
      blocks.push(dat.concat(ecc))
    }

    const result: number[] = []
    for (let i = 0; i < blocks[0].length; i++) {
      for (let j = 0; j < blocks.length; j++) {
        if (i === shortBlockLen - blockEccLen && j < numShortBlocks) continue
        result.push(blocks[j][i])
      }
    }
    return result
  }

  drawCodewords(data: number[]) {
    let i = 0
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vert : vert
          if (this.isFunction[y][x]) continue
          if (i < data.length * 8) this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7))
          i++
        }
      }
    }
  }

  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.isFunction[y][x] && maskBit(mask, x, y)) this.modules[y][x] = !this.modules[y][x]
      }
    }
  }

  applyBestMask() {
    let bestMask = 0
    let minPenalty = Number.POSITIVE_INFINITY
    for (let mask = 0; mask < 8; mask++) {
      this.applyMask(mask)
      this.drawFormatBits(mask)
      const penalty = penaltyScore(this.modules)
      if (penalty < minPenalty) {
        minPenalty = penalty
        bestMask = mask
      }
      this.applyMask(mask)
    }
    this.applyMask(bestMask)
    this.drawFormatBits(bestMask)
  }
}

const encodeUtf8 = (text: string): number[] => Array.from(Buffer.from(text, 'utf8'))

export type QrMatrix = {
  size: number
  modules: boolean[][]
  version: number
  ecc: EccLevel
}

export const generateQrMatrix = (text: string, options: { minVersion?: number; maxVersion?: number; ecc?: EccLevel } = {}): QrMatrix => {
  const ecl = options.ecc || 'M'
  const minVersion = Math.max(1, Math.min(40, Math.floor(options.minVersion || 1)))
  const maxVersion = Math.max(minVersion, Math.min(40, Math.floor(options.maxVersion || 20)))
  const data = encodeUtf8(text)

  let version = minVersion
  let dataCapacityBits = 0
  let bits: number[] = []
  for (; version <= maxVersion; version++) {
    const countBitLength = version <= 9 ? 8 : 16
    if (data.length >= 2 ** countBitLength) continue

    bits = []
    appendBits(0x4, 4, bits)
    appendBits(data.length, countBitLength, bits)
    data.forEach((byte) => appendBits(byte, 8, bits))
    dataCapacityBits = getNumDataCodewords(version, ecl) * 8
    if (bits.length <= dataCapacityBits) break
  }

  if (version > maxVersion) {
    throw new Error(`El contenido del QR excede la capacidad configurada (${data.length} bytes, versión máxima ${maxVersion}).`)
  }

  appendBits(0, Math.min(4, dataCapacityBits - bits.length), bits)
  appendBits(0, (8 - bits.length % 8) % 8, bits)

  const dataCodewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]
    dataCodewords.push(byte)
  }

  for (let pad = 0xec; dataCodewords.length < getNumDataCodewords(version, ecl); pad ^= 0xec ^ 0x11) dataCodewords.push(pad)

  const qr = new QrCodeBuilder(version, ecl, dataCodewords)
  return { size: qr.size, modules: qr.modules, version, ecc: ecl }
}
