#!/bin/sh
while getopts "v:" arg; do
  case $arg in
    v) VERSION=$OPTARG;;
  esac
done

yarn hardhat clean

if [ "$VERSION" == 'sol4' ]; then
  echo "Running sol4 coverage..."
  yarn hardhat coverage --testfiles "test/sol4/*.js" --solcoverjs ".solcover.js"
elif [ "$VERSION" == 'sol5' ]; then
  echo "Running sol5 coverage..."
  yarn hardhat coverage --testfiles "test/sol5/*.js" --solcoverjs ".solcover.js"
elif [ "$VERSION" == 'sol6' ]; then
  echo "Running sol6 coverage..."
  yarn hardhat coverage --testfiles "test/sol5/*.js" --solcoverjs ".solcover.js"
else
  echo "Running full coverage..."
  yarn hardhat coverage --solcoverjs ".solcover.js"
fi
