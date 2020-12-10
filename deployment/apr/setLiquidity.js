require("@nomiclabs/hardhat-ethers");
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const configPath = path.join(__dirname, './liquidity_settings.json');
const configParams = JSON.parse(fs.readFileSync(configPath, 'utf8'));

let networkName;

let reserveAddress;
let pricingAddress;
let tokenAddress;

let reserve;
let pricing;
let pricingAdmin;

let tokenPriceInEth;
let ethBalance;
let tokenBalance;
let liqRate;
let minAllowablePrice;
let maxAllowablePrice;
let maxTxBuyAmtEth;
let maxTxSellAmtEth;
let feePercent;
const formulaPrecision = 40;

task("setLiquidityParams", "(re-)sets the liquidity settings of an APR")
  .addOptionalParam("r", "reserve address", "read from liquidity_settings.json")
  .addOptionalParam("a", "automatically fetch price via CoinGecko.", true, types.boolean)
  .setAction(async({r, a}) => {
    networkName = await ethers.provider.getNetwork();
    if (networkName.chainId == 1) {
      networkName = '';
    } else {
      networkName = networkName.name + '.';
    }

    reserveAddress = (r == "read from liquidity_settings.json") ?
      configParams["reserve"] :
      r;

    const [userAccount] = await ethers.getSigners();
    await instantiateContracts();
    if (a) {
      await fetchTokenPrice();
    }
    parseInput(configParams);
    console.log("Reading reserve balances...");
    await fetchBalances();
    let liqParams = calcParams();
    let warnings = validateParams();
    if ((await userAccount.getAddress() == pricingAdmin) && warnings.length == 0) {
      console.log("Setting price...");
      await pricing.setLiquidittyParams(
        liqParams['rInFp'],
        liqParams['pMinInFp'],
        liqParams['numFpBits'],
        liqParams['maxCapBuyInWei'],
        liqParams['maxCapSellInWei'],
        liqParams['feeInBps'],
        liqParams['maxTokenToEthRateInPrecision'],
        liqParams['minTokenToEthRateInPrecision']
      );
      printParams(liqParams, false, warnings);
    } else {
      printParams(liqParams, true, warnings);
    }
});

async function instantiateContracts() {
  reserve = await ethers.getContractAt("KyberReserve", reserveAddress);
  pricingAddress = await reserve.conversionRatesContract();
  pricing = await ethers.getContractAt("LiquidityConversionRates", pricingAddress);
  pricingAdmin = await pricing.admin();
  tokenAddress = await pricing.token();
}

async function fetchTokenPrice() {
  let priceRequest = await fetch(
    `https://api.coingecko.com/api/v3/simple/token_price/ethereum?contract_addresses=${tokenAddress}&vs_currencies=eth`
    );
  let result = Object.values(await priceRequest.json());
  if (!result.length) {
    console.log(`Unable to get price via CoinGecko, using price in liquidity_settings.json`);
    tokenPriceInEth = configParams["tokenPriceInEth"];
    console.log(`token price: ${tokenPriceInEth}`);
  } else {
    tokenPriceInEth = result[0].eth;
    console.log(`token price via CoinGecko API: ${tokenPriceInEth}`);
  }
}

function parseInput(jsonInput) {
  tokenPriceInEth = tokenPriceInEth ?
    tokenPriceInEth :
    jsonInput["tokenPriceInEth"];

  minAllowablePrice = jsonInput["minAllowablePrice"] ?
    jsonInput["minAllowablePrice"] :
    0.5;
  
  maxAllowablePrice = jsonInput["maxAllowablePrice"] ?
    jsonInput["maxAllowablePrice"] :
    2.0;

  maxTxBuyAmtEth = jsonInput["maxTxBuyAmtEth"] ?
    jsonInput["maxTxBuyAmtEth"] :
    10;

  maxTxSellAmtEth = jsonInput["maxTxSellAmtEth"] ?
    jsonInput["maxTxSellAmtEth"] :
    10;

  feePercent = jsonInput["feePercent"] ?
    jsonInput["feePercent"] :
    0.05;
};

async function fetchBalances() {
  let token = await ethers.getContractAt("IERC20Ext", tokenAddress);
  let tokenDecimals = await token.decimals();

  ethBalance = await ethers.provider.getBalance(reserveAddress) / 10 ** 18;
  liqRate = Math.log(1 / minAllowablePrice) / ethBalance;
  try {
    const tokenWallet = await reserve.tokenWallet(tokenAddress);
    tokenBalance = await token.balanceOf(tokenWallet) / 10 ** tokenDecimals;
  } catch(e) {
    tokenBalance = await token.balanceOf(reserveAddress) / 10 ** tokenDecimals;
  }
}

