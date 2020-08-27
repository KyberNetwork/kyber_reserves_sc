const Token = artifacts.require('Token.sol');
const ReserveGasProfiler = artifacts.require('ReserveGasProfiler.sol');
const localDeployer = require("../deployment/localSetup");
const { ethAddress, precisionUnits } = require("../test/helper");
const { web3 } = require("@openzeppelin/test-helpers/src/setup");
const BN = web3.utils.BN;

let srcToken;
let destToken;
let reserves;
let reservesArray;
let reserveGasProfiler;

contract("GasProfiler", function(accounts) {
  before("deploy the relevant reserves and tokens", async() => {
    admin = accounts[1];
    operator = accounts[2];
    reserveGasProfiler = await ReserveGasProfiler.new();
    srcToken = await Token.new("SrcToken", "SRC", 8);
    destToken = await Token.new("DestToken", "DEST", 18);
    reserves = await localDeployer.setupReserves(
      {address: admin},
      [srcToken, destToken],
      1,
      0,
      1,
      accounts,
      admin,
      operator
    );

    reservesArray = reserves['FPR'].concat(reserves['APR']);
  });

  it("prints gas costs for getRate function", async() => {
    for (let reserve of reservesArray) {
      console.log(`##### ${reserve.name}: getRate() #####`);
      let result = [];
      for (let steps = 0; steps <= 4; steps ++) {
        let t2eSrcQty = new BN(steps * 2000);
        let e2tSrcQty = precisionUnits.mul(new BN(steps));

        let t2eGasNon18 = await reserveGasProfiler.profilePricingRate(
          reserve.pricingAddress,
          srcToken.address,
          false,
          t2eSrcQty
        );

        let e2tGasNon18 = await reserveGasProfiler.profilePricingRate(
          reserve.pricingAddress,
          srcToken.address,
          true,
          e2tSrcQty
        );

        let t2eGas18 = await reserveGasProfiler.profilePricingRate(
          reserve.pricingAddress,
          destToken.address,
          false,
          t2eSrcQty
        );

        let e2tGas18 = await reserveGasProfiler.profilePricingRate(
          reserve.pricingAddress,
          destToken.address,
          true,
          e2tSrcQty
        );

        result.push({
          t2eNon18: t2eGasNon18.toNumber(),
          e2tNon18: e2tGasNon18.toNumber(),
          t2e18: t2eGas18.toNumber(),
          e2t18: e2tGas18.toNumber()
        });
      }
      console.table(result);
    }
  });

  // it("prints gas costs for doTrade() function", async() => {
  //   for (let reserve of reservesArray) {
  //     await srcToken.approve(reserve.address, 99999, {from: admin});
  //     console.log(`##### ${reserve.name}: trade() #####`);
  //     let result = [];
  //     for (let srcQty = 0; srcQty <= 10000; srcQty += 2000) {
  //       let rate = await reserve.instance.getConversionRate(
  //         srcToken.address,
  //         ethAddress,
  //         srcQty,
  //         await web3.eth.getBlockNumber()
  //       );

  //       let tx = await reserve.instance.trade(
  //         srcToken.address,
  //         srcQty,
  //         ethAddress,
  //         admin,
  //         rate,
  //         false,
  //         {from: admin}
  //       );
  //       console.log(tx);
  //       // result.push({srcQty: srcQty, gas: gasUsed});
  //     }
  //     console.table(result);
  //   }
  // });
});
