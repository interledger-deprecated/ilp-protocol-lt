const crypto = require('crypto')
const IlpPacket = require('ilp-packet')
const IlDcp = require('ilp-protocol-ildcp')

function sha256 (preimage) {
  return crypto.createHash('sha256').update(preimage).digest()
}

class Loop {
  constructor ({ pluginOut, pluginIn, destination }) {
    this.pending = {}
    this.destination = destination
    this.pluginOut = pluginOut
    this.pluginIn = pluginIn
    this.pluginIn.registerDataHandler(this._loopbackPrepareHandler.bind(this))
  }

  async _loopbackPrepareHandler (packet) {
    const { amount, executionCondition } = IlpPacket.deserializeIlpPrepare(packet)
    if (this.pending[executionCondition]) {
      const shouldFulfill = await this.pending[executionCondition].loopbackHandler(amount)
      if (shouldFulfill) {
        const fulfillment = this.pending[executionCondition].fulfillment
        return IlpPacket.serializeIlpFulfill({ fulfillment, data: Buffer.from([]) })
      }
    }
    return IlpPacket.serializeIlpReject({
      code: 'F04',
      triggeredBy: this.destination,
      message: 'Insufficient destination amount',
      data: Buffer.from([])
    })
  }

  async pay ({ sourceAmount, expiresAt, loopbackHandler }) {
    const fulfillment = crypto.randomBytes(32)
    const executionCondition = sha256(fulfillment)
    const packet = IlpPacket.serializeIlpPrepare({
      amount: sourceAmount,
      expiresAt,
      executionCondition,
      destination: this.destination,
      data: Buffer.from([])
    })
    this.pending[executionCondition] = { fulfillment, loopbackHandler }
    const resultPacket = await this.pluginOut.sendData(packet)
    delete this.pending[executionCondition]
    return IlpPacket.deserializeIlpPacket(resultPacket)
  }

  async chunked ({ minDestinationAmount, minExchangeRate }) {
    let chunkSizeMargin = 0.99
    let endGameFactor = 0.75
    let initialNumThreads = 4
    let additiveIncreaseInterval = 1000
    let maxDestinationAmount = minDestinationAmount * 1.01
    let chunkSize = minDestinationAmount / minExchangeRate
    let amountArrived = 0
    let done
    const runThread = async () => {
      const sourceAmount = chunkSize
      const expiresAt = new Date(new Date().getTime() + 10000)
      const loopbackHandler = (amount) => {
        if (amount < sourceAmount * minExchangeRate) {
          return false
        }
        if (amountArrived + amount > maxDestinationAmount) {
          chunkSize *= endGameFactor
          return false
        }
        if (amountArrived + amount > minDestinationAmount) {
          setImmediate(done)
        }
        amountArrived += amount
        return true
      }
      const result = this.pay({ sourceAmount, expiresAt, loopbackHandler })
      if (result.data.code === 'F08') {
        chunkSize = sourceAmount * (result.data.maximumAmount * chunkSizeMargin / result.data.receivedAmount)
      }
      if (result.typeString === 'ilp_fulfill' && amountArrived < minDestinationAmount) {
        setImmediate(runThread) // otherwise, end this thread (congestion control)
      }
    }
    for (let i = 0; i < initialNumThreads; i++) {
      runThread()
    }
    setInterval(runThread, additiveIncreaseInterval)
    return new Promise(resolve => { done = resolve })
  }
}

async function createLoop ({ pluginOut, pluginIn }) {
  // use il-dcp on pluginIn to determine the loopback address:
  const req = IlDcp.serializeIldcpRequest()
  const resBuf = await pluginIn.sendData(req)
  const destination = IlDcp.deserializeIldcpResponse(resBuf).clientAddress

  return new Loop({ pluginOut, pluginIn, destination })
}

module.exports = {
  createLoop
}