function calcParams() {
  let result = {};
  const maxSupportPrice = maxAllowablePrice * tokenPriceInEth;
  const minSupportPrice = minAllowablePrice * tokenPriceInEth;

  result['rInFp'] = Math.floor(liqRate * (2 ** formulaPrecision));
  result['pMinInFp'] = Math.floor(minSupportPrice * (2 ** formulaPrecision));
  result['numFpBits'] = formulaPrecision;
  result['maxCapBuyInWei'] = maxTxBuyAmtEth * (10 ** 18);
  result['maxCapSellInWei'] = maxTxSellAmtEth * (10 ** 18);
  result['feeInBps'] = feePercent * 100;
  result['maxTokenToEthRateInPrecision'] = maxSupportPrice * (10 ** 18);
  result['minTokenToEthRateInPrecision'] = minSupportPrice * (10 ** 18);
  return result;
}

function validateParams() {
  let warnings = [];
  const minSupportPrice = tokenPriceInEth / Math.exp(liqRate * ethBalance);
  const actualMinAllowablePrice = minSupportPrice / tokenPriceInEth;
  let actualMaxAllowablePrice = 0;
  
  if ((liqRate * tokenPriceInEth * tokenBalance) < 1) {
    const maxSupportedPrice = tokenPriceInEth / (1 - liqRate * tokenPriceInEth * tokenBalance);
    actualMaxAllowablePrice = maxSupportedPrice / tokenPriceInEth;
  }
  
  if (actualMinAllowablePrice > minAllowablePrice) {
    warnings.push(`WARNING: actual minAllowablePrice ${actualMinAllowablePrice} > configured minAllowablePrice ${minAllowablePrice}`);
  }
  
  if (actualMaxAllowablePrice === 0) {
    warnings.push('WARNING: actual maxAllowablePrice is big and cannot be calculated. Consider reducing token amount in reserve to avoid this.');
  } else if (actualMaxAllowablePrice < maxAllowablePrice) {
    warnings.push(`WARNING: actual maxAllowablePrice ${actualMaxAllowablePrice.toFixed(3)} < configured maxAllowablePrice ${maxAllowablePrice}`);
  }
  
  const expectedInitialPrice = tokenPriceInEth * minAllowablePrice * Math.exp(liqRate * ethBalance);
  const diff_percent = (expectedInitialPrice === tokenPriceInEth) ? 0 : (Math.abs(expectedInitialPrice - tokenPriceInEth) / expectedInitialPrice) * 100.0;
  if (diff_percent > 1.0) {
    warnings.push(`WARNING: expectedInitialPrice ${expectedInitialPrice.toFixed(5)} differs from initial_price ${tokenPriceInEth.toFixed(5)} by ${diff_percent}%`);
  }
  return warnings;
}

function printParams(liqParams, printEtherscanDetails, warnings) {
  console.log(`\n`);
  console.log('#######################');
  console.log('### COMPUTED PARAMS ###');
  console.log('#######################');
  console.log(`liquidity rate: ${liqRate}`);
  console.log(`ether reserve balance: ${ethBalance}`);
  console.log(`token reserve balance: ${tokenBalance}`);
  console.log(`token price in ETH: ${tokenPriceInEth}`);
  console.log(`min allowable price: ${minAllowablePrice}`);
  console.log(`max allowable price: ${maxAllowablePrice}`);
  console.log(`max tx buy amt (in ETH): ${maxTxBuyAmtEth}`);
  console.log(`max tx sell amt (in ETH): ${maxTxSellAmtEth}`);
  console.log(`fee percent: ${feePercent}`);

  console.log(`\n`);

  console.log('########################');
  console.log('### LIQUIDITY PARAMS ###');
  console.log('########################');
  console.log(`\_rInFp: ${liqParams['rInFp']}`);
  console.log(`\_pMinInFp: ${liqParams['pMinInFp']}`);
  console.log(`\_numFpBits: ${liqParams['numFpBits']}`);
  console.log(`\_maxCapBuyInWei: ${liqParams['maxCapBuyInWei']}`);
  console.log(`\_maxCapSellInWei: ${liqParams['maxCapSellInWei']}`);
  console.log(`\_feeInBps: ${liqParams['feeInBps']}`);
  console.log(`\_maxTokenToEthRateInPrecision: ${liqParams['maxTokenToEthRateInPrecision']}`);
  console.log(`\_minTokenToEthRateInPrecision: ${liqParams['minTokenToEthRateInPrecision']}`);
  console.log(`\n`);

  if (printEtherscanDetails) {
    console.log(`Call setLiquidityParams with above LIQUIDITY PARAMS of ${pricingAddress} using wallet ${pricingAdmin}: `);
    console.log(`https://${networkName}etherscan.io/address/${pricingAddress}#writeContract`);
    console.log(`\n`);
  }

  warnings.map((warning) => { console.log(warning); });
}
