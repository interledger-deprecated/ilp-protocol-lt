'use strict'

const IlpPacket = require('ilp-packet')
const chai = require('chai')
const assert = chai.assert
const LT = require('..')
const MockPlugin = require('./mocks/mockPlugin')
const chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)

describe('LT', function () {
  beforeEach(function () {
    this.plugin1 = new MockPlugin()
    this.plugin2 = new MockPlugin()
  })

  afterEach(function () {
    this.plugin2.deregisterDataHandler()
  })

  describe('createLoop', function () {
    beforeEach(async function () {
      this.loop = await LT.createLoop({
        pluginOut: this.plugin1,
        pluginIn: this.plugin2
      })
    })

    it('should return an object with a pay function', async function () {
      assert.isObject(this.loop)
      assert.isFunction(this.loop.pay)
    })
    describe('-> loop.pay', function () {
      beforeEach(function () {
        this.plugin1.dataHandler = (packet) => {
          const obj = IlpPacket.deserializeIlpPrepare(packet)
          obj.amount = '' + (parseInt(obj.amount) + 5)
          return this.plugin2._dataHandler(IlpPacket.serializeIlpPrepare(obj))
        }
      })
      afterEach(function () {
        delete this.plugin1.dataHandler
      })
      it('should complete an accepted loopback payment', async function () {
        const result = await this.loop.pay({
          sourceAmount: '10',
          expiresAt: new Date(new Date().getTime() + 10000),
          loopbackHandler: (destinationAmount) => {
            assert.equal(destinationAmount, 15)
            return true
          }
        })
        assert.deepEqual(result, {
          type: 13,
          typeString: 'ilp_fulfill',
          data: {
            fulfillment: result.data.fulfillment,
            data: Buffer.alloc(0)
          }
        })
      })
      it('should complete a rejected loopback payment', async function () {
        const result = await this.loop.pay({
          sourceAmount: '20',
          expiresAt: new Date(new Date().getTime() + 10000),
          loopbackHandler: (destinationAmount) => {
            assert.equal(destinationAmount, 25)
            return false
          }
        })
        assert.deepEqual(result, {
          type: 14,
          typeString: 'ilp_reject',
          data: {
            code: 'F04',
            triggeredBy: 'test.example.alice',
            message: 'Insufficient destination amount',
            data: Buffer.alloc(0)
          }
        })
      })
    })
  })
})
