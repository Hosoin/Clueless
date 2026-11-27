#!/bin/sh
set -eu

CDPATH= cd -- "$(dirname -- "$0")"
sha=$(git rev-parse --short HEAD)
image="clueless-closet:$sha"

docker build -f closet-service/Dockerfile -t "$image" .
exec ./deploy-closet.sh "$image"
