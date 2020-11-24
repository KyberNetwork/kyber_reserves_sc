#!/bin/sh
while getopts "v:" arg; do
  case $arg in
    v) VERSION=$OPTARG;;
  esac
done

yarn hardhat clean

if [ "$VERSION" == 'sol4' ]; then
  echo "Running sol4 coverage..."
<<<<<<< HEAD
  yarn hardhat coverage --testfiles "test/sol4/*.js" --solcoverjs ".solcover.js"
=======
  yarn buidler coverage --config ./buidlerConfigSol4.js --testfiles "test/sol4/" --solcoverjs ".solcover.js"
>>>>>>> update coverage.sh
elif [ "$VERSION" == 'sol5' ]; then
  echo "Running sol5 coverage..."
<<<<<<< HEAD
  yarn hardhat coverage --testfiles "test/sol5/*.js" --solcoverjs ".solcover.js"
elif [ "$VERSION" == 'sol6' ]; then
  echo "Running sol6 coverage..."
  yarn hardhat coverage --testfiles "test/sol5/*.js" --solcoverjs ".solcover.js"
else
  echo "Running full coverage..."
  yarn hardhat coverage --solcoverjs ".solcover.js"
=======
  yarn buidler coverage --config ./buidlerConfigSol5.js --testfiles "test/sol5/" --solcoverjs ".solcover.js"
else
  echo "Running sol6 coverage..."
  yarn buidler compile --config buidlerConfigSol5.js &&
  yarn buidler compile --config buidlerConfigSol4.js
  cp -R ./artifacts/ ./.tempCoverageArtifacts
  yarn buidler coverage --config ./buidlerConfigSol6.js --testfiles "test/sol6/" --solcoverjs ".solcover.js"
>>>>>>> update coverage.sh
fi
