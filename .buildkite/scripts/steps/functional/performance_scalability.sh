#!/usr/bin/env bash

set -euo pipefail

source .buildkite/scripts/common/util.sh
source .buildkite/scripts/common/env.sh

.buildkite/scripts/bootstrap.sh
.buildkite/scripts/download_build_artifacts.sh

echo --- Run Scalability Performance Tests

node scripts/es snapshot&

esPid=$!

export TEST_ES_URL=http://elastic:changeme@localhost:9200
export TEST_ES_DISABLE_STARTUP=true

sleep 120

cd "$XPACK_DIR"

# journeys=("login" "ecommerce_dashboard" "flight_dashboard" "web_logs_dashboard" "promotion_tracking_dashboard" "many_fields_discover")
journeys=("login")

for i in "${journeys[@]}"; do
    echo "JOURNEY[${i}] is running"

    export TEST_PERFORMANCE_PHASE=WARMUP
    export ELASTIC_APM_ACTIVE=false
    export JOURNEY_NAME="${i}"

    checks-reporter-with-killswitch "Run Performance Tests with Playwright Config (Journey:${i},Phase: WARMUP)" \
      node scripts/functional_tests \
      --config test/performance/config.playwright.ts \
      --include "test/performance/tests/playwright/${i}.ts" \
      --kibana-install-dir "$KIBANA_BUILD_LOCATION" \
      --debug \
      --bail

    export TEST_PERFORMANCE_PHASE=TEST
    export ELASTIC_APM_ACTIVE=true

    checks-reporter-with-killswitch "Run Performance Tests with Playwright Config (Journey:${i},Phase: TEST)" \
      node scripts/functional_tests \
      --config test/performance/config.playwright.ts \
      --include "test/performance/tests/playwright/${i}.ts" \
      --kibana-install-dir "$KIBANA_BUILD_LOCATION" \
      --debug \
      --bail
done

kill "$esPid"

USER_FROM_VAULT="$(retry 5 5 vault read -field=username secret/kibana-issues/dev/apm_parser_performance)"
PASS_FROM_VAULT="$(retry 5 5 vault read -field=password secret/kibana-issues/dev/apm_parser_performance)"
ES_SERVER_URL="https://kibana-ops-e2e-perf.es.us-central1.gcp.cloud.es.io:9243"
RANDOM_BUILD_ID=${RANDOM}${RANDOM}
BUILD_ID="${BUILD_ID:-$RANDOM_BUILD_ID}"  # read $BUILDKITE_BUILD_ID or fall back to a random number

echo "--- Extract APM metrics"

for i in "${journeys[@]}"; do
    JOURNEY_NAME="${i}"
    echo "Looking for JOURNEY=${JOURNEY_NAME} and BUILD_ID=${BUILD_ID} in APM traces"

    # TODO: configure --output folder
    ./node_modules/.bin/performance-testing-dataset-extractor -u "${USER_FROM_VAULT}" -p "${PASS_FROM_VAULT}" -c "${ES_SERVER_URL}" -b "${BUILD_ID}" -n "${JOURNEY_NAME}"
done

# archive json files with traces and upload as build artifacts
echo "--- Convert APM metrics into a testing scenario"

# TODO: release a package and use script
# TODO: configure --output folder
node ./node_modules/scalability-simulation-generator/build/main/index.js --dir ./output --packageName org.kibanaLoadTest --url "http://localhost:5620"
