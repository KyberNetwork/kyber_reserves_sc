const ConversionRates = artifacts.require('MockQtyStepConversionRates.sol');

const KyberReserve = artifacts.require('KyberReserve.sol');
const TestToken = artifacts.require('TestToken');
const ReserveGasProfiler = artifacts.require('ReserveGasProfiler');

const BN = web3.utils.BN;
const {ethAddress, ethDecimals, precisionUnits} = require('./../../helper');
const {expectEvent, expectRevert} = require('@openzeppelin/test-helpers');
const Helper = require('./../../helper');

let admin;
let operator;
let alerter;
let tokens;

let reserveAddress;
let convRatesInst;

let baseBuy;
let baseSell;
let currentBlock;
const compactBuyArr1 = [1, 2, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
const compactBuyArr2 = [15, 16, 17, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14];
const compactSellArr1 = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
const compactSellArr2 = [35, 36, 37, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
let qtyBuyStepX = [15, 30, 70];
let qtyBuyStepY = [8, 30, 70];
let qtySellStepX = [155, 305, 705];
let qtySellStepY = [10, 32, 78];

// getStepFunctionData command IDs
const comID_BuyRateStpQtyXLength = 0;
const comID_BuyRateStpQtyParamX = 1;
const comID_BuyRateStpQtyYLength = 2;
const comID_BuyRateStpQtyParamY = 3;

const comID_SellRateStpQtyXLength = 4;
const comID_SellRateStpQtyParamX = 5;
const comID_SellRateStpQtyYLength = 6;
const comID_SellRateStpQtyParamY = 7;

const comID_BuyRateStpImbalanceXLength = 8;
const comID_BuyRateStpImbalanceParamX = 9;
const comID_BuyRateStpImbalanceYLength = 10;
const comID_BuyRateStpImbalanceParamY = 11;

const comID_SellRateStpImbalanceXLength = 12;
const comID_SellRateStpImbalanceParamX = 13;
const comID_SellRateStpImbalanceYLength = 14;
const comID_SellRateStpImbalanceParamY = 15;

const validRateDurationInBlocks = 1000;
const minimalRecordResolution = 2; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
const maxPerBlockImbalance = 4000;
const maxTotalImbalance = maxPerBlockImbalance * 12;
const numTokens = 17;

contract('QtyStepConversionRates', function (accounts) {
  before('should init globals', function () {
    admin = accounts[0];
    alerter = accounts[1];
    operator = accounts[2];
    reserveAddress = accounts[3];
  });

  it('should init ConversionRates Inst and set general parameters.', async function () {
    //init contracts
    convRatesInst = await ConversionRates.new(admin);

    //set pricing general parameters
    convRatesInst.setValidRateDurationInBlocks(validRateDurationInBlocks);

    //create and add tokens. actually only addresses...
    tokens = [];
    for (let i = 0; i < numTokens; ++i) {
      let token = await TestToken.new('test' + i, 'tst' + i, 18);
      tokens.push(token.address);
      await convRatesInst.addToken(token.address);
      await convRatesInst.setTokenControlInfo(
        token.address,
        minimalRecordResolution,
        maxPerBlockImbalance,
        maxTotalImbalance
      );
      await convRatesInst.enableTokenTrade(token.address);
    }

    await convRatesInst.addOperator(operator);
    await convRatesInst.setReserveAddress(reserveAddress);
    await convRatesInst.addAlerter(alerter);
  });

  it('should set base rates for all tokens then get and verify.', async function () {
    // set base rate
    baseBuy = [];
    baseSell = [];
    for (i = 0; i < numTokens; ++i) {
      //buy is ether to token rate. sale is token to ether rate. so sell == 1 / buy. assuming we have no spread.
      let ethToTokenRate = convertRateToPricingRate((i + 1) * 10);
      let tokenToEthRate = new BN(10).pow(new BN(18)).div(new BN((i + 1) * 10));
      baseBuy.push(ethToTokenRate);
      baseSell.push(tokenToEthRate);
    }

    let buys = [];
    let sells = [];
    let indices = [];
    let currentBlock = await Helper.getCurrentBlock();
    await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});

    //get base rate - validate data
    for (i = 0; i < numTokens; ++i) {
      let thisBuy = await convRatesInst.getBasicRate(tokens[i], true);
      let thisSell = await convRatesInst.getBasicRate(tokens[i], false);
      Helper.assertEqual(thisBuy, baseBuy[i], 'wrong base buy rate');
      Helper.assertEqual(thisSell, baseSell[i], 'wrong base sell rate');
    }
  });

  it('should set compact data all tokens then get and verify.', async function () {
    //set compact data
    buys = [Helper.bytesToHex(compactBuyArr1), Helper.bytesToHex(compactBuyArr2)];
    sells = [Helper.bytesToHex(compactSellArr1), Helper.bytesToHex(compactSellArr2)];
    indices = [0, 1];

    currentBlock = await Helper.getCurrentBlock();
    await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

    //get compact data for all tokens and verify as expected
    for (i = 0; i < numTokens; ++i) {
      let arrIndex = Math.floor(i / 14);
      let fieldIndex = i % 14;
      let data = await convRatesInst.getCompactData(tokens[i]);
      let compactBuy;
      let compactSell;

      Helper.assertEqual(data.arrayIndex, arrIndex, 'wrong array ' + i);
      Helper.assertEqual(data.fieldOffset, fieldIndex, 'wrong field index ' + i);
      if (arrIndex == 0) {
        compactBuy = compactBuyArr1[fieldIndex];
        compactSell = compactSellArr1[fieldIndex];
      } else {
        compactBuy = compactBuyArr2[fieldIndex];
        compactSell = compactSellArr2[fieldIndex];
      }
      Helper.assertEqual(data.buyRateUpdate, compactBuy, 'wrong buy: ' + i);
      Helper.assertEqual(data.sellRateUpdate, compactSell, 'wrong sell: ' + i);
    }
    //get block number from compact data and verify
    let blockNum = await convRatesInst.getRateUpdateBlock(tokens[3]);
    Helper.assertEqual(blockNum, currentBlock, 'bad block number returned');

    blockNum = await convRatesInst.getRateUpdateBlock(tokens[11]);
    Helper.assertEqual(blockNum, currentBlock, 'bad block number returned');
  });

  it('should verify setCompactData reverted when block number out of range.', async function () {
    let block = 0xffffffff1; //block number limited to size of int
    await expectRevert(
      convRatesInst.setCompactData(buys, sells, block, indices, {from: operator}),
      'overflow blk number'
    );
    //see success on valid block
    let validBlock = 0xffffffff - 1;
    await convRatesInst.setCompactData(buys, sells, validBlock, indices, {from: operator});
    currentBlock = await Helper.getCurrentBlock();
    await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
  });

  it('should set step functions qty', async function () {
    for (let i = 0; i < numTokens; ++i) {
      await convRatesInst.setQtyStepFunction(tokens[i], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {
        from: operator
      });
    }
  });

  it('should get qty buy step function and verify numbers.', async function () {
    tokenId = 1; //

    // x axis
    let received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpQtyXLength, 0); //get length
    Helper.assertEqual(received, qtyBuyStepX.length, "length don't match");

    // now y axis
    received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpQtyYLength, 0); //get length
    Helper.assertEqual(received, qtyBuyStepX.length, "length don't match");

    //iterate x and y values and compare
    for (let i = 0; i < qtyBuyStepX.length; ++i) {
      received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpQtyParamX, i); //get x value in cell i
      Helper.assertEqual(received, qtyBuyStepX[i], 'mismatch for x value in cell: ' + i);
      received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpQtyParamY, i); //get y value in cell i
      Helper.assertEqual(received, qtyBuyStepY[i], 'mismatch for y value in cell: ' + i);
    }
  });

  it('should get qty sell step function and verify numbers.', async function () {
    tokenId = 3; //

    // x axis
    let received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpQtyXLength, 0); //get length
    Helper.assertEqual(received, qtySellStepX.length, "length don't match");

    // now y axis
    received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpQtyYLength, 0); //get length
    Helper.assertEqual(received, qtySellStepX.length, "length don't match");

    //iterate x and y values and compare
    for (let i = 0; i < qtySellStepX.length; ++i) {
      received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpQtyParamX, i); //get x value in cell i
      Helper.assertEqual(received, qtySellStepX[i], 'mismatch for x value in cell: ' + i);
      received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpQtyParamY, i); //get y value in cell i
      Helper.assertEqual(received, qtySellStepY[i], 'mismatch for y value in cell: ' + i);
    }
  });

  it('should get imbalance buy step function', async function () {
    tokenId = 1; //

    // x axis
    let received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceXLength, 0); //get length
    Helper.assertEqual(received, 1, "length don't match");

    // now y axis
    received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceYLength, 0); //get length
    Helper.assertEqual(received, 1, "length don't match");

    //iterate x and y values and compare
    received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceParamX, 0); //get x value in cell 0
    Helper.assertEqual(0, 0, 'mismatch for x value in cell 0');
    received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_BuyRateStpImbalanceParamY, 0); //get y value in cell 0
    Helper.assertEqual(0, 0, 'mismatch for y value in cell 0');
  });

  it('should get imbalance sell step function', async function () {
    tokenId = 3; //

    // x axis
    let received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceXLength, 0); //get length
    Helper.assertEqual(received, 1, "length don't match");

    // now y axis
    received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceYLength, 0); //get length
    Helper.assertEqual(received, 1, "length don't match");

    //iterate x and y values and compare
    received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceParamX, 0); //get x value in cell i
    Helper.assertEqual(received, 0, 'mismatch for x value in cell 0');
    received = await convRatesInst.getStepFunctionData(tokens[tokenId], comID_SellRateStpImbalanceParamY, 0); //get y value in cell i
    Helper.assertEqual(received, 0, 'mismatch for y value in cell 0');
  });

  it('should get set function data reverts with illegal command ID.', async function () {
    expectRevert(convRatesInst.getStepFunctionData(tokens[1], 19, 0), 'invalid command');
  });

  it('should get and verify listed tokens.', async function () {
    let rxTokens = await convRatesInst.getListedTokens();
    Helper.assertEqual(rxTokens.length, tokens.length, "length don't match");

    for (let i = 0; i < tokens.length; i++) {
      Helper.assertEqual(rxTokens[i], tokens[i], "address don't match");
    }
  });

  it('should test get token basic data works properly.', async function () {
    let token = await TestToken.new('testt', 'tst', 18);
    //see token not listed
    let basicData = await convRatesInst.getTokenBasicData(token.address);
    assert.equal(basicData[0], false, 'token should not be listed');

    //add token and see listed
    await convRatesInst.addToken(token.address);
    basicData = await convRatesInst.getTokenBasicData(token.address);
    assert.equal(basicData.listed, true, 'token should  be listed');

    //see not enabled
    assert.equal(basicData.enabled, false, 'token should not be enabled');

    //enable token and see enabled
    await convRatesInst.setTokenControlInfo(
      token.address,
      minimalRecordResolution,
      maxPerBlockImbalance,
      maxTotalImbalance
    );
    await convRatesInst.enableTokenTrade(token.address);
    basicData = await convRatesInst.getTokenBasicData(token.address);
    assert.equal(basicData.enabled, true, 'token should be enabled');
  });

  it('should get buy rate with update according to compact data update.', async function () {
    let tokenInd = 7;
    let token = tokens[tokenInd]; //choose some token
    let baseBuyRate = await convRatesInst.getBasicRate(token, true);

    // get rate without activating quantity step function (small amount).
    let srcQty = 2;
    let expectedRate = new BN(baseBuyRate);
    let extraBps = compactBuyArr1[tokenInd] * 10;
    expectedRate = Helper.addBps(expectedRate, extraBps);

    let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
    extraBps = getExtraBpsForBuyQuantity(dstQty);
    expectedRate = Helper.addBps(expectedRate, extraBps);

    let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);
    Helper.assertEqual(receivedRate, expectedRate, 'bad rate');
  });

  it('should get buy rate when compact data has boundary values (-128, 127).', async function () {
    let tokenInd = 7;
    let token = tokens[tokenInd]; //choose some token
    let baseBuyRate = await convRatesInst.getBasicRate(token, true);

    //update compact data
    let indices = [0]; // we update 1st cell in compact data
    compactBuyArr1[tokenInd] = -128;
    let buys = [Helper.bytesToHex(compactBuyArr1)];
    let sells = [Helper.bytesToHex(compactSellArr1)];
    currentBlock = await Helper.getCurrentBlock();
    await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

    // get rate with the updated compact data.
    let srcQty = 5;
    let expectedRate = new BN(baseBuyRate);
    let extraBps = compactBuyArr1[tokenInd] * 10;
    expectedRate = Helper.addBps(expectedRate, extraBps);
    let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
    extraBps = getExtraBpsForBuyQuantity(dstQty);
    expectedRate = Helper.addBps(expectedRate, extraBps);

    let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);
    Helper.assertEqual(receivedRate, expectedRate, 'bad rate');

    //update compact data
    compactBuyArr1[tokenInd] = 127;
    buys = [Helper.bytesToHex(compactBuyArr1)];
    currentBlock = await Helper.getCurrentBlock();
    await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

    // get rate without activating quantity step function (small amount).
    srcQty = 11;
    expectedRate = new BN(baseBuyRate);
    extraBps = compactBuyArr1[tokenInd] * 10;
    expectedRate = Helper.addBps(expectedRate, extraBps);
    dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
    extraBps = getExtraBpsForBuyQuantity(dstQty);
    expectedRate = Helper.addBps(expectedRate, extraBps);

    receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);
    Helper.assertEqual(receivedRate, expectedRate, 'bad rate');
  });

  it('should get buy rate when updating only 2nd cell compact data.', async function () {
    let tokenInd = 16;
    let token = tokens[tokenInd]; //choose some token
    let baseBuyRate = await convRatesInst.getBasicRate(token, true);

    //update compact data
    let indices = [1];
    // we update 2nd cell in compact data
    compactBuyArr2[tokenInd - 14] = -128;
    let buys = [Helper.bytesToHex(compactBuyArr2)];
    let sells = [Helper.bytesToHex(compactSellArr2)];
    let currentBlock = await Helper.getCurrentBlock();
    await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});

    // get rate without activating quantity step function (small amount).

    // calculate expected rate
    let srcQty = 21;
    let expectedRate = new BN(baseBuyRate);
    let extraBps = compactBuyArr2[tokenInd - 14] * 10;
    expectedRate = Helper.addBps(expectedRate, extraBps);
    let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
    extraBps = getExtraBpsForBuyQuantity(dstQty);
    expectedRate = Helper.addBps(expectedRate, extraBps);

    let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);
    Helper.assertEqual(receivedRate, expectedRate, 'bad rate');
  });

  it('should get buy rate with compact data and quantity step.', async function () {
    let tokenInd = 11;
    let token = tokens[tokenInd]; //choose some token
    let baseBuyRate = await convRatesInst.getBasicRate(token, true);

    // calculate expected rate
    let srcQty = 17;
    let expectedRate = new BN(baseBuyRate);
    let extraBps = compactBuyArr1[tokenInd] * 10;
    expectedRate = Helper.addBps(expectedRate, extraBps);
    let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
    extraBps = getExtraBpsForBuyQuantity(dstQty);
    expectedRate = Helper.addBps(expectedRate, extraBps);

    let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);
    Helper.assertEqual(receivedRate, expectedRate, 'bad rate');
  });

  it('should get buy rate quantity step and compact data update with token index > 14.', async function () {
    let tokenInd = 15;
    let token = tokens[tokenInd]; //choose some token
    let baseBuyRate = await convRatesInst.getBasicRate(token, true);

    // get rate
    let srcQty = 24;
    let expectedRate = new BN(baseBuyRate);
    let extraBps = compactBuyArr2[tokenInd - 14] * 10;
    expectedRate = Helper.addBps(expectedRate, extraBps);
    let dstQty = new BN(srcQty).mul(expectedRate).div(precisionUnits);
    extraBps = getExtraBpsForBuyQuantity(dstQty);
    expectedRate = Helper.addBps(expectedRate, extraBps);

    let receivedRate = await convRatesInst.getRate(token, currentBlock, true, srcQty);
    Helper.assertEqual(receivedRate, expectedRate, 'bad rate');
  });

  it('should get sell rate with compact data and quantity step.', async function () {
    let tokenInd = 16;
    let token = tokens[tokenInd]; //choose some token
    let baseSellRate = await convRatesInst.getBasicRate(token, false);

    // get rate
    let sellQty = 500;
    let expectedRate = new BN(baseSellRate);
    //calc compact data
    let extraBps = compactSellArr2[tokenInd - 14] * 10;
    expectedRate = Helper.addBps(expectedRate, extraBps);
    //calc quantity steps
    extraBps = getExtraBpsForSellQuantity(sellQty);
    expectedRate = Helper.addBps(expectedRate, extraBps);

    let receivedRate = await convRatesInst.getRate(token, currentBlock, false, sellQty);
    Helper.assertEqual(receivedRate, expectedRate, 'bad rate');
  });

  it('should verify addToken reverted when token already exists.', async function () {
    let tokenInd = 16;
    let token = tokens[tokenInd]; //choose some token

    await expectRevert(convRatesInst.addToken(token), 'listed token');
  });

  it("should verify set compact data reverted when input arrays length don't match.", async function () {
    //set compact data
    let buys = [Helper.bytesToHex(compactBuyArr1), Helper.bytesToHex(compactBuyArr2)];
    let sells = [Helper.bytesToHex(compactSellArr1)];
    let indices = [0, 1];
    let currentBlock = await Helper.getCurrentBlock();
    //compact sell arr smaller (1)
    await expectRevert(
      convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator}),
      'buy-sell: miss-match length'
    );

    //sells 2 buys 2. indices 3
    sells.push(Helper.bytesToHex(compactSellArr2));
    indices.push(5);

    await expectRevert(
      convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator}),
      'buy-indices: miss-match length'
    );

    //set indices to 2 and see success.
    indices.pop();
    await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
  });

  it("should verify set compact data reverted when input arrays length don't match num set tokens.", async function () {
    //set compact data
    let buys = [Helper.bytesToHex(compactBuyArr1), Helper.bytesToHex(compactBuyArr2), Helper.bytesToHex([5])];
    let sells = [Helper.bytesToHex(compactSellArr1), Helper.bytesToHex(compactSellArr2), Helper.bytesToHex([5])];
    let indices = [0, 1, 5];

    //length 3 but only two exist in contract
    await expectRevert(
      convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator}),
      'invalid indices'
    );

    sells.length = buys.length = indices.length = 2;
    await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
    lastSetCompactBlock = currentBlock;
  });

  it("should verify set base rate data reverted when input arrays length don't match each other.", async function () {
    //sells different length
    let buys = [Helper.bytesToHex(compactBuyArr1), Helper.bytesToHex(compactBuyArr2)];
    let sells = [Helper.bytesToHex(compactSellArr1), Helper.bytesToHex(compactSellArr2), Helper.bytesToHex([5])];
    let indices = [0, 1];

    currentBlock = await Helper.getCurrentBlock();
    await expectRevert(
      convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {
        from: operator
      }),
      'buy-sell: miss-match length'
    );
    //length 3 for sells and buys. indices 2
    buys = [Helper.bytesToHex(compactBuyArr1), Helper.bytesToHex(compactBuyArr2), Helper.bytesToHex([5])];
    await expectRevert(
      convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {
        from: operator
      }),
      'buy-indices: miss-match length'
    );
    buys.pop();
    sells.pop();
    //baseBuy different length
    baseBuy.push(Helper.bytesToHex([19]));
    await expectRevert(
      convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator}),
      'tokens & baseBuy miss-match length'
    );
    baseBuy.pop();

    //baseSell different length
    baseSell.push(Helper.bytesToHex([19]));
    await expectRevert(
      convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator}),
      'tokens & baseSell miss-match length'
    );
    baseSell.pop();

    currentBlock = await Helper.getCurrentBlock();
    await convRatesInst.setCompactData(buys, sells, currentBlock, indices, {from: operator});
  });

  it('should verify set base rate data reverted when setting to unlisted token.', async function () {
    //sells different length
    let tokenAdd5 = tokens[5];
    let newToken = await TestToken.new('tst token', 'tst', 18);
    tokens[5] = newToken.address;

    currentBlock = await Helper.getCurrentBlock();
    await expectRevert(
      convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator}),
      'unlisted token'
    );
    tokens[5] = tokenAdd5;
    await convRatesInst.setBaseRate(tokens, baseBuy, baseSell, buys, sells, currentBlock, indices, {from: operator});
  });

  it("should verify set qty step reverted when input arrays lengths don't match.", async function () {
    //qty buy step x - change size. see set fails
    qtyBuyStepX.push(17);
    await expectRevert(
      convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {
        from: operator
      }),
      'xBuy-yBuy not match length'
    );
    //set size back and see set success
    qtyBuyStepX.pop();

    //qty buy step x - change size. see set fails
    qtySellStepX.push(17);
    await expectRevert(
      convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {
        from: operator
      }),
      'xSell-ySell not match length'
    );
    qtySellStepX.pop();

    await convRatesInst.setQtyStepFunction(tokens[4], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {
      from: operator
    });
  });

  it('should verify set qty step reverted when token not listed.', async function () {
    let newToken = await TestToken.new('tst token', 'tst', 18);
    await expectRevert(
      convRatesInst.setQtyStepFunction(newToken.address, qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {
        from: operator
      }),
      'not listed token'
    );
  });

  it('should verify enable token trade reverted if token not added(listed).', async function () {
    let someToken = await TestToken.new('testinggg', 'ts11', 15);
    await convRatesInst.setTokenControlInfo(
      someToken.address,
      minimalRecordResolution,
      maxPerBlockImbalance,
      maxTotalImbalance
    );
    await expectRevert(convRatesInst.enableTokenTrade(someToken.address), 'not listed token');
    //add token and see enable success
    await convRatesInst.addToken(someToken.address);
    await convRatesInst.enableTokenTrade(someToken.address);
  });

  it('should verify enable token trade reverted if token control info not set.', async function () {
    let someToken = await TestToken.new('testing', 'tst9', 15);

    await convRatesInst.addToken(someToken.address);

    await expectRevert(convRatesInst.enableTokenTrade(someToken.address), 'tokenControlInfo is required');

    //add token and see enable success
    await convRatesInst.setTokenControlInfo(
      someToken.address,
      minimalRecordResolution,
      maxPerBlockImbalance,
      maxTotalImbalance
    );
    await convRatesInst.enableTokenTrade(someToken.address);
  });

  it('should verify disable token trade reverted if token not listed.', async function () {
    let someToken = await TestToken.new('testing', 'tst9', 15);
    await expectRevert(convRatesInst.disableTokenTrade(someToken.address, {from: alerter}), 'unlisted token');

    //add token and see enable success
    await convRatesInst.addToken(someToken.address);
    await convRatesInst.disableTokenTrade(someToken.address, {from: alerter});
  });

  it('should verify get rate returns 0 if token disabled.', async function () {
    let qty = 3000;
    let index = 5;

    let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
    Helper.assertGreater(rate, 0, 'unexpected rate');

    await convRatesInst.disableTokenTrade(tokens[index], {from: alerter});
    rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
    Helper.assertEqual(rate, 0, 'unexpected rate');

    await convRatesInst.enableTokenTrade(tokens[index]);
  });

  it('should verify get rate returns 0 block is high (bigger then expiration block).', async function () {
    let qty = 3000;
    let index = 5;

    let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

    Helper.assertGreater(rate, 0, 'unexpected rate');

    rate = await convRatesInst.getRate(tokens[index], currentBlock * 1 + 2000, false, qty);
    Helper.assertEqual(rate, 0, 'unexpected rate');
  });

  it('should verify get rate returns 0 when qty above block imbalance.', async function () {
    let qty = maxPerBlockImbalance * 1 - 1;
    let index = 5;

    let rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);

    Helper.assertGreater(rate, 0, 'unexpected rate');

    qty = qty * 1 + 2;
    rate = await convRatesInst.getRate(tokens[index], currentBlock, false, qty);
    Helper.assertEqual(rate, 0, 'unexpected rate');
  });

  it('should verify get rate returns 0 when qty + total imbalance are above maxTotalImbalance.', async function () {
    let qty = -1 * maxPerBlockImbalance * minimalRecordResolution + 2;
    let index = 11;
    let totalImbalance = 0;
    let token = tokens[index];
    let imbalance = qty / minimalRecordResolution;

    let lastSetBlock = await convRatesInst.getUpdateRateBlockFromCompact(token);
    Helper.assertEqual(lastSetBlock, currentBlock, 'unexpected block');

    while (totalImbalance + imbalance > -maxTotalImbalance / minimalRecordResolution) {
      await convRatesInst.recordImbalance(token, qty, lastSetBlock, currentBlock++, {
        from: reserveAddress
      });
      totalImbalance += imbalance;
    }

    let rximbalance = await convRatesInst.mockGetImbalance(token, lastSetBlock, currentBlock);
    Helper.assertEqual(rximbalance[0], totalImbalance, 'bad imbalance');

    //we are near total imbalance so small getRate will get legal rate.
    qty = (maxTotalImbalance / minimalRecordResolution + totalImbalance) * minimalRecordResolution - 1;
    let rate = await convRatesInst.getRate(token, currentBlock, false, qty);
    Helper.assertGreater(rate, 0, 'expected rate > 0, received: ' + rate);

    //high get rate should get 0.
    rate = await convRatesInst.getRate(token, currentBlock, false, qty + 1);
    Helper.assertEqual(rate, 0, 'unexpected rate');
  });

  it('should verify record imbalance reverted when not from reserve address.', async function () {
    //try record imbalance
    await expectRevert(
      convRatesInst.recordImbalance(tokens[5], 30, currentBlock, currentBlock, {from: alerter}),
      'sender is not reserve'
    );

    //now the same from reserve address
    await convRatesInst.recordImbalance(tokens[5], 30, currentBlock, currentBlock, {from: reserveAddress});
  });

  it('should verify set step functions for qty reverted when more them max steps (10).', async function () {
    let index = 1;

    qtyBuyStepX = [15, 30, 70, 100, 200, 500, 700, 900, 1100, 1500];
    qtyBuyStepY = [8, 30, 70, 100, 120, 150, 170, 190, 210, 250];
    qtySellStepX = [15, 30, 70, 100, 200, 500, 700, 900, 1100, 1500];
    qtySellStepY = [8, 30, 70, 100, 120, 150, 170, 190, 210, 250];

    await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {
      from: operator
    });

    //set illegal number of steps for buy
    qtyBuyStepX.push(1600);
    qtyBuyStepY.push(350);
    await expectRevert(
      convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {
        from: operator
      }),
      'too big xBuy'
    );

    //remove extra step and see success.
    qtyBuyStepY.pop();
    qtyBuyStepX.pop();
    await convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {
      from: operator
    });

    //set illegal number of steps for sell
    qtySellStepX.push(1600);
    qtySellStepY.push(350);
    await expectRevert(
      convRatesInst.setQtyStepFunction(tokens[index], qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {
        from: operator
      }),
      'too big xSell'
    );
  });

  it('should verify getCompactData reverted when token not listed.', async function () {
    let someToken = await TestToken.new('testing', 'tst9', 15);
    await expectRevert(convRatesInst.getCompactData(someToken.address), 'unlisted token');

    //add token and see enable success
    await convRatesInst.addToken(someToken.address);
    compactResArr = await convRatesInst.getCompactData(someToken.address);
  });

  it('should verify add bps reverts for illegal values', async function () {
    let minLegalBps = -100 * 100;
    let maxLegalBps = new BN(10).pow(new BN(11));
    let legalRate = new BN(10).pow(new BN(25));
    let illegalRate = legalRate.add(new BN(1));
    let illegalBpsMinSide = minLegalBps - 1 * 1;
    let illegalBpsMaxSide = maxLegalBps.add(new BN(1));

    await convRatesInst.mockAddBps(legalRate, minLegalBps);
    await convRatesInst.mockAddBps(legalRate, maxLegalBps);

    //see fail with illegal rate
    await expectRevert(convRatesInst.mockAddBps(illegalRate, minLegalBps), 'invalid rate');
    //see fail with illegal bps (min side)
    await expectRevert(convRatesInst.mockAddBps(legalRate, illegalBpsMinSide), 'bps too low');
    //see fail with illegal bps (max side)
    await expectRevert(convRatesInst.mockAddBps(legalRate, illegalBpsMaxSide), 'bps too high');
  });

  describe('benchmark gas', accounts => {
    let token;
    let tokenDecimals = new BN(6);
    let gasTracker;

    let minimalRecordResolution = new BN(10000);
    let maxPerBlockImbalance = new BN(120000000000);
    let maxTotalImbalance = new BN(140000000000);

    let qtyBuyStepX = [
      10000000000,
      20000000000,
      30000000000,
      40000000000,
      50000000000,
      60000000000,
      70000000000,
      80000000000,
      90000000000,
      90001000000
    ];
    let qtyBuyStepY = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12];
    let qtySellStepX = [
      10001000000,
      20001000000,
      30001000000,
      40001000000,
      50001000000,
      60001000000,
      70001000000,
      80001000000,
      90001000000,
      90002000000
    ];
    let qtySellStepY = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12];
    let imbalanceBuyStepX = [0];
    let imbalanceBuyStepY = [0];
    let imbalanceSellStepX = [0];
    let imbalanceSellStepY = [0];

    let baseBuyRate = new BN('354257815000000000000000');
    let baseSellRate = new BN('2808998681277');

    before('init account', async () => {
      token = await TestToken.new('test', 'tst', tokenDecimals);
      gasTracker = await ReserveGasProfiler.new();
    });

    it('gas query rate', async () => {
      let rateContract = await ConversionRates.new(admin);
      await rateContract.addToken(token.address);
      await rateContract.setTokenControlInfo(
        token.address,
        minimalRecordResolution,
        maxPerBlockImbalance,
        maxTotalImbalance
      );
      await rateContract.enableTokenTrade(token.address);
      await rateContract.addOperator(operator);

      await rateContract.setQtyStepFunction(token.address, qtyBuyStepX, qtyBuyStepY, qtySellStepX, qtySellStepY, {
        from: operator
      });
      await rateContract.setImbalanceStepFunction(
        token.address,
        imbalanceBuyStepX,
        imbalanceBuyStepY,
        imbalanceSellStepX,
        imbalanceSellStepY,
        {from: operator}
      );

      compactBuyArr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      let buys = [Helper.bytesToHex(compactBuyArr)];
      let sells = [Helper.bytesToHex(compactBuyArr)];
      let indices = [0];
      let currentBlock = await Helper.getCurrentBlock();
      await rateContract.setBaseRate(
        [token.address],
        [baseBuyRate],
        [baseSellRate],
        buys,
        sells,
        currentBlock,
        indices,
        {
          from: operator
        }
      );
      // setup reserve
      let reserve = await KyberReserve.new(
        gasTracker.address, // network
        rateContract.address,
        admin
      );
      token.transfer(reserve.address, new BN(10).pow(new BN(20)));
      await reserve.approveWithdrawAddress(token.address, reserve.address, true, {from: admin});
      await rateContract.setReserveAddress(reserve.address);

      let stepIndex = 0;
      let srcQty = Helper.calcSrcQty(new BN(qtyBuyStepX[stepIndex]), ethDecimals, tokenDecimals, baseBuyRate);
      let result = await gasTracker.profileReserveRate(reserve.address, Helper.ethAddress, token.address, srcQty);
      console.log(`getConversionRate gas used: ${result.toNumber()} stepIndex=${stepIndex}`);

      stepIndex = 9;
      srcQty = Helper.calcSrcQty(new BN(qtyBuyStepX[stepIndex]), ethDecimals, tokenDecimals, baseBuyRate);
      result = await gasTracker.profileReserveRate(reserve.address, Helper.ethAddress, token.address, srcQty);
      console.log(`getConversionRate gas used: ${result.toNumber()} stepIndex=${stepIndex}`);
    });
  });
});

function convertRateToPricingRate (baseRate) {
  // conversion rate in pricing is in precision units (10 ** 18) so
  // rate 1 to 50 is 50 * 10 ** 18
  // rate 50 to 1 is 1 / 50 * 10 ** 18
  return new BN(10).pow(new BN(18)).mul(new BN(baseRate));
}

function getExtraBpsForBuyQuantity (qty) {
  for (let i = 0; i < qtyBuyStepX.length; i++) {
    if (qty <= qtyBuyStepX[i]) return qtyBuyStepY[i];
  }
  return qtyBuyStepY[qtyBuyStepY.length - 1];
}

function getExtraBpsForSellQuantity (qty) {
  for (let i = 0; i < qtySellStepX.length; i++) {
    if (qty <= qtySellStepX[i]) return qtySellStepY[i];
  }
  return qtySellStepY[qtySellStepY.length - 1];
}
