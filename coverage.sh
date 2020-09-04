#!/bin/sh
yarn buidler clean
rm -r ./.coverageArtifacts

# Coverage sequence must be sol4 -> sol6 -> sol5
yarn buidler coverage --config ./buidlerConfigSol4.js --testfiles "test/sol4/*.js" --solcoverjs ".solcover.js"
yarn buidler coverage --config ./buidlerConfigSol6.js --testfiles "test/sol6/*.js" --solcoverjs ".solcover.js"
yarn buidler coverage --config ./buidlerConfigSol5.js --testfiles "test/sol5/*.js" --solcoverjs ".solcover.js"
