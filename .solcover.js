const fs = require('fs');
const path = require('path');
const cp = require('cp');

const storageArtifactsPath = path.join(__dirname, '.tempCoverageArtifacts');
const coverageArtifactsPath = path.join(__dirname, '.coverage_artifacts');

function cpStorageToCoverageAndBack(config) {
  if (!fs.existsSync(storageArtifactsPath)) {
    console.log("Creating storage file...");
    fs.mkdirSync(storageArtifactsPath);
  }

  const storageFiles = fs.readdirSync(storageArtifactsPath);

  if (storageFiles) {
    storageFiles.forEach((file) => {
      cp.sync(path.join(storageArtifactsPath, file), path.join(coverageArtifactsPath, file), (err) => {
        if (err) throw err;
        console.log(`Copying ` + file);
      });
    });
  }

  const coverageFiles = fs.readdirSync(coverageArtifactsPath);

  if (coverageFiles) {
    console.log(`Copying files from .coverage_artifacts to .tempCoverageArtifacts...`);
    coverageFiles.forEach((file) => {
      let tempFile = fs.readFileSync(path.join(coverageArtifactsPath, file), 'utf8');
      if (tempFile.length > 0) {
        cp.sync(path.join(coverageArtifactsPath, file), path.join(storageArtifactsPath, file), (err) => {
          if (err) throw err;
          console.log(`Copying ` + file);
        });
      }
    });
  }
}

module.exports = {
  providerOptions: {
    default_balance_ether: 100000000000000,
    total_accounts: 20,
  },
  skipFiles: ['previousVersions/', 'mock/', 'zeppelin/'],
  istanbulReporter: ['html', 'json'],
  onCompileComplete: cpStorageToCoverageAndBack
};
