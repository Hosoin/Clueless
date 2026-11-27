#!/bin/sh
set -eu

CDPATH= cd -- "$(dirname -- "$0")/.."
tmp=$(mktemp -d)
tmp=$(CDPATH= cd -- "$tmp" && pwd -P)
trap 'rm -rf "$tmp"' 0
mkdir "$tmp/backend"
cp build-closet-image.sh deploy-closet.sh "$tmp/backend/"
cd "$tmp"
export PATH="$tmp:$PATH" MOCK_BACKEND="$tmp/backend"
export MOCK_IMAGE=clueless-closet:abc123 MOCK_FAIL=

cat > git <<'EOF'
#!/bin/sh
[ "$*" = 'rev-parse --short HEAD' ] && printf 'abc123\n'
EOF
cat > docker <<'EOF'
#!/bin/sh
set -eu
[ "$PWD" = "$MOCK_BACKEND" ]
old_id=sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
rollback=clueless-closet:rollback-${old_id#sha256:}
override=compose.closet-image.yaml
case "$*" in
    "build -f closet-service/Dockerfile -t $MOCK_IMAGE .")
        printf 'build\n' >> ../calls
        [ "$MOCK_FAIL" != build ]; exit ;;
    "image inspect $MOCK_IMAGE")
        printf 'inspect\n' >> ../calls
        [ "$MOCK_FAIL" != missing ]; exit ;;
    'container inspect --format {{.Image}} old-container') printf '%s\n' "$old_id"; exit ;;
    "image tag $old_id $rollback") printf 'tag\n' >> ../calls; exit ;;
esac
[ "$1 $2 $3 $4 $5 $6 $7 $8" = 'compose -p clueless-closet-dev -f compose.closet.yaml -f compose.closet-https.yaml -f' ]
file=$9
shift 9
grep -Fxq "    image: \"$MOCK_IMAGE\"" "$file"
case "$*" in
    'config --quiet')
        [ "$file" != "$override" ]
        printf 'config\n' >> ../calls
        if [ "$MOCK_FAIL" = config ]; then
            printf 'mock-secret\n' >&2
            exit 1
        fi ;;
    'ps --status running -q closet-service') printf 'old-container\n' ;;
    'up -d --no-deps --force-recreate --no-build --pull never closet-service')
        [ "$file" = "$override" ]
        printf 'up\n' >> ../calls ;;
    *) exit 1 ;;
esac
EOF
chmod +x git docker

if MOCK_FAIL=build ./backend/build-closet-image.sh > output 2>&1; then exit 1; fi
[ "$(cat calls)" = build ]
[ ! -e backend/compose.closet-image.yaml ]

: > calls
./backend/build-closet-image.sh > output
[ "$(cat calls)" = "$(printf 'build\ninspect\nconfig\ntag\nup')" ]
grep -Fq '/test' output
rollback=$(sed -n 's/^Rollback (from backend): \.\/deploy-closet\.sh //p' output)
cp backend/compose.closet-image.yaml original

export MOCK_IMAGE="$rollback"
: > calls
if MOCK_FAIL=config backend/deploy-closet.sh "$rollback" > output 2>&1; then exit 1; fi
[ "$(cat calls)" = "$(printf 'inspect\nconfig')" ]
cmp -s original backend/compose.closet-image.yaml
if grep -Fq 'mock-secret' output; then exit 1; fi
set -- backend/compose.closet-image.yaml.tmp.*
[ ! -e "$1" ]

: > calls
if MOCK_FAIL=missing backend/deploy-closet.sh "$rollback" > output 2>&1; then exit 1; fi
[ "$(cat calls)" = inspect ]
cmp -s original backend/compose.closet-image.yaml

: > calls
backend/deploy-closet.sh "$rollback" > output
[ "$(cat calls)" = "$(printf 'inspect\nconfig\ntag\nup')" ]
grep -Fxq "    image: \"$rollback\"" backend/compose.closet-image.yaml
set -- backend/compose.closet-image.yaml.tmp.*
[ ! -e "$1" ]
printf 'deploy-closet mock checks passed.\n'
