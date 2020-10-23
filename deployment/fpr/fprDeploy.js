require("@nomiclabs/hardhat-ethers");
const fs = require('fs');
const path = require('path');
const configPath = path.join(__dirname, './fpr_input.json');
const configParams = JSON.parse(fs.readFileSync(configPath, 'utf8'));

let deployerAddress;
let tokensInfo;
let whitelistedAddresses;
let tokenAddresses;
let reservePermissions;
let pricingPermissions;
let rateValidityLengthInBlocks;
let outputFilename;

task("deployFpr", "deploys a Fed Price Reserve")
  .addParam("networkAddress", "KyberNetwork contract address")
  .addOptionalParam("deployTokens", "Set to true to include token deployments. Default: false", false, types.boolean)
  .setAction(async(taskArgs) => {
    const networkAddress = taskArgs.networkAddress;
    parseInput(configParams);
    const [deployer] = await ethers.getSigners();
    deployerAddress = await deployer.getAddress();

    if (taskArgs.deployTokens) {
      tokenAddresses = [];
      tokensInfo = {};
      const Token = await ethers.getContractFactory("Token");
      for (let i = 0; i < 3; i++) {
        let tokenInstance = await Token.deploy(`Test Token`, `TST${i}`, 18);
        await tokenInstance.deployed();
        tokenAddresses.push(tokenInstance.address);
        tokensInfo[`TST${i}`] = {
          address: tokenInstance.address,
          minimalRecordResolution: "1000000000000000",
          maxPerBlockImbalance: "775091297865175138304",
          maxTotalImbalance: "27119978426708960215042212"
        }
      }
    }

    // contract deployment
    console.log("deploying pricing contract...");
    const ConversionRates = await ethers.getContractFactory("ConversionRates");
    const conversionRates = await ConversionRates.deploy(deployerAddress);
    await conversionRates.deployed();
    console.log(`pricing address: ${conversionRates.address}`);

    console.log("deploying reserve contract...");
    const KyberReserve = await ethers.getContractFactory("KyberReserve");
    const kyberReserve = await KyberReserve.deploy(networkAddress, conversionRates.address, deployerAddress);
    await kyberReserve.deployed();
    console.log(`reserve address: ${kyberReserve.address}`);

    exportAddresses(kyberReserve.address, conversionRates.address);

    // whitelist addresses
    await whitelistAddressesInReserve(kyberReserve);

    // transfer reserve permissions
    await setPermissions(kyberReserve, reservePermissions);

    // set reserve address
    console.log("set reserve address in pricing");
    await conversionRates.setReserveAddress(kyberReserve.address);

    // setup pricing contract
    await setupPricingContract(conversionRates);
    console.log('FPR setup completed!');
    process.exit(0);
});

function parseInput(jsonInput) {
  tokensInfo = jsonInput["tokens"];
  tokenAddresses = (Object.values(tokensInfo)).map(token => token.address);
  whitelistedAddresses = jsonInput["whitelistedAddresses"];
  reservePermissions = jsonInput["permissions"]["reserve"];
  pricingPermissions = jsonInput["permissions"]["pricing"];
  rateValidityLengthInBlocks = jsonInput["rateValidityLengthInBlocks"];
  outputFilename = jsonInput["outputFilename"];
};
      
async function whitelistAddressesInReserve(kyberReserve) {
  console.log("whitelisting addresses...");
  for (let whitelistAddress of whitelistedAddresses) {
    for (let token of tokenAddresses) {
      await kyberReserve.approveWithdrawAddress(
        token,
        whitelistAddress,
        true
      );
    }
  }
};

// by default, adds operators and admin as alerters
async function setPermissions(contract, permissions) {
  for (let operator of permissions.operators) {
      console.log(`setting operator: ${operator}`);
      await contract.addOperator(operator);
      await contract.addAlerter(operator);
  }

  let admin = permissions.admin;
  console.log(`transferring rights to admin ${admin}`);
  await contract.addAlerter(admin);
  await contract.transferAdminQuickly(admin);
}

async function setupPricingContract(pricingContract) {
  // add tokens
  for (let tokenAddress of tokenAddresses) {
    console.log(`adding token ${tokenAddress} to pricing`)
    await pricingContract.addToken(tokenAddress);
  }

  // set rate validity
  console.log(`setting rate validity length`);
  await pricingContract.setValidRateDurationInBlocks(rateValidityLengthInBlocks);

  // set token control info
  for (let tokenInfo of Object.values(tokensInfo)) {
    console.log(`setting control info for ${tokenInfo.address}`);
    await pricingContract.setTokenControlInfo(
      tokenInfo.address,
      tokenInfo.minimalRecordResolution,
      tokenInfo.maxPerBlockImbalance,
      tokenInfo.maxTotalImbalance
    );
  }

  await pricingContract.addOperator(deployerAddress);
  for (let tokenAddress of tokenAddresses) {
    console.log(`setting qty step function to 0 for ${tokenAddress}`);
    await pricingContract.setQtyStepFunction(
        tokenAddress,
        [0],
        [0],
        [0],
        [0]
    );

    console.log(`setting imbalance step function to 0 for ${tokenAddress} `);
    await pricingContract.setImbalanceStepFunction(
        tokenAddress,
        [0],
        [0],
        [0],
        [0]
    );
    
    // enable token trade
    console.log(`enabling ${tokenAddress} trade`);
    await pricingContract.enableTokenTrade(tokenAddress);
  }
  await pricingContract.removeOperator(deployerAddress);

  await setPermissions(pricingContract, pricingPermissions);
}

function exportAddresses(reserveAddress, pricingAddress) {
    let dictOutput = {};
    dictOutput['reserve'] = reserveAddress;
    dictOutput['pricing'] = pricingAddress;
    const json = JSON.stringify(dictOutput, null, 2);
    fs.writeFileSync(path.join(__dirname, outputFilename), json);
}
