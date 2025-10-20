#!/bin/sh

# if any errors occur, abort with erorr code
# this will prevent restart loops if any command fails
set -e

echo "Command: $@"

command="${1:-prod}"

case $command in
  watch)
    # install dev deps, but preserve container's NODE_ENV
    NODE_ENV=development npm install

    echo "Running dev server..."
    exec npm run dev:start
  ;;
  prod)
    echo "Running server..."
    exec npm run start
  ;;
esac
