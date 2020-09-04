#!/bin/sh
ALL=true

while getopts "f:" arg; do
  case $arg in
    f) FILE=$OPTARG;;
  esac
done

if [ -n "$FILE" ]; then
  yarn buidler test --no-compile $FILE
else
  echo "Running all tests..."
  yarn buidler test --no-compile
fi
