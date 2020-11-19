usePlugin("@nomiclabs/buidler-ethers");
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, './apr_input.json');
const pricingSettingsPath = path.join(__dirname, './liquidity_settings.json');
const configParams = JSON.parse(fs.readFileSync(configPath, 'utf8'));

let deployerAddress;
let tokenAddress;
let whitelistedAddresses;
let reserveAdmin;
let reserveOperators;
let pricingAdmin;
let outputFilename;
const ethAddress = `0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`;

task("deployApr", "deploys an Automated Price Reserve")
  .addParam("networkAddress", "KyberNetwork contract address")
  .addOptionalParam("deployToken", "Set to true to include token deployment. Default: false", false, types.boolean)
  .setAction(async(taskArgs) => {
    const networkAddress = taskArgs.networkAddress;
    parseInput(configParams);
    const [deployer] = await ethers.getSigners();
    deployerAddress = await deployer.getAddress();

    if (taskArgs.deployToken) {
      tokenAddress = "";
      const Token = await ethers.getContractFactory("Token");
      for (let i = 0; i < 1; i++) {
        let tokenInstance = await Token.deploy(`Test Token`, `TST${i}`, 18);
        await tokenInstance.deployed();
        tokenAddress = tokenInstance.address;
      }
    }

    // contract deployment
    console.log("deploying pricing contract...");
    const LCR = await ethers.getContractFactory("LiquidityConversionRates");
    const lcr = await LCR.deploy(deployerAddress, tokenAddress);
    await lcr.deployed();
    console.log(`pricing address: ${lcr.address}`);

    console.log("deploying reserve contract...");
    const KyberReserve = await ethers.getContractFactory("KyberReserve");
    const kyberReserve = await KyberReserve.deploy(networkAddress, lcr.address, deployerAddress);
    await kyberReserve.deployed();
    console.log(`reserve address: ${kyberReserve.address}`);

    exportAddresses(kyberReserve.address, lcr.address);

    // whitelist addresses
    await whitelistAddressesInReserve(kyberReserve);

    // transfer reserve permissions
    await setReservePermissions(kyberReserve);

    // set reserve address
    console.log("set reserve address in pricing");
    await lcr.setReserveAddress(kyberReserve.address);

    // transfer admin rights to pricing Admin
    console.log(`transfer admin rights to ${pricingAdmin}`)
    await lcr.transferAdminQuickly(pricingAdmin);
    console.log('APR setup completed!');
    process.exit(0);
});

function parseInput(jsonInput) {
  tokenAddress = jsonInput["tokenAddress"];
  whitelistedAddresses = jsonInput["whitelistedAddresses"];
  reserveAdmin = jsonInput["reserveAdmin"];
  pricingAdmin = jsonInput["pricingAdmin"];
  reserveOperators = jsonInput["reserveOperators"];
  outputFilename = jsonInput["outputFilename"];
};
 
//operator can withdraw both ETH and Token
async function whitelistAddressesInReserve(kyberReserve) {
  console.log("whitelisting addresses...");
  for (let whitelistAddress of whitelistedAddresses) {
    await kyberReserve.approveWithdrawAddress(
      tokenAddress,
      whitelistAddress,
      true
    );
    await kyberReserve.approveWithdrawAddress(
      ethAddress,
      whitelistAddress,
      true
    );
  }
};

// by default, adds operators and admin as alerters
async function setReservePermissions(reserve) {
  for (let operator of reserveOperators) {
      console.log(`setting reserve operator: ${operator}`);
      await reserve.addOperator(operator);
      await reserve.addAlerter(operator);
  }

  console.log(`transferring reserve rights to admin ${reserveAdmin}`);
  await reserve.addAlerter(reserveAdmin);
  await reserve.transferAdminQuickly(reserveAdmin);
}

function exportAddresses(reserveAddress, pricingAddress) {
  let dictOutput = {};
  dictOutput['reserve'] = reserveAddress;
  dictOutput['pricing'] = pricingAddress;
  let json = JSON.stringify(dictOutput, null, 2);
  fs.writeFileSync(path.join(__dirname, outputFilename), json);

  // save reserve address in pricing settings
  let pricingParams = JSON.parse(fs.readFileSync(pricingSettingsPath, 'utf8'));
  pricingParams['reserve'] = reserveAddress;
  json = JSON.stringify(pricingParams, null, 2);
  fs.writeFileSync(pricingSettingsPath, json);
}
