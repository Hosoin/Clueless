#!/bin/sh
set -eu

fail() { printf '%s\n' "$1" >&2; exit 1; }

[ "$#" -le 1 ] || fail 'Usage: deploy-closet.sh [IMAGE]'
CDPATH= cd -- "$(dirname -- "$0")"

if [ "$#" -eq 1 ]; then
    image=$1
else
    sha=$(git rev-parse --short HEAD 2>/dev/null) || fail 'Cannot determine the Git short SHA.'
    image="clueless-closet:$sha"
fi
case "$image" in
    ''|-*|*[!a-zA-Z0-9._:/@-]*) fail 'Invalid image reference.' ;;
esac

docker image inspect "$image" >/dev/null 2>&1 || fail 'Target image is not available locally (or Docker is unavailable).'

compose() {
    docker compose -p clueless-closet-dev -f compose.closet.yaml -f compose.closet-https.yaml "$@"
}

override=compose.closet-image.yaml
[ ! -d "$override" ] || fail 'Image override path is a directory.'
candidate=$(mktemp "$override.tmp.XXXXXX")
trap 'rm -f "$candidate"' 0
trap 'exit 1' HUP INT TERM
printf 'services:\n  closet-service:\n    image: "%s"\n' "$image" > "$candidate"

compose -f "$candidate" config --quiet >/dev/null 2>&1 || fail 'Compose validation failed; existing override and containers were not changed.'
container=$(compose -f "$candidate" ps --status running -q closet-service 2>/dev/null) || fail 'Cannot find the running closet-service container.'
if [ -n "$container" ]; then
    current_id=$(docker container inspect --format '{{.Image}}' "$container" 2>/dev/null) || fail 'Cannot inspect the running container image.'
    # The previous Git tag may already point to the newly rebuilt image.
    rollback="clueless-closet:rollback-${current_id#sha256:}"
    docker image tag "$current_id" "$rollback" >/dev/null 2>&1 || fail 'Cannot preserve the running image; deployment stopped.'
    printf 'Rollback (from backend): ./deploy-closet.sh %s\n' "$rollback"
fi

mv -f "$candidate" "$override"
compose -f "$override" up -d --no-deps --force-recreate --no-build --pull never closet-service >/dev/null 2>&1 ||
    fail 'Compose up failed. The new override remains; retry or redeploy the rollback image if available.'
printf 'Compose up completed. Verify the deployed endpoint at /test manually.\n'
