const Token = artifacts.require('Token.sol');
const ReserveGasProfiler = artifacts.require('ReserveGasProfiler.sol');
const localDeployer = require("../deployment/localSetup");
const { ethAddress, precisionUnits, MAX_ALLOWANCE } = require("../test/helper");
const Helper = require("../test/helper");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const BN = web3.utils.BN;

let srcToken;
let srcPrecision;
let destToken;
let destPrecision;

let tokens;
let initialEth = precisionUnits.mul(new BN(250));

let fprPricing;
let fprReserve;
let srcAprPricing;
let srcAprReserve;
let destAprPricing;
let destAprReserve;

let srcQty;
let t2eGasNon18;
let t2eGas18;
let e2tGasNon18;
let e2tGas18;

let reserveGasProfiler;

contract("GasProfiler", function(accounts) {
  before("deploy the relevant reserves and tokens", async() => {
    user = accounts[0];
    admin = accounts[1];
    operator = accounts[2];
    network = {address: user};
    reserveGasProfiler = await ReserveGasProfiler.new();
    srcToken = await Token.new("SrcToken", "SRC", 8);
    srcPrecision = new BN(10).pow(new BN(await srcToken.decimals()));
    destToken = await Token.new("DestToken", "DEST", 18);
    destPrecision = new BN(10).pow(new BN(await destToken.decimals()));

    tokens = [srcToken, destToken];

    // FPR Setup
    fprPricing = await localDeployer.setupFprPricing(
      tokens,
      10,
      10,
      precisionUnits,
      precisionUnits,
      admin,
      operator
    );

    // set compact data
    let compactBuyHex = [Helper.bytesToHex([8, -4])];
    let compactSellHex = [Helper.bytesToHex([5, -3])];
    let indices = [0];
    Helper.assertEqual(indices.length, compactBuyHex.length, "bad buys array size");
    Helper.assertEqual(indices.length, compactSellHex.length, "bad sells array size");

    await fprPricing.setCompactData(
      compactBuyHex,
      compactSellHex,
      await web3.eth.getBlockNumber(),
      indices,
      {from: operator}
    );

    // create and point to FPR reserve
    fprReserve = await localDeployer.setupFprReserve(
      network,
      tokens,
      accounts[0],
      fprPricing.address,
      initialEth,
      admin,
      operator
    );

    await fprPricing.setReserveAddress(fprReserve.address, {from: admin});

    // APRs Setup
    srcAprPricing = await localDeployer.setupAprPricing(srcToken, 1.0, initialEth, admin, operator);
    destAprPricing = await localDeployer.setupAprPricing(destToken, 1.0, initialEth, admin, operator);
    srcAprReserve = await localDeployer.setupAprReserve(network, srcToken, accounts[1], srcAprPricing.address, initialEth, admin, operator);
    destAprReserve = await localDeployer.setupAprReserve(network, destToken, accounts[1], destAprPricing.address, initialEth, admin, operator);
    await srcAprPricing.setReserveAddress(srcAprReserve.address, {from: admin});
    await destAprPricing.setReserveAddress(destAprReserve.address, {from: admin});
  });

  describe("FPR Gas Profiling", async() => {
    it("prints gas costs for FPR getRate function", async() => {
      let result = [];
      for (let steps = 1; steps <= 8; steps ++) {
        srcQty = new BN(steps * 2);
        t2eGasNon18 = await reserveGasProfiler.profilePricingRate(
          fprPricing.address,
          srcToken.address,
          false,
          srcQty.mul(srcPrecision)
        );
  
        e2tGasNon18 = await reserveGasProfiler.profilePricingRate(
          fprPricing.address,
          srcToken.address,
          true,
          srcQty.mul(precisionUnits)
        );
  
        t2eGas18 = await reserveGasProfiler.profilePricingRate(
          fprPricing.address,
          destToken.address,
          false,
          srcQty.mul(destPrecision)
        );
  
        e2tGas18 = await reserveGasProfiler.profilePricingRate(
          fprPricing.address,
          destToken.address,
          true,
          srcQty.mul(precisionUnits)
        );
  
        result.push({
          t2eNon18: t2eGasNon18.toNumber(),
          e2tNon18: e2tGasNon18.toNumber(),
          t2e18: t2eGas18.toNumber(),
          e2t18: e2tGas18.toNumber()
        });
      }
      console.log("### FPR getRate ###");
      console.table(result);
    });

    it("prints gas costs for FPR doTrade() function", async() => {
      let currentBlock = await web3.eth.getBlockNumber();
      let rate;
      let tx;
      await srcToken.approve(fprReserve.address, MAX_ALLOWANCE);
      await destToken.approve(fprReserve.address, MAX_ALLOWANCE);
      let srcQty = new BN(2);

      rate = await fprReserve.getConversionRate(
        srcToken.address,
        ethAddress,
        srcQty.mul(srcPrecision),
        currentBlock
      );
      tx = await fprReserve.trade(
        srcToken.address,
        srcQty.mul(srcPrecision),
        ethAddress,
        user,
        rate,
        true
      );
      console.log(`FPR t2e (non-18 decimals token): ${tx.receipt.gasUsed}`);

      rate = await fprReserve.getConversionRate(
        ethAddress,
        srcToken.address,
        srcQty.mul(precisionUnits),
        currentBlock
      );
      tx = await fprReserve.trade(
        ethAddress,
        srcQty.mul(precisionUnits),
        srcToken.address,
        user,
        rate,
        true,
        {value: srcQty.mul(precisionUnits)}
      );
      console.log(`FPR e2t (non-18 decimals token): ${tx.receipt.gasUsed}`);
        
      rate = await fprReserve.getConversionRate(
        destToken.address,
        ethAddress,
        srcQty.mul(destPrecision),
        currentBlock
      );
      tx = await fprReserve.trade(
        destToken.address,
        srcQty.mul(destPrecision),
        ethAddress,
        user,
        rate,
        true
      );
      console.log(`FPR t2e (18 decimals token): ${tx.receipt.gasUsed}`);
      
      rate = await fprReserve.getConversionRate(
        ethAddress,
        destToken.address,
        srcQty.mul(precisionUnits),
        currentBlock
      );
      tx = await fprReserve.trade(
        ethAddress,
        srcQty.mul(precisionUnits),
        destToken.address,
        user,
        rate,
        true,
        {value: srcQty.mul(precisionUnits)}
      );
      console.log(`e2t (18 decimals token): ${tx.receipt.gasUsed}`);
    });
  });

  describe("APR Gas Profiling", async() => {
    it("prints gas costs for APR getRate function", async() => {
      let result = [];
      for (let steps = 1; steps <= 5; steps ++) {
        srcQty = new BN(steps);
        t2eGasNon18 = await reserveGasProfiler.profilePricingRate(
          srcAprPricing.address,
          srcToken.address,
          false,
          srcQty.mul(srcPrecision)
        );
  
        e2tGasNon18 = await reserveGasProfiler.profilePricingRate(
          srcAprPricing.address,
          srcToken.address,
          true,
          srcQty.mul(precisionUnits)
        );
  
        t2eGas18 = await reserveGasProfiler.profilePricingRate(
          destAprPricing.address,
          destToken.address,
          false,
          srcQty.mul(destPrecision)
        );
  
        e2tGas18 = await reserveGasProfiler.profilePricingRate(
          destAprPricing.address,
          destToken.address,
          true,
          srcQty.mul(precisionUnits)
        );
  
        result.push({
          t2eNon18: t2eGasNon18.toNumber(),
          e2tNon18: e2tGasNon18.toNumber(),
          t2e18: t2eGas18.toNumber(),
          e2t18: e2tGas18.toNumber()
        });
      }
      console.log("### APR getRate ###");
      console.table(result);
    });
  });

  it("prints gas costs for APR doTrade() function", async() => {
    let currentBlock = await web3.eth.getBlockNumber();
    let rate;
    let tx;
    let srcQty = new BN(2);
    await srcToken.approve(srcAprReserve.address, MAX_ALLOWANCE);
    await destToken.approve(destAprReserve.address, MAX_ALLOWANCE);

    rate = await srcAprReserve.getConversionRate(
      srcToken.address,
      ethAddress,
      srcQty.mul(srcPrecision),
      currentBlock
    );
    tx = await srcAprReserve.trade(
      srcToken.address,
      srcQty.mul(srcPrecision),
      ethAddress,
      user,
      rate,
      true
    );
    console.log(`APR t2e (non-18 decimals token): ${tx.receipt.gasUsed}`);

    rate = await srcAprReserve.getConversionRate(
      ethAddress,
      srcToken.address,
      srcQty.mul(precisionUnits),
      currentBlock
    );
    tx = await srcAprReserve.trade(
      ethAddress,
      srcQty.mul(precisionUnits),
      srcToken.address,
      user,
      rate,
      true,
      {value: srcQty.mul(precisionUnits)}
    );
    console.log(`APR e2t (non-18 decimals token): ${tx.receipt.gasUsed}`);
      
    rate = await destAprReserve.getConversionRate(
      destToken.address,
      ethAddress,
      srcQty.mul(destPrecision),
      currentBlock
    );
    tx = await destAprReserve.trade(
      destToken.address,
      srcQty.mul(destPrecision),
      ethAddress,
      user,
      rate,
      true
    );
    console.log(`APR t2e (18 decimals token): ${tx.receipt.gasUsed}`);
    
    rate = await destAprReserve.getConversionRate(
      ethAddress,
      destToken.address,
      srcQty.mul(precisionUnits),
      currentBlock
    );
    tx = await destAprReserve.trade(
      ethAddress,
      srcQty.mul(precisionUnits),
      destToken.address,
      user,
      rate,
      true,
      {value: srcQty.mul(precisionUnits)}
    );
    console.log(`APR e2t (18 decimals token): ${tx.receipt.gasUsed}`);
  });
});
