const KyberFprReserveV2 = artifacts.require('KyberFprReserveV2.sol');
const ConversionRateEnhancedSteps2 = artifacts.require('ConversionRateEnhancedSteps2.sol');
const WrapConversionRateEnhancedSteps2 = artifacts.require('WrapConversionRateEnhancedSteps2.sol');

const BN = web3.utils.BN;

let reserve;
let reserveAddr;
let conversionRate;
let conversionRateAddr;
let wrapper;
let wrapperAddr;

let wethAddr = '0xc778417e063141139fce010982780140aa0cd5ab';
let doRateValidation = true;
let maxGasPrice = new BN(10).pow(new BN(11)); // 100 wgwei
let networkAddr = '0x920b322d4b8bab34fb6233646f5c87f87e79952b';
let admin = '0xf3D872b9E8d314820dc8E99DAfBe1A3FeEDc27D5';
let deployer;

async function main () {
  const accounts = await web3.eth.getAccounts();
  deployer = accounts[0];

  console.log(`deployer address at ${deployer}`);

  gasPrice = new BN(2).mul(new BN(10).pow(new BN(9))); // 2 gwei

  if (conversionRateAddr == undefined) {
    conversionRate = await ConversionRateEnhancedSteps2.new(deployer, {gasPrice: gasPrice});
    console.log(`deploy conversionRate at ${conversionRate.address}`);
  } else {
    conversionRate = await ConversionRateEnhancedSteps2.at(conversionRateAddr);
  }

  if (reserveAddr == undefined) {
    reserve = await KyberFprReserveV2.new(networkAddr, conversionRate.address, wethAddr,
      maxGasPrice, doRateValidation, deployer, {gasPrice: gasPrice});
    console.log(`deploy reserve at ${reserve.address}`);
    reserveAddr = reserve.address;
  } else {
    reserve = await KyberFprReserveV2.at(reserveAddr);
  }

  if (wrapperAddr == undefined) {
    wrapper = await WrapConversionRateEnhancedSteps2.new(conversionRate.address, {gasPrice: gasPrice});
    console.log(`deploy wrapper at ${wrapper.address}`);
    wrapperAddr = wrapper.address;
  } else {
    wrapper = await WrapConversionRateEnhancedSteps2.at(wrapperAddr);
  }

  if((await conversionRate.reserveContract()) != reserveAddr) {
    console.log(`set reserveContract in conversionRate`);
    await conversionRate.setReserveAddress(reserveAddr);
  }

  if ((await conversionRate.admin()) != wrapperAddr) {
    console.log(`set conversionRate admin to wrapper contract`);
    await conversionRate.transferAdmin(wrapperAddr, {gasPrice: gasPrice});
    await wrapper.claimWrappedContractAdmin({gasPrice: gasPrice});
  }

  // if ((await reserve.admin()) != admin) {
  //   console.log(`set new admin to reserve ${admin}`);
  //   await reserve.transferAdminQuickly(admin, {gasPrice: gasPrice});
  // }

  if ((await wrapper.admin()) != admin) {
    console.log(`set new admin to wrapper ${admin}`);
    await wrapper.transferAdminQuickly(admin, {gasPrice: gasPrice});
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
