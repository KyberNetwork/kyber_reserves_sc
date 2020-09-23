const fs = require('fs');
const path = require('path');
const cp = require('cp');

const storageArtifactsPath = path.join(__dirname, '.tempCoverageArtifacts');
const coverageArtifactsPath = path.join(__dirname, '.coverage_artifacts');

function cpStorageToCoverage(config) {
  if (!fs.existsSync(storageArtifactsPath)) return;
  const storageFiles = fs.readdirSync(storageArtifactsPath);
  if (storageFiles) {
    storageFiles.forEach((file) => {
      cp.sync(path.join(storageArtifactsPath, file), path.join(coverageArtifactsPath, file), (err) => {
        if (err) throw err;
        console.log(`Copying ` + file);
      });
    });
  }
}

module.exports = {
  mocha: {
    timeout: 150000
  },
  providerOptions: {
    default_balance_ether: 100000000000000,
    total_accounts: 20,
  },
  skipFiles: ['previousVersions/', 'mock/', 'zeppelin/'],
  istanbulReporter: ['html', 'json'],
  onCompileComplete: cpStorageToCoverage
};
