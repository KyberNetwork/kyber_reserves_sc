const artifacts = require('@nomiclabs/buidler').artifacts
const BN = web3.utils.BN;

const UniswapCurveBridgeReserve = artifacts.require("KyberUniswapCurveReserve.sol");

let reserve;
let reserveAddr;

// Staging data
let networkAddr = "0x9CB7bB6D4795A281860b9Bfb7B1441361Cc9A794";
let uniswapRouter = "0x7a250d5630b4cf539739df2c5dacb4c659f2488d";
let curveUSD = "0xA5407eAE9Ba41422680e2e00537571bcC53efBfD";
let curveBTC = "0x93054188d876f558f4a66B2EF1d97d16eDf0895B";
let admin = "0xBE2F0354D970265BFc36D383af77F72736b81B54";
let usdt = "0xdac17f958d2ee523a2206206994597c13d831ec7";
let usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
let dai = "0x6b175474e89094c44da98b954eedeac495271d0f";
let susd = "0x57ab1ec28d129707052df4df418d58a2d46d5f51";
let wbtc = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
let renbtc = "0xeb4c2781e4eba804ce9a9803c67d0893436bb27d";
let deployer;

async function main() {
  const accounts = await web3.eth.getAccounts();
  deployer = accounts[0];
  console.log(`Deployer address at ${deployer}`);

  gasPrice = new BN(50).mul(new BN(10).pow(new BN(9)));
  console.log(`Sending transactions with gas price: ${gasPrice.toString(10)} (${gasPrice.div(new BN(10).pow(new BN(9))).toString(10)} gweis)`);

  if (reserveAddr == undefined) {
    reserve = await UniswapCurveBridgeReserve.new(
      uniswapRouter,
      networkAddr,
      { gasPrice: gasPrice }
    );
    console.log(`Deploy reserve at ${reserve.address}`);
    reserveAddr = reserve.address;
  } else {
    reserve = await UniswapCurveBridgeReserve.at(reserveAddr);
    console.log(`Interact with reserve at ${reserveAddr}`);
  }

  gasPrice = new BN(55).mul(new BN(10).pow(new BN(9)));

  await reserve.addOperator(deployer, { gasPrice: gasPrice });

  // List stable tokens
  await reserve.listToken(
    dai,
    curveUSD,
    0,
    [1, 2],
    { gasPrice: gasPrice }
  );
  await reserve.listToken(
    usdc,
    curveUSD,
    1,
    [0, 2],
    { gasPrice: gasPrice }
  );
  await reserve.listToken(
    usdt,
    curveUSD,
    2,
    [0, 1],
    { gasPrice: gasPrice }
  );
  await reserve.listToken(
    susd,
    curveUSD,
    3,
    [0,1,2],
    { gasPrice: gasPrice }
  );
  await reserve.listToken(
    renbtc,
    curveBTC,
    0,
    [1],
    { gasPrice: gasPrice }
  );
  await reserve.listToken(
    wbtc,
    curveBTC,
    1,
    [],
    { gasPrice: gasPrice }
  );
  await reserve.addOperator(admin, { gasPrice: gasPrice });
  await reserve.transferAdminQuickly(admin, { gasPrice: gasPrice });
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
