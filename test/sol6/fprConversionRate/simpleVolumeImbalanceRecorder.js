let ImbalanceRecorder = artifacts.require('MockSimpleVolumeImbalanceRecorder.sol');
let TestToken = artifacts.require('Token.sol');

const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');

const Helper = require('../../helper');
const {zeroBN} = require('../../helper');
const BN = web3.utils.BN;

//global variables
let token;
let minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
let maxPerBlockImbalance = 4000;
let maxTotalImbalance = maxPerBlockImbalance * 12;
let imbalanceInst;
let admin;
let priceUpdateBlock;
let currentBlock;

const maxInt64 = new BN(2).pow(new BN(63)).sub(new BN(1));

contract('SimpleVolumeImbalanceRecorder', function (accounts) {
  before('should init globals', async function () {
    //init globals
    admin = accounts[2];
    token = await TestToken.new('test', 'tst', 18);
  });

  describe('test setTokenControlInfo', async () => {
    before('init', async () => {
      imbalanceInst = await ImbalanceRecorder.new(admin);
    });

    it('setTokenControlInfo should revert if not amdin', async () => {
      await expectRevert(
        imbalanceInst.setTokenControlInfo(
          token.address,
          minimalRecordResolution,
          maxPerBlockImbalance,
          maxTotalImbalance,
          {from: accounts[1]}
        ),
        'only admin'
      );
    });

    it('setTokenControlInfo should verify param', async () => {
      await expectRevert(
        imbalanceInst.setTokenControlInfo(token.address, zeroBN, maxPerBlockImbalance, maxTotalImbalance, {
          from: admin
        }),
        'zero minimalRecordResolution'
      );

      await expectRevert(
        imbalanceInst.setTokenControlInfo(token.address, minimalRecordResolution, zeroBN, maxTotalImbalance, {
          from: admin
        }),
        'zero maxPerBlockImbalance'
      );

      await expectRevert(
        imbalanceInst.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, zeroBN, {
          from: admin
        }),
        'zero maxTotalImbalance'
      );

      await expectRevert(
        imbalanceInst.setTokenControlInfo(
          token.address,
          minimalRecordResolution,
          new BN(minimalRecordResolution).mul(maxInt64.add(new BN(1))),
          maxTotalImbalance,
          {from: admin}
        ),
        'overflow maxPerBlockImbalance'
      );

      await expectRevert(
        imbalanceInst.setTokenControlInfo(
          token.address,
          minimalRecordResolution,
          maxPerBlockImbalance,
          new BN(minimalRecordResolution).mul(maxInt64.add(new BN(1))),
          {from: admin}
        ),
        'overflow maxTotalImbalance'
      );
    });

    it('setTokenControlInfo should success', async function () {
      await imbalanceInst.setTokenControlInfo(
        token.address,
        minimalRecordResolution,
        maxPerBlockImbalance,
        maxTotalImbalance,
        {from: admin}
      );

      //get token control info
      let controlInfo = await imbalanceInst.getTokenControlInfo(token.address);

      Helper.assertEqual(
        controlInfo.minimalRecordResolution,
        minimalRecordResolution,
        'unexpected minimalRecordResolution'
      );
      Helper.assertEqual(
        controlInfo.maxPerBlockImbalanceInResolution,
        maxPerBlockImbalance / minimalRecordResolution,
        'unexpected maxPerBlockImbalance.'
      );
      Helper.assertEqual(
        controlInfo.maxTotalImbalanceInResolution,
        maxTotalImbalance / minimalRecordResolution,
        'unexpected maxTotalImbalance'
      );
    });
  });

  describe('test record imbalance', async () => {
    before('init', async () => {
      imbalanceInst = await ImbalanceRecorder.new(admin);
      await imbalanceInst.setTokenControlInfo(
        token.address,
        minimalRecordResolution,
        maxPerBlockImbalance,
        maxTotalImbalance,
        {from: admin}
      );
    });
    
    it('should test correct negative imbalance calculated on updates without block change and without price updates.', async function () {
      currentBlock = 1002;
      priceUpdateBlock = 1001;
      let trades = [-200, -28];
      let totalBlockImbalance = 0;
      let totalImbalanceSinceUpdate = 0;

      for (let i = 0; i < trades.length; ++i) {
        await imbalanceInst.mockAddImbalance(token.address, trades[i], priceUpdateBlock, currentBlock);
        totalBlockImbalance += trades[i] / minimalRecordResolution;
      }
      totalImbalanceSinceUpdate = totalBlockImbalance;

      let imbalanceArr = await imbalanceInst.mockGetImbalanceInResolution(
        token.address,
        priceUpdateBlock,
        currentBlock
      );

      Helper.assertEqual(imbalanceArr[1], totalBlockImbalance, 'unexpected last block imbalance.');
      Helper.assertEqual(imbalanceArr[0], totalImbalanceSinceUpdate, 'unexpected total imbalance.');
    });

    it('should test correct imbalance calculated on updates with block changes and without price updates.', async function () {
      priceUpdateBlock = 1007;
      let lastBlockImbalance = 0;
      let trades = [300, 700, 80, -200, -96, 22];
      let currBlocks = [1010, 1010, 1011, 1080, 1350, 1350];
      let totalImbalanceSinceUpdate = 0;

      Helper.assertEqual(trades.length, currBlocks.length, 'arrays mismatch');

      for (let i = 0; i < trades.length; ++i) {
        await imbalanceInst.mockAddImbalance(token.address, trades[i], priceUpdateBlock, currBlocks[i]);
        if (i > 0 && currBlocks[i] == currBlocks[i - 1]) {
          lastBlockImbalance += trades[i] / minimalRecordResolution;
        } else {
          lastBlockImbalance = trades[i] / minimalRecordResolution;
        }
        totalImbalanceSinceUpdate += trades[i] / minimalRecordResolution;
      }

      let imbalanceArr = await imbalanceInst.mockGetImbalanceInResolution(
        token.address,
        priceUpdateBlock,
        currBlocks[currBlocks.length - 1]
      );

      Helper.assertEqual(imbalanceArr[0], totalImbalanceSinceUpdate, 'unexpected total imbalance.');
      Helper.assertEqual(imbalanceArr[1], lastBlockImbalance, 'unexpected last block imbalance.');
    });

    it('should test correct imbalance calculated on updates with block changes and with price updates.', async function () {
      let lastBlockImbalance = 0;
      let trades = [100, 500, 64, -480, -6, 64, 210];
      let currBlocks = [2000, 2000, 2001, 2002, 2300, 2301, 2350];
      let priceUpdateBlocks = [2000, 2000, 2000, 2000, 2300, 2300, 2300];
      let totalImbalanceSinceUpdate = 0;

      Helper.assertEqual(trades.length, currBlocks.length, 'arrays mismatch');
      Helper.assertEqual(trades.length, priceUpdateBlocks.length, 'arrays mismatch');

      for (let i = 0; i < trades.length; ++i) {
        let dstQty = trades[i] / minimalRecordResolution;
        await imbalanceInst.mockAddImbalance(token.address, trades[i], priceUpdateBlocks[i], currBlocks[i]);
        if (i > 0 && currBlocks[i] == currBlocks[i - 1]) {
          lastBlockImbalance += dstQty;
        } else {
          lastBlockImbalance = dstQty;
        }
        if (i > 0 && priceUpdateBlocks[i] > priceUpdateBlocks[i - 1]) {
          totalImbalanceSinceUpdate = dstQty;
        } else {
          totalImbalanceSinceUpdate += dstQty;
        }
      }

      let imbalanceArr = await imbalanceInst.mockGetImbalanceInResolution(
        token.address,
        priceUpdateBlocks[priceUpdateBlocks.length - 1],
        currBlocks[currBlocks.length - 1]
      );

      Helper.assertEqual(imbalanceArr[0], totalImbalanceSinceUpdate, 'unexpected total imbalance.');
      Helper.assertEqual(imbalanceArr[1], lastBlockImbalance, 'unexpected last block imbalance.');
    });

    it('should test correct imbalance calculated on updates with block changes and with price updates in middle of block.', async function () {
      let lastBlockImbalance = 0;
      let trades = [160, 620, 64, -480, -6, 64, 210];
      let currBlocks = [6000, 6001, 6001, 6002, 6002, 6002, 6002];
      let priceUpdateBlocks = [6000, 6000, 6000, 6000, 6000, 6002, 6002];
      let totalImbalanceSinceUpdate = 0;

      Helper.assertEqual(trades.length, currBlocks.length, 'arrays mismatch');
      Helper.assertEqual(trades.length, priceUpdateBlocks.length, 'arrays mismatch');

      for (let i = 0; i < trades.length; ++i) {
        let qty = Math.floor(trades[i] / minimalRecordResolution);
        await imbalanceInst.mockAddImbalance(token.address, trades[i], priceUpdateBlocks[i], currBlocks[i]);
        if (i > 0 && currBlocks[i] == currBlocks[i - 1]) {
          lastBlockImbalance += qty;
        } else {
          lastBlockImbalance = qty;
        }

        if (i > 0 && priceUpdateBlocks[i] > priceUpdateBlocks[i - 1]) {
          if ((priceUpdateBlocks[i] = currBlocks[i])) {
            totalImbalanceSinceUpdate = lastBlockImbalance;
          } else {
            totalImbalanceSinceUpdate = qty;
          }
        } else {
          totalImbalanceSinceUpdate += qty;
        }
      }

      let imbalanceArr = await imbalanceInst.mockGetImbalanceInResolution(
        token.address,
        priceUpdateBlocks[priceUpdateBlocks.length - 1],
        currBlocks[currBlocks.length - 1]
      );

      Helper.assertEqual(imbalanceArr[0], totalImbalanceSinceUpdate, 'unexpected total imbalance.');
      Helper.assertEqual(imbalanceArr[1], lastBlockImbalance, 'unexpected last block imbalance.');
    });

    it('should test correct imbalance calculated when minimal resolution is a non dividable number.', async function () {
      let lastBlockImbalance = 0;
      let trades = [160, 620, 64, -480, -6, 64, 210];
      let currBlocks = [6000, 6001, 6001, 6002, 6002, 6002, 6002];
      let priceUpdateBlocks = [6000, 6000, 6000, 6000, 6000, 6002, 6002];
      let totalImbalanceSinceUpdate = 0;

      //create new instance
      let imbalanceInst2 = await ImbalanceRecorder.new(admin);

      //set even resolution
      newRecordResolution = 13;
      await imbalanceInst2.setTokenControlInfo(
        token.address,
        newRecordResolution,
        maxPerBlockImbalance,
        maxTotalImbalance,
        {from: admin}
      );

      for (let i = 0; i < trades.length; ++i) {
        let recordQty = new BN(trades[i]).div(new BN(newRecordResolution)).toNumber();
        await imbalanceInst2.mockAddImbalance(token.address, trades[i], priceUpdateBlocks[i], currBlocks[i]);
        if (i > 0 && currBlocks[i] == currBlocks[i - 1]) {
          lastBlockImbalance += recordQty;
        } else {
          lastBlockImbalance = recordQty;
        }

        if (i > 0 && priceUpdateBlocks[i] > priceUpdateBlocks[i - 1]) {
          if ((priceUpdateBlocks[i] = currBlocks[i])) {
            totalImbalanceSinceUpdate = lastBlockImbalance;
          } else {
            totalImbalanceSinceUpdate = recordQty;
          }
        } else {
          totalImbalanceSinceUpdate += recordQty;
        }
      }

      let imbalanceArr = await imbalanceInst2.mockGetImbalanceInResolution(
        token.address,
        priceUpdateBlocks[priceUpdateBlocks.length - 1],
        currBlocks[currBlocks.length - 1]
      );

      Helper.assertEqual(imbalanceArr[0], totalImbalanceSinceUpdate, 'unexpected total imbalance.');
      Helper.assertEqual(imbalanceArr[1], lastBlockImbalance, 'unexpected last block imbalance.');
    });

    it('should test record resolution influence when trades always below resolution.', async function () {
      let trade = 16;
      let currentBlock = (priceUpdateBlock = 20000);

      //create new instance
      let imbalanceInst2 = await ImbalanceRecorder.new(admin);

      //set even resolution
      newRecordResolution = 17; //trade + 1
      await imbalanceInst2.setTokenControlInfo(
        token.address,
        newRecordResolution,
        maxPerBlockImbalance,
        maxTotalImbalance,
        {from: admin}
      );

      for (let i = 0; i < 20; ++i) {
        await imbalanceInst2.mockAddImbalance(token.address, trade, priceUpdateBlock, currentBlock++);
      }

      let imbalanceArr = await imbalanceInst2.mockGetImbalanceInResolution(
        token.address,
        priceUpdateBlock,
        currentBlock
      );
      Helper.assertEqual(imbalanceArr[0], 0, 'unexpected total imbalance.');
    });

    it('test revert if record imbalance overflow or underflow', async function () {
      //create new instance
      let imbalanceInst2 = await ImbalanceRecorder.new(admin);
      await imbalanceInst2.setTokenControlInfo(
        token.address,
        minimalRecordResolution,
        maxPerBlockImbalance,
        maxTotalImbalance,
        {from: admin}
      );

      let priceUpdateBlock = 2000;
      let currentBlock = 2000;

      await expectRevert(
        imbalanceInst2.mockAddImbalance(
          token.address,
          maxInt64.add(new BN(1)).mul(new BN(minimalRecordResolution)),
          priceUpdateBlock,
          currentBlock
        ),
        'SafeInt64: type cast overflow'
      );

      await imbalanceInst2.mockAddImbalance(
        token.address,
        maxInt64.mul(new BN(minimalRecordResolution)),
        priceUpdateBlock,
        currentBlock
      ),
      await expectRevert(
        imbalanceInst2.mockAddImbalance(
          token.address,
          new BN(minimalRecordResolution),
          priceUpdateBlock,
          currentBlock
        ),
        'SafeInt64: addition overflow'
      );
    });
  });
});
