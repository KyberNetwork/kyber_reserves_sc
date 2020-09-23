#!/bin/sh
while getopts "v:" arg; do
  case $arg in
    v) VERSION=$OPTARG;;
  esac
done

yarn buidler clean
rm -r ./.tempCoverageArtifacts

if [ "$VERSION" == 'sol4' ]; then
  echo "Running sol4 coverage..."
  yarn buidler coverage --config ./buidlerConfigSol4.js --testfiles "test/sol4/*.js" --solcoverjs ".solcover.js"
elif [ "$VERSION" == 'sol5' ]; then
  yarn buidler compile --config buidlerConfigSol4.js
  cp -R ./artifacts/ ./.tempCoverageArtifacts
  echo "Running sol5 coverage..."
  yarn buidler coverage --config ./buidlerConfigSol5.js --testfiles "test/sol5/*.js" --solcoverjs ".solcover.js"
else
  echo "Running sol6 coverage..."
  yarn buidler compile --config buidlerConfigSol5.js &&
  yarn buidler compile --config buidlerConfigSol4.js
  cp -R ./artifacts/ ./.tempCoverageArtifacts
  yarn buidler coverage --config ./buidlerConfigSol6.js --testfiles "test/sol6/*.js" --solcoverjs ".solcover.js"
fi
