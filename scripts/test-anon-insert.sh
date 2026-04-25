#!/usr/bin/env bash
# Simulates the exact HTTP payload the Arduino firmware sends to Supabase,
# plus adversarial payloads that the new RLS policy should reject.
#
# Usage:
#   SUPABASE_URL=https://xxx.supabase.co \
#   SUPABASE_ANON_KEY=eyJ... \
#   ./scripts/test-anon-insert.sh
#
# Exit code 0 = all checks passed (firmware-shaped insert works, attackers blocked)
# Exit code 1 = something failed — DO NOT apply migration to prod yet.

set -u

: "${SUPABASE_URL:?Set SUPABASE_URL (e.g. https://xxx.supabase.co)}"
: "${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY}"

TEST_DEVICE="${TEST_DEVICE:-node1}"
UNREGISTERED_DEVICE="test_canary_migration_01"
PASS=0
FAIL=0

# Post a JSON body to /rest/v1/readings with the exact headers the firmware uses.
# Echoes the HTTP status.
post_reading() {
  local body="$1"
  curl -s -o /tmp/anon-insert-resp.$$ -w "%{http_code}" \
    -X POST "$SUPABASE_URL/rest/v1/readings" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=minimal" \
    -H "Connection: close" \
    -d "$body"
  rm -f /tmp/anon-insert-resp.$$
}

check() {
  local label="$1"
  local body="$2"
  local expected_range="$3"   # "ok" means 2xx, "blocked" means 4xx
  local code
  code=$(post_reading "$body")
  if [[ "$expected_range" == "ok" ]]; then
    if [[ "$code" =~ ^2 ]]; then
      echo "PASS  [$code]  $label"
      PASS=$((PASS + 1))
    else
      echo "FAIL  [$code]  $label  — expected 2xx"
      FAIL=$((FAIL + 1))
    fi
  else
    if [[ "$code" =~ ^4 ]]; then
      echo "PASS  [$code]  $label"
      PASS=$((PASS + 1))
    else
      echo "FAIL  [$code]  $label  — expected 4xx"
      FAIL=$((FAIL + 1))
    fi
  fi
}

echo "=== Firmware-shaped payload (must succeed) ==="
echo "Using TEST_DEVICE='$TEST_DEVICE' (must exist in devices and be active)."
check "normal sensor reading"          "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":22.47,\"humidity\":48.91}"  ok
check "cold but valid"                  "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":-20.0,\"humidity\":30}"    ok
check "hot but valid"                   "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":55.0,\"humidity\":80}"     ok

echo
echo "=== Adversarial payloads (must be rejected) ==="
echo "The unregistered-device check assumes device_auto_register is false."
check "unregistered device_id"          "{\"device_id\":\"$UNREGISTERED_DEVICE\",\"temperature\":22,\"humidity\":50}" blocked
check "weather_ prefix in device_id"    "{\"device_id\":\"weather_node1\",\"temperature\":22,\"humidity\":50}"              blocked
check "uppercase/bad chars in device_id" "{\"device_id\":\"NODE!\",\"temperature\":22,\"humidity\":50}"                     blocked
check "device_id too long (33 chars)"   "{\"device_id\":\"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"temperature\":22,\"humidity\":50}" blocked
check "temperature below -50"           "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":-999,\"humidity\":50}"           blocked
check "temperature above 100"           "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":500,\"humidity\":50}"            blocked
check "humidity above 100"              "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":22,\"humidity\":150}"            blocked
check "humidity negative"               "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":22,\"humidity\":-5}"             blocked
check "attacker sets deployment_id"     "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":22,\"humidity\":50,\"deployment_id\":1}" blocked
check "attacker sets source=weather"    "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":22,\"humidity\":50,\"source\":\"weather\"}" blocked
check "attacker sets observed_at"       "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":22,\"humidity\":50,\"observed_at\":\"2020-01-01T00:00:00Z\"}" blocked
check "attacker sets zip_code"          "{\"device_id\":\"$TEST_DEVICE\",\"temperature\":22,\"humidity\":50,\"zip_code\":\"85142\"}" blocked

echo
echo "=== Summary ==="
echo "Passed: $PASS    Failed: $FAIL"

if [[ "$FAIL" -gt 0 ]]; then
  echo
  echo "DO NOT apply this migration to prod until all checks pass."
  echo "If the 'firmware-shaped' checks failed, the RLS is too strict and will brick Arduinos."
  echo "If the 'adversarial' checks passed (were accepted), the RLS is too loose."
  exit 1
fi

echo
echo "All good. Test rows were inserted with device_id='$TEST_DEVICE'."
echo "Clean them up when you're done:"
echo "  DELETE FROM readings WHERE device_id = '$TEST_DEVICE' AND created_at > now() - interval '10 minutes';"
