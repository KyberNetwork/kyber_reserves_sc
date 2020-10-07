const artifacts = require('@nomiclabs/buidler').artifacts
const BN = web3.utils.BN;

const KyberFprReserveV2 = artifacts.require("KyberFprReserveV2.sol");
const ConversionRateEnhancedSteps = artifacts.require("ConversionRateEnhancedSteps.sol");
const WrapConversionRateEnhancedSteps = artifacts.require("WrapConversionRateEnhancedSteps.sol");
const SetStepFunctionWrapper = artifacts.require("SetStepFunctionWrapper.sol");

let reserve;
let reserveAddr;
let conversionRate;
let conversionRateAddr;
let wrapper;
let wrapperAddr;
let stepWrapper;
let stepWrapperAddr;

// Staging data
let networkAddr = "0x9CB7bB6D4795A281860b9Bfb7B1441361Cc9A794";
let admin = "0xf3d872b9e8d314820dc8e99dafbe1a3feedc27d5";
let weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
let maxGasPrice = new BN(250).mul(new BN(10).pow(new BN(9)));
let doRateValidation = true;
let deployer;

async function main() {
  const accounts = await web3.eth.getAccounts();
  deployer = accounts[0];
  console.log(`Deployer address at ${deployer}`);

  gasPrice = new BN(100).mul(new BN(10).pow(new BN(9)));
  console.log(`Sending transactions with gas price: ${gasPrice.toString(10)} (${gasPrice.div(new BN(10).pow(new BN(9))).toString(10)} gweis)`);

  if (conversionRateAddr == undefined) {
    conversionRate = await ConversionRateEnhancedSteps.new(deployer, { gasPrice: gasPrice });
    console.log(`Deploy conversionRate at ${conversionRate.address}`);
  } else {
    conversionRate = await ConversionRateEnhancedSteps.at(conversionRateAddr);
    console.log(`Interact with conversionRate at ${conversionRateAddr}`);
  }

  if (wrapperAddr == undefined) {
    wrapper = await WrapConversionRateEnhancedSteps.new(conversionRate.address, {gasPrice:gasPrice});
    console.log(`deploy rate wrapper at ${wrapper.address}`);
    wrapperAddr = wrapper.address;
  } else {
    wrapper = await WrapConversionRateEnhancedSteps.at(wrapperAddr);
    console.log(`Interact with rate wrapper at ${wrapperAddr}`);
  }

  if (stepWrapperAddr == undefined) {
    stepWrapper = await SetStepFunctionWrapper.new(admin, admin, {gasPrice: gasPrice});
    console.log(`deploy step wrapper at ${stepWrapper.address}`);
    stepWrapperAddr = stepWrapper.address;
  } else {
    stepWrapper = await SetStepFunctionWrapper.at(stepWrapperAddr);
    console.log(`Interact with step wrapper at ${stepWrapperAddr}`);
  }

  if (reserveAddr == undefined) {
    reserve = await KyberFprReserveV2.new(
      networkAddr, 
      conversionRate.address, 
      weth,
      maxGasPrice,
      doRateValidation,
      deployer,
      { gasPrice: gasPrice }
    );
    console.log(`Deploy reserve at ${reserve.address}`);
    reserveAddr = reserve.address;
  } else {
    reserve = await KyberFprReserveV2.at(reserveAddr);
    console.log(`Interact with reserve at ${reserveAddr}`);
  }

  await conversionRate.addOperator(stepWrapper.address, { gasPrice: gasPrice });
  console.log(`Add operator: ${stepWrapper.address}`)

  console.log(`Set reserve address to conversion rate`)
  await conversionRate.setReserveAddress(reserve.address, { gasPrice: gasPrice });

  if (await conversionRate.admin() != wrapperAddr) {
    console.log(`set conversionRate admin to wrapper contract`);
    await conversionRate.transferAdmin(wrapperAddr, {gasPrice: gasPrice});
    await wrapper.claimWrappedContractAdmin({gasPrice: gasPrice});
  }

  if (await wrapper.admin() != admin) {
    console.log(`Transfer rate wrapper's admin quickly to ${admin}`);
    await wrapper.transferAdminQuickly(admin, {gasPrice: gasPrice});
  }

  if (reserve.admin() != admin) {
    console.log(`Transfer reserve's admin quickly to ${admin}`)
    await reserve.transferAdminQuickly(admin, { gasPrice: gasPrice });
  }
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
