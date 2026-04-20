#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${1:-mcbn-xp-tracker}"
REGION="${2:-us-central1}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required."
  exit 1
fi

SERVICE_JSON="$(gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format=json)"

cpu="$(echo "${SERVICE_JSON}" | jq -r '.spec.template.spec.containers[0].resources.limits.cpu // "unset"')"
memory="$(echo "${SERVICE_JSON}" | jq -r '.spec.template.spec.containers[0].resources.limits.memory // "unset"')"
concurrency="$(echo "${SERVICE_JSON}" | jq -r '.spec.template.spec.containerConcurrency // "unset"')"
timeout_seconds="$(echo "${SERVICE_JSON}" | jq -r '.spec.template.spec.timeoutSeconds // "unset"')"
min_scale="$(echo "${SERVICE_JSON}" | jq -r '.spec.template.metadata.annotations["autoscaling.knative.dev/minScale"] // "0"')"
max_scale="$(echo "${SERVICE_JSON}" | jq -r '.spec.template.metadata.annotations["autoscaling.knative.dev/maxScale"] // "unset"')"
startup_cpu_boost="$(echo "${SERVICE_JSON}" | jq -r '.spec.template.metadata.annotations["run.googleapis.com/startup-cpu-boost"] // "default"')"
cpu_throttling="$(echo "${SERVICE_JSON}" | jq -r '.spec.template.metadata.annotations["run.googleapis.com/cpu-throttling"] // "true"')"
session_affinity="$(echo "${SERVICE_JSON}" | jq -r '.spec.template.metadata.annotations["run.googleapis.com/sessionAffinity"] // "false"')"

echo "Cloud Run efficiency profile (${SERVICE_NAME}, ${REGION})"
echo "  cpu: ${cpu}"
echo "  memory: ${memory}"
echo "  minScale: ${min_scale}"
echo "  maxScale: ${max_scale}"
echo "  concurrency: ${concurrency}"
echo "  timeoutSeconds: ${timeout_seconds}"
echo "  startupCpuBoost: ${startup_cpu_boost}"
echo "  cpuThrottling: ${cpu_throttling}"
echo "  sessionAffinity: ${session_affinity}"
echo ""

expect_ok=true
check_value() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if [[ "${actual}" == "${expected}" ]]; then
    echo "[ok] ${label}=${actual}"
  else
    echo "[warn] ${label}=${actual} (expected ${expected})"
    expect_ok=false
  fi
}

check_value "cpu" "${cpu}" "1"
check_value "memory" "${memory}" "256Mi"
check_value "minScale" "${min_scale}" "0"
check_value "maxScale" "${max_scale}" "2"
check_value "concurrency" "${concurrency}" "80"
check_value "timeoutSeconds" "${timeout_seconds}" "120"
check_value "cpuThrottling" "${cpu_throttling}" "true"
check_value "sessionAffinity" "${session_affinity}" "false"

if [[ "${expect_ok}" == "true" ]]; then
  echo ""
  echo "Efficiency profile matches expected baseline."
  exit 0
fi

echo ""
echo "Efficiency profile drift detected."
exit 2
