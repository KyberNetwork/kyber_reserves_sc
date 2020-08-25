## Introduction
This repository contains the kyber reserve smart contracts.
For more details, please visit the reserves section of our [developer portal](https://developer.kyber.network/docs/Reserves-Intro/)

## Package Manager
We use `yarn` as the package manager. You may use `npm` and `npx` instead, but commands in bash scripts may have to be changed accordingly.

## Setup
1. Clone this repo
2. `yarn`

## Compilation with Buidler
1. `yarn compile` to compile contracts for all solidity versions.
2. `yarn compileSol6` to compile only sol6 contracts

## Testing with Buidler
1. If contracts have not been compiled, run `yarn compile`. This step can be skipped subsequently.
2. Run `yarn test`
3. Use `./tst.sh -f` for running a specific test file.

### Example Commands
- `yarn test` (Runs all tests)
- `./tst.sh -f ./test/sol4/kyberReserve.js` (Test only kyberReserve.js)

### Example
`yarn buidler test --no-compile ./test/sol6/sanityRatesGasPrice.js`

## Coverage with `buidler-coverage`
1. Run `yarn coverage`
2. Use `./coverage.sh -f` for running a specific test file.

### Example Commands
- `yarn coverage` (Runs coverage for all applicable files)
`./coverage.sh -f ./test/sol6/sanityRatesGasPrice.js` (Coverage for only sanityRatesGasPrice.js)
