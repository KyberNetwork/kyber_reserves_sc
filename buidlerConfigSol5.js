usePlugin("@nomiclabs/buidler-truffle5");
usePlugin("@nomiclabs/buidler-web3");
usePlugin('solidity-coverage');

module.exports = {
  solc: {
    version: "0.5.11",
    optimizer: require("./solcOptimiserSettings.js")
  },

  paths: {
    sources: "./contracts/sol5",
    tests: "./test/sol5"
  }
};
