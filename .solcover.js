module.exports = {
  mocha: {
    timeout: 150000
  },
  providerOptions: {
    default_balance_ether: 100000000000000,
    total_accounts: 20,
  },
  skipFiles: [
    'sol4/mock/',
    'sol4/bridgeReserves/dutchX/mock/',
    'sol4/previousVersions/',
    'sol5/bridges/bancor/mock/',
    'sol5/bridges/eth2dai/mock/',
    'sol5/utils/',
    'sol6/bridgeReserve/uniswap/mock/',
    'sol6/mock/'
  ],
  istanbulReporter: ['html', 'json']
};
