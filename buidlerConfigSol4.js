usePlugin("@nomiclabs/buidler-truffle5");
usePlugin("@nomiclabs/buidler-web3");
usePlugin('solidity-coverage');

module.exports = {
  solc: {
    version: "0.4.18",
    optimizer: require("./solcOptimiserSettings.js")
  },

  paths: {
    sources: "./contracts/sol4",
    tests: "./test/sol4"
  }
};
