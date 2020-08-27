const BN = web3.utils.BN;
const Helper = require("../test/helper");
const Reserve = artifacts.require("KyberReserve.sol");
const ConversionRates = artifacts.require("ConversionRates.sol");
const LiquidityConversionRates = artifacts.require("LiquidityConversionRates.sol");
const StrictValidatingReserve = artifacts.require("StrictValidatingReserve.sol");
const TempBank = artifacts.require("TempBank.sol");

const {precisionUnits}  = require("../test/helper");
const type_fpr = 1;
const type_apr = 2;

require("chai")
  .use(require("chai-as-promised"))
  .use(require("chai-bn")(BN))
  .should();

module.exports.setupReserves = setupReserves;
async function setupReserves
  (network, tokens, numFpr, numEnhancedFpr, numApr, accounts, admin, operator) {
    let result = {
        'FPR': [],
        'FPR2': [],
        'APR': []
    };

    let i;
    let ethSenderIndex = 1;
    // 200 ETH
    let ethInit = (new BN(10)).pow(new BN(19)).mul(new BN(20));

    // setup FPR
    for(i = 0; i < numFpr; i++) {
      tokensPerEther = precisionUnits.mul(new BN((i + 1) * 30));
      ethersPerToken = precisionUnits.div(new BN((i + 1) * 30));

      let pricing = await setupFprPricing(tokens, 5, 5, tokensPerEther, ethersPerToken, admin, operator);
      let reserve = await setupFprReserve(network, tokens, accounts[ethSenderIndex++], pricing.address, ethInit, admin, operator);
      await pricing.setReserveAddress(reserve.address, {from: admin});

      result['FPR'].push({
        'address': reserve.address,
        'instance': reserve,
        'type': type_fpr,
        'pricingInstance': pricing,
        'pricingAddress': pricing.address,
        'name': 'FPR' + i
      });
    }

    // setup APR
    for (i = 0; i < numApr; i++) {
      initPrice = 1 / ((i + 1) * 10);
      let token = tokens[i % tokens.length];
      let pricing = await setupAprPricing(token, initPrice, ethInit, admin, operator);
      let reserve = await setupAprReserve(network, token, accounts[ethSenderIndex++], pricing.address, ethInit, admin, operator);
      await pricing.setReserveAddress(reserve.address, {from: admin});

      result['APR'].push({
        'address': reserve.address,
        'instance': reserve,
        'type': type_apr,
        'pricingInstance': pricing,
        'pricingAddress': pricing.address,
        'name': 'APR' + i
      });
    }

    return result;
}

// step functions
const qtyBuyStepX = [0, 2000, 4000, 6000, 8000, 10000];
const qtyBuyStepY = [0, -1, -2, -3, -4, -5];
const imbalanceBuyStepX = [0, -2000, -4000, -6000, -8000, -10000];
const imbalanceBuyStepY = [0,  -1, -2, -3, -4, -5];
const qtySellStepX = [0, 2000, 4000, 6000, 8000, 10000];
const qtySellStepY = [0, -1, -2, -3, -4, -5];
const imbalanceSellStepX = [0, -2000, -4000, -6000, -8000, -10000];
const imbalanceSellStepY = [0, -1, -2, -3, -4, -5];

const validRateDurationInBlocks = (new BN(9)).pow(new BN(21)); // some big number
const minimalRecordResolution = 1000000; //low resolution so I don't lose too much data. then easier to compare calculated imbalance values.
const maxPerBlockImbalance = precisionUnits.mul(new BN(10000)); // some big number
const maxTotalImbalance = maxPerBlockImbalance.mul(new BN(3));

module.exports.setupFprPricing = setupFprPricing;
async function setupFprPricing (tokens, numImbalanceSteps, numQtySteps, tokensPerEther, ethersPerToken, admin, operator) {
  let block = await web3.eth.getBlockNumber();
  let pricing = await ConversionRates.new(admin);
  await pricing.addOperator(operator, {from: admin})
  await pricing.addAlerter(operator, {from: admin})

  await pricing.setValidRateDurationInBlocks(validRateDurationInBlocks, {from: admin});

  let buys = [];
  let sells = [];
  let indices = [];

  for (let j = 0; j < tokens.length; ++j) {
    let token = tokens[j];
    let tokenAddress = token.address;

    // pricing setup
    await pricing.addToken(token.address, {from: admin});
    await pricing.setTokenControlInfo(token.address, minimalRecordResolution, maxPerBlockImbalance, maxTotalImbalance, {from: admin});
    await pricing.enableTokenTrade(token.address, {from: admin});

    //update rates array
    let baseBuyRate = [];
    let baseSellRate = [];
    baseBuyRate.push(tokensPerEther);
    baseSellRate.push(ethersPerToken);

    buys.length = sells.length = indices.length = 0;

    tokenAdd = [tokenAddress];
    await pricing.setBaseRate(tokenAdd, baseBuyRate, baseSellRate, buys, sells, block, indices, {from: operator});

    let buyX = qtyBuyStepX;
    let buyY = qtyBuyStepY;
    let sellX = qtySellStepX;
    let sellY = qtySellStepY;

    if (numQtySteps == 0) numQtySteps = 1;
    buyX.length = buyY.length = sellX.length = sellY.length = numQtySteps;
    await pricing.setQtyStepFunction(tokenAddress, buyX, buyY, sellX, sellY, {from:operator});

    buyX = imbalanceBuyStepX;
    buyY = imbalanceBuyStepY;
    sellX = imbalanceSellStepX;
    sellY = imbalanceSellStepY;
    if (numImbalanceSteps == 0) numImbalanceSteps = 1;
    buyX.length = buyY.length = sellX.length = sellY.length = numImbalanceSteps;

    await pricing.setImbalanceStepFunction(tokenAddress, buyX, buyY, sellX, sellY, {from:operator});
  }

  compactBuyArr = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let compactBuyHex = Helper.bytesToHex(compactBuyArr);
  buys.push(compactBuyHex);

  compactSellArr =  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  let compactSellHex = Helper.bytesToHex(compactSellArr);
  sells.push(compactSellHex);

  indices[0] = 0;

  Helper.assertEqual(indices.length, sells.length, "bad sells array size");
  Helper.assertEqual(indices.length, buys.length, "bad buys array size");

  await pricing.setCompactData(buys, sells, block, indices, {from: operator});
  return pricing;
}

