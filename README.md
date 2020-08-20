## Introduction
This repository contains the kyber reserve smart contracts.
For more details, please visit the reserves section of our [developer portal](https://developer.kyber.network/docs/Reserves-Intro/)

## Setup
1. Clone this repo
2. `npm ci`

## Compilation with Buidler
1. `./cmp.sh` to compile contracts for all solidity versions.
2. `./cmpSol6.sh` to compile only sol6 contracts

## Testing with Buidler
1. If contracts have not been compiled, run `./cmp.sh`. This step can be skipped subsequently.
2. Run `./tst.sh`
3. Use `-f` for running a specific test file.

### Example Commands
- `./tst.sh` (Run only sol6 tests)
- `./tst.sh -f ./test/sol4/kyberReserve.js` (Test only kyberReserve.js)

### Example
`npx buidler test --no-compile ./test/sol6/sanityRatesGasPrice.js`

## Coverage with `buidler-coverage`
1. Run `./coverage.sh`
2. Use `-f` for running a specific test file.

### Example Commands
`./coverage.sh -f ./test/sol6/sanityRatesGasPrice.js` (Coverage for only sanityRatesGasPrice.js)
