#!/usr/bin/env bash
# Exercise the real wrapper without gcloud, network access, or real sleeps.
# Run from any directory: bash scripts/test-cloud-run-deploy-retry.sh
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"
cat > "$work/bin/deploy" <<'DEPLOY'
#!/usr/bin/env bash
set -euo pipefail
# Verify the wrapper preserves arguments containing spaces.
[[ "$#" == 2 && "$1" == 'service name' && "$2" == '--quiet' ]]
n=$(cat "$CASE_DIR/count")
n=$((n + 1))
echo "$n" > "$CASE_DIR/count"
if [[ "$SCENARIO" == success ]] || { [[ "$SCENARIO" != exhaustion && "$SCENARIO" != nonmatching && "$SCENARIO" != changed_error && "$n" == 2 ]]; }; then
  echo 'Deployed successfully'
  exit 0
fi
if [[ "$SCENARIO" == nonmatching ]] || { [[ "$SCENARIO" == changed_error && "$n" == 2 ]]; }; then
  echo 'ERROR: permission denied' >&2
elif [[ "$SCENARIO" == single_line ]]; then
  echo 'ERROR: (gcloud.run.deploy) The user-provided container failed the configured startup probe checks.' >&2
else
  printf 'ERROR: (gcloud.run.deploy) The user-provided container failed the\nconfigured startup probe checks.\n' >&2
fi
# Lots of output after the error must not hide the match.
if [[ "$SCENARIO" == large_log ]]; then
  for ((i=0; i<10000; i++)); do echo 'additional revision diagnostics' >&2; done
fi
exit 1
DEPLOY
cat > "$work/bin/sleep" <<'SLEEP'
#!/usr/bin/env bash
set -euo pipefail
[[ "$#" == 1 && "$1" == 7 ]]
echo "$1" >> "$CASE_DIR/sleeps"
SLEEP
chmod +x "$work/bin/deploy" "$work/bin/sleep"

failures=0
run_case() {
  local scenario="$1" expected_status="$2" expected_count="$3" expected_sleeps="$4" expected_message="$5"
  local case_dir="$work/$scenario" status=0 count sleeps
  mkdir "$case_dir"
  echo 0 > "$case_dir/count"
  : > "$case_dir/sleeps"
  PATH="$work/bin:$PATH" CASE_DIR="$case_dir" SCENARIO="$scenario" \
    DEPLOY_ATTEMPTS=3 DEPLOY_RETRY_SLEEP_SECONDS=7 \
    bash "$script_dir/cloud-run-deploy-retry.sh" deploy 'service name' --quiet \
    > "$case_dir/output" 2>&1 || status=$?
  count=$(cat "$case_dir/count")
  sleeps=$(wc -l < "$case_dir/sleeps" | tr -d ' ')
  if [[ "$status" != "$expected_status" || "$count" != "$expected_count" || "$sleeps" != "$expected_sleeps" ]] ||
    ! grep -Fq "$expected_message" "$case_dir/output"; then
    echo "FAIL $scenario: status=$status attempts=$count sleeps=$sleeps (expected $expected_status/$expected_count/$expected_sleeps)"
    tail -n 8 "$case_dir/output"
    failures=$((failures + 1))
  else
    echo "PASS $scenario"
  fi
}

run_case success 0 1 0 'Deployed successfully'
run_case single_line 0 2 1 'Deployed successfully'
run_case multiline 0 2 1 'Deployed successfully'
run_case nonmatching 1 1 0 'not retrying.'
run_case exhaustion 1 3 2 'startup probe on all 3 attempts.'
# A previous startup failure must not cause retries for a later permission error.
run_case changed_error 1 2 1 'not retrying.'
run_case large_log 0 2 1 'Deployed successfully'
[[ "$failures" == 0 ]]
