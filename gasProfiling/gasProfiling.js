const Token = artifacts.require('Token.sol');
const ReserveGasProfiler = artifacts.require('ReserveGasProfiler.sol');
const fs = require("fs");
const path = require('path');
const localDeployer = require("../deployment/localSetup");
const { ethAddress, precisionUnits, MAX_ALLOWANCE } = require("../test/helper");
const Helper = require("../test/helper");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const BN = web3.utils.BN;

let token;
let tokenPrecision;

let tokens;
let initialEth = precisionUnits.mul(new BN(250));

let fprPricing;
let fprReserve;
let enhancedFprPricing;
let enhancedFprReserve;
let aprPricing;
let aprReserve;

let srcQty;
let t2eGas;
let e2tGas;

let reserveGasProfiler;

let fullGasReport = {};

contract("GasProfiler", function(accounts) {
  before("deploy the relevant reserves and tokens", async() => {
    user = accounts[0];
    admin = accounts[1];
    operator = accounts[2];
    network = {address: user};
    reserveGasProfiler = await ReserveGasProfiler.new();
    token = await Token.new("SrcToken", "SRC", 8);
    tokenPrecision = new BN(10).pow(new BN(await token.decimals()));

    tokens = [token];

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
    let compactBuyHex = [Helper.bytesToHex([8])];
    let compactSellHex = [Helper.bytesToHex([5])];
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

    // enchanced FPR Setup
    enhancedFprPricing = await localDeployer.setupEnhancedPricing(
      tokens,
      15,
      precisionUnits,
      precisionUnits,
      admin,
      operator
    );

    // create and point to enhanced FPR reserve
    enhancedFprReserve = await localDeployer.setupFprReserve(
      network,
      tokens,
      accounts[0],
      enhancedFprPricing.address,
      initialEth,
      admin,
      operator
    );

    await enhancedFprPricing.setReserveAddress(enhancedFprReserve.address, {from: admin});

    // APR Setup
    aprPricing = await localDeployer.setupAprPricing(token, 1.0, initialEth, admin, operator);
    aprReserve = await localDeployer.setupAprReserve(network, token, accounts[1], aprPricing.address, initialEth, admin, operator);
    await aprPricing.setReserveAddress(aprReserve.address, {from: admin});
  });

  describe("FPR Gas Profiling", async() => {
    it("prints gas costs for FPR getRate function", async() => {
      let result = [];
      for (let steps = 1; steps <= 10; steps ++) {
        srcQty = new BN(steps * 2);
        t2eGas = await reserveGasProfiler.profilePricingRate(
          fprPricing.address,
          token.address,
          false,
          srcQty.mul(tokenPrecision)
        );
  
        e2tGas = await reserveGasProfiler.profilePricingRate(
          fprPricing.address,
          token.address,
          true,
          srcQty.mul(precisionUnits)
        );
  
        result.push({
          numSteps: steps,
          t2e: t2eGas.toNumber(),
          e2t: e2tGas.toNumber()
        });
      }
      console.log("### FPR getRate ###");
      logRates(result, 'FPR');
    });

    it("prints gas costs for FPR doTrade() function", async() => {
      let currentBlock = await web3.eth.getBlockNumber();
      let rate;
      let tx;
      await token.approve(fprReserve.address, MAX_ALLOWANCE);
      let srcQty = new BN(2);

      rate = await fprReserve.getConversionRate(
        token.address,
        ethAddress,
        srcQty.mul(tokenPrecision),
        currentBlock
      );
      tx = await fprReserve.trade(
        token.address,
        srcQty.mul(tokenPrecision),
        ethAddress,
        user,
        rate,
        true
      );
      console.log(`FPR t2e trade: ${tx.receipt.gasUsed}`);
      fullGasReport['FPR']['trade']['t2e'] = tx.receipt.gasUsed;

      rate = await fprReserve.getConversionRate(
        ethAddress,
        token.address,
        srcQty.mul(precisionUnits),
        currentBlock
      );
      tx = await fprReserve.trade(
        ethAddress,
        srcQty.mul(precisionUnits),
        token.address,
        user,
        rate,
        true,
        {value: srcQty.mul(precisionUnits)}
      );
      console.log(`FPR e2t trade: ${tx.receipt.gasUsed}`);
      fullGasReport['FPR']['trade']['e2t'] = tx.receipt.gasUsed;
    });
  });

  describe("enhanced FPR Gas Profiling", async() => {
    it("prints gas costs for enhanced FPR getRate function", async() => {
      let result = [];
      for (let steps = 1; steps <= 15; steps ++) {
        srcQty = new BN(steps * 2).mul(new BN(998)).div(new BN(1000));
        t2eGas = await reserveGasProfiler.profilePricingRate(
          enhancedFprPricing.address,
          token.address,
          false,
          srcQty.mul(tokenPrecision)
        );
  
        e2tGas = await reserveGasProfiler.profilePricingRate(
          enhancedFprPricing.address,
          token.address,
          true,
          srcQty.mul(precisionUnits)
        );
  
        result.push({
          numSteps: steps,
          t2e: t2eGas.toNumber(),
          e2t: e2tGas.toNumber()
        });
      }
      console.log("### Enhanced FPR getRate ###");
      logRates(result, 'EFPR');
    });

    it("prints gas costs for enhanced FPR doTrade() function", async() => {
      let currentBlock = await web3.eth.getBlockNumber();
      let rate;
      let tx;
      await token.approve(enhancedFprReserve.address, MAX_ALLOWANCE);
      let srcQty = new BN(2);

      rate = await enhancedFprReserve.getConversionRate(
        token.address,
        ethAddress,
        srcQty.mul(tokenPrecision),
        currentBlock
      );
      tx = await enhancedFprReserve.trade(
        token.address,
        srcQty.mul(tokenPrecision),
        ethAddress,
        user,
        rate,
        true
      );
      console.log(`enhanced FPR t2e trade: ${tx.receipt.gasUsed}`);
      fullGasReport['EFPR']['trade']['t2e'] = tx.receipt.gasUsed;

      rate = await enhancedFprReserve.getConversionRate(
        ethAddress,
        token.address,
        srcQty.mul(precisionUnits),
        currentBlock
      );
      tx = await enhancedFprReserve.trade(
        ethAddress,
        srcQty.mul(precisionUnits),
        token.address,
        user,
        rate,
        true,
        {value: srcQty.mul(precisionUnits)}
      );
      console.log(`enhanced FPR e2t trade: ${tx.receipt.gasUsed}`);
      fullGasReport['EFPR']['trade']['e2t'] = tx.receipt.gasUsed;
    });
  });

  describe("APR Gas Profiling", async() => {
    it("prints gas costs for APR getRate function", async() => {
      let result = [];
      for (let steps = 1; steps <= 5; steps ++) {
        srcQty = new BN(steps);
        t2eGas = await reserveGasProfiler.profilePricingRate(
          aprPricing.address,
          token.address,
          false,
          srcQty.mul(tokenPrecision)
        );
  
        e2tGas = await reserveGasProfiler.profilePricingRate(
          aprPricing.address,
          token.address,
          true,
          srcQty.mul(precisionUnits)
        );
  
        result.push({
          srcQty: srcQty.toNumber(),
          t2e: t2eGas.toNumber(),
          e2t: e2tGas.toNumber()
        });
      }
      console.log("### APR getRate ###");
      logRates(result, 'APR');
    });

    it("prints gas costs for APR doTrade() function", async() => {
      let currentBlock = await web3.eth.getBlockNumber();
      let rate;
      let tx;
      let srcQty = new BN(2);
      await token.approve(aprReserve.address, MAX_ALLOWANCE);

      rate = await aprReserve.getConversionRate(
        token.address,
        ethAddress,
        srcQty.mul(tokenPrecision),
        currentBlock
      );
      tx = await aprReserve.trade(
        token.address,
        srcQty.mul(tokenPrecision),
        ethAddress,
        user,
        rate,
        true
      );
      console.log(`APR t2e trade: ${tx.receipt.gasUsed}`);
      fullGasReport['APR']['trade']['t2e'] = tx.receipt.gasUsed;

      rate = await aprReserve.getConversionRate(
        ethAddress,
        token.address,
        srcQty.mul(precisionUnits),
        currentBlock
      );
      tx = await aprReserve.trade(
        ethAddress,
        srcQty.mul(precisionUnits),
        token.address,
        user,
        rate,
        true,
        {value: srcQty.mul(precisionUnits)}
      );
      console.log(`APR e2t trade: ${tx.receipt.gasUsed}`);
      fullGasReport['APR']['trade']['e2t'] = tx.receipt.gasUsed;
    });
  });
  
  describe("Report Export", async() => {
    it("should export gas report", async() => {
      writeReport();
    });
  });
});

function logRates(result, reserveName) {
  console.table(result);

  fullGasReport[reserveName] = {
    'getRate': result,
    'trade': {}
  };
}

async function writeReport() {
  let jsonContent = JSON.stringify(fullGasReport, null, '\t');
  let reportDir = path.join(__dirname, '../report');
  let reportFile = path.join(__dirname, `../report/gasProfiles.json`);
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, {recursive: true});
  }
  fs.writeFile(reportFile, jsonContent, 'utf8', function (err) {
    if (err) {
      console.log('An error occured while writing JSON Object to File.');
      return console.log(err);
    } else {
      console.log("exported report!");
    }
  });
}
