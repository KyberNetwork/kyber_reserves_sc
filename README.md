## Introduction
[![built-with openzeppelin](https://img.shields.io/badge/built%20with-OpenZeppelin-3677FF)](https://docs.openzeppelin.com/)
[![Build Status](https://api.travis-ci.com/KyberNetwork/kyber_reserves_sc.svg?branch=master&status=passed)](https://travis-ci.com/github/KyberNetwork/kyber_reserves_sc)

This repository contains the kyber reserve smart contracts.
For more details, please visit the reserves section of our [developer portal](https://developer.kyber.network/docs/Reserves-Intro/)

## Package Manager
We use `yarn` as the package manager. You may use `npm` and `npx` instead, but commands in bash scripts may have to be changed accordingly.

## Setup
1. Clone this repo
2. `yarn install`

## Compilation with Hardhat
Run `yarn compile`

## Contract Deployment / Interactions

For interactions or contract deployments on public testnets / mainnet, create a `.env` file specifying your private key and infura api key, with the following format:

```
PRIVATE_KEY=0x****************************************************************
INFURA_API_KEY=********************************
```

### Deploy conversionRateEnhancedSteps2.sol
```shell

```

## Testing with Hardhat
1. If contracts have not been compiled, run `yarn compile`. This step can be skipped subsequently.
2. Run `yarn test`
3. Use `./tst.sh -f` for running a specific test file.

### Example Commands
- `yarn test` (Runs all tests)
- `./tst.sh -f ./test/sol4/kyberReserve.js` (Test only kyberReserve.js)

### Example
`yarn hardhat test --no-compile ./test/sol6/sanityRatesGasPrice.js`

## Coverage with `solidity-coverage`
1. Run `yarn coverage` for coverage on all sol files
2. Run `yarn coverage4` for coverage on sol4 files
3. Run `yarn coverage5` for coverage on sol5 files
4. Run `yarn coverage6` for coverage on sol6 files
