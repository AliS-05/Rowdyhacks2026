#!/bin/bash
set -e

docker build -t rowdyhacks .
docker run --rm -p 8080:8080 rowdyhacks
