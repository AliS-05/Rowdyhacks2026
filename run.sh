#!/bin/bash

docker run --rm -p 8080:8080 rowdyhacks-bridge &
DOCKER_PID=$!

sleep 3

open http://127.0.0.1:8080/

wait $DOCKER_PID