module.exports.setupFprReserve = setupFprReserve;
async function setupFprReserve(network, tokens, ethSender, pricingAdd, ethInit, admin, operator) {
  let reserve;

  // setup reserve
  reserve = await Reserve.new(network.address, pricingAdd, admin);
  await reserve.addOperator(operator, {from: admin});
  await reserve.addAlerter(operator, {from: admin});

  // set reserve balance. 10**18 wei ether + per token 10**18 wei ether value according to base rate.
  await Helper.sendEtherWithPromise(ethSender, reserve.address, ethInit);
  
  for (let j = 0; j < tokens.length; ++j) {
    let token = tokens[j];

    //reserve related setup
    await reserve.approveWithdrawAddress(token.address, ethSender, true, {from: admin});

    let initialTokenAmount = new BN(200000).mul(new BN(10).pow(new BN(await token.decimals())));
    await token.transfer(reserve.address, initialTokenAmount);
    await Helper.assertSameTokenBalance(reserve.address, token, initialTokenAmount);
  }

  return reserve;
}

let feePercent = 0.1;
const maxCapBuyInEth = 10;
const maxCapSellInEth = 10;
const pMinRatio = 0.25;
const pMaxRatio = 4.0;

//default value
const formulaPrecisionBits = 40;
const formulaPrecision = new BN(2).pow(new BN(formulaPrecisionBits));

module.exports.setupAprPricing = setupAprPricing;
async function setupAprPricing(token, initPrice, ethBal, admin, operator) {
    const r = Math.log(1 / pMinRatio) / (ethBal.div(precisionUnits));
    let pricing = await LiquidityConversionRates.new(admin, token.address);
    await pricing.addOperator(operator, {from: admin});
    await pricing.addAlerter(operator, {from: admin});

    const baseNumber = 10 ** 9;
    const pMin = initPrice * pMinRatio;
    const pMax = initPrice * pMaxRatio;

    const feeInBps = feePercent * 100;
    const rInFp = new BN(r * baseNumber).mul(formulaPrecision).div(new BN(baseNumber));
    const pMinInFp = new BN(pMin * baseNumber).mul(formulaPrecision).div(new BN(baseNumber));
    let maxCapBuyInWei = new BN(maxCapBuyInEth).mul(precisionUnits);
    let maxCapSellInWei = new BN(maxCapSellInEth).mul(precisionUnits);
    const maxSellRateInPrecision = new BN(pMax * baseNumber).mul(precisionUnits).div(new BN(baseNumber));
    const minSellRateInPrecision = new BN(pMin * baseNumber).mul(precisionUnits).div(new BN(baseNumber));

    await pricing.setLiquidityParams(
        rInFp,
        pMinInFp,
        formulaPrecisionBits,
        maxCapBuyInWei,
        maxCapSellInWei,
        feeInBps,
        maxSellRateInPrecision,
        minSellRateInPrecision,
        {from: admin}
    );
    return pricing;
}

module.exports.setupAprReserve = setupAprReserve;
async function setupAprReserve (network, token, ethSender, pricingAdd, ethInit, admin, operator) {
    // setup reserve
    let bank = await TempBank.new();
    let reserve = await StrictValidatingReserve.new(network.address, pricingAdd, admin);
    await reserve.setBank(bank.address);
    await reserve.addOperator(operator, {from: admin});
    await reserve.addAlerter(operator, {from: admin});

    //set reserve balance. 10**18 wei ether + per token 10**18 wei ether value according to base rate.
    await Helper.sendEtherWithPromise(ethSender, reserve.address, ethInit);
    await Helper.assertSameEtherBalance(reserve.address, ethInit);
    //reserve related setup
    await reserve.approveWithdrawAddress(token.address, ethSender, true, {from: admin});

    let initialTokenAmount = new BN(200000).mul(new BN(10).pow(new BN(await token.decimals())));
    await token.transfer(reserve.address, initialTokenAmount);
    await Helper.assertSameTokenBalance(reserve.address, token, initialTokenAmount);

    return reserve;
}