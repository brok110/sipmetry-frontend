#!/usr/bin/env bash
# ============================================================
# Sipmetry Regression Test Runner
# Usage:
#   ./run_regression.sh [API_URL]
#   API_URL 預設為 http://localhost:8787
#
# 輸出：
#   test/regression/results/YYYY-MM-DD.json
#   test/regression/REGRESSION_REPORT.md（自動更新）
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
TEST_DIR="${PROJECT_DIR}/test"

API_URL="${1:-http://localhost:8787}"
RUN_DATE="$(date +%Y-%m-%d)"
RESULT_FILE="${SCRIPT_DIR}/results/${RUN_DATE}.json"
BASELINE_FILE="${TEST_DIR}/baseline/baseline-v1.json"
FIXTURES_FILE="${TEST_DIR}/fixtures/recommendation-fixtures.json"
REPORT_FILE="${SCRIPT_DIR}/REGRESSION_REPORT.md"

# ── Dependencies check ─────────────────────────────────────
for cmd in curl jq; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "❌ Required command not found: $cmd"
    exit 1
  fi
done

echo "======================================================"
echo "  Sipmetry Regression Test — ${RUN_DATE}"
echo "  API: ${API_URL}"
echo "======================================================"
echo ""

# ── Results accumulator ────────────────────────────────────
L2_total=0; L2_pass=0; L2_exact=0; L2_partial=0; L2_wrong=0; L2_unmapped=0
L3_total=0; L3_pass=0
FAILURES="[]"

# ============================================================
# L2: Canonicalization — batch test via /canonicalize (or infer from /analyze-image)
# Note: These tests require manual photo runs; this script tests the
#       canonicalize logic directly by sending display names.
# ============================================================
echo "── L2 Canonicalization ──────────────────────────────"

BOTTLES=$(jq -c '.bottles[]' "${BASELINE_FILE}")
while IFS= read -r bottle; do
  id=$(echo "$bottle" | jq -r '.id')
  display_name=$(echo "$bottle" | jq -r '.bottle_name')
  expected=$(echo "$bottle" | jq -r '.expected_canonical')
  L2_total=$((L2_total + 1))

  # Call /canonicalize endpoint — request: {"items": ["display_name"]}
  # Response: { items: [{ raw, canonical, match }], canonical: [...] }
  # Use jq to build JSON safely (handles apostrophes, unicode, special chars)
  CANON_BODY=$(jq -n --arg name "$display_name" '{"items": [$name]}')
  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${API_URL}/canonicalize" \
    -H "Content-Type: application/json" \
    -d "$CANON_BODY" 2>/dev/null || echo "{}\n000")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -1)

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "  ⚠️  ${id}: HTTP ${HTTP_CODE} — skipping"
    continue
  fi

  actual=$(echo "$BODY" | jq -r '.items[0].canonical // "null"' 2>/dev/null || echo "null")

  if [[ "$actual" == "$expected" ]]; then
    L2_pass=$((L2_pass + 1))
    L2_exact=$((L2_exact + 1))
    echo "  ✅ ${id}: ${display_name} → ${actual}"
  elif [[ "$actual" == "null" || "$actual" == "unknown" ]]; then
    L2_unmapped=$((L2_unmapped + 1))
    echo "  🔲 ${id}: ${display_name} → unmapped (expected: ${expected})"
    FAILURES=$(echo "$FAILURES" | jq ". + [{\"id\":\"${id}\",\"layer\":\"L2\",\"expected\":\"${expected}\",\"actual\":\"${actual}\",\"type\":\"unmapped\"}]")
  else
    # Check if actual is a parent category of expected (partial match heuristic)
    if [[ "$expected" == *"$actual"* || "$actual" == "rum" && "$expected" == *"rum"* ]]; then
      L2_partial=$((L2_partial + 1))
      echo "  ⚠️  ${id}: ${display_name} → ${actual} (too broad, expected: ${expected})"
      FAILURES=$(echo "$FAILURES" | jq ". + [{\"id\":\"${id}\",\"layer\":\"L2\",\"expected\":\"${expected}\",\"actual\":\"${actual}\",\"type\":\"partial\"}]")
    else
      L2_wrong=$((L2_wrong + 1))
      echo "  ❌ ${id}: ${display_name} → ${actual} (WRONG, expected: ${expected})"
      FAILURES=$(echo "$FAILURES" | jq ". + [{\"id\":\"${id}\",\"layer\":\"L2\",\"expected\":\"${expected}\",\"actual\":\"${actual}\",\"type\":\"wrong\"}]")
    fi
  fi
done <<< "$BOTTLES"

echo ""

# ============================================================
# L3: Recommendation Fixtures
# ============================================================
echo "── L3 Recommendation Fixtures ───────────────────────"

FIXTURES=$(jq -c '.fixtures[]' "${FIXTURES_FILE}")
while IFS= read -r fixture; do
  test_id=$(echo "$fixture" | jq -r '.test_id')
  label=$(echo "$fixture" | jq -r '.label')
  inventory_json=$(echo "$fixture" | jq -c '.inventory')
  expected_top=$(echo "$fixture" | jq -r '.expected_top[]' 2>/dev/null || echo "")
  should_not_appear=$(echo "$fixture" | jq -r '.should_not_appear[]' 2>/dev/null || echo "")
  min_overlap=$(echo "$fixture" | jq -r '.min_overlap_in_top5')
  L3_total=$((L3_total + 1))

  # Build request body
  REQUEST_BODY=$(jq -n \
    --argjson ingredients "$inventory_json" \
    '{"detected_ingredients": $ingredients, "top_n": 5}')

  RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "${API_URL}/recommend-classics" \
    -H "Content-Type: application/json" \
    -d "$REQUEST_BODY" 2>/dev/null || echo "{}\n000")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -1)

  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "  ⚠️  ${test_id} (${label}): HTTP ${HTTP_CODE} — skipping"
    continue
  fi

  # Extract top 5 recipe names
  # Response: { can_make: [...], one_away: [...], two_away: [...] }, each item has .name
  TOP5=$(echo "$BODY" | jq -r '(.can_make[]?.name), (.one_away[]?.name), (.two_away[]?.name)' 2>/dev/null | head -5 || echo "")

  # Check overlap
  overlap=0
  matched_names=""
  while IFS= read -r exp_name; do
    [[ -z "$exp_name" ]] && continue
    if echo "$TOP5" | grep -qi "$exp_name"; then
      overlap=$((overlap + 1))
      matched_names="${matched_names} \"${exp_name}\""
    fi
  done <<< "$expected_top"

  # Check should_not_appear — use word-boundary grep to avoid partial matches
  violations=""
  while IFS= read -r bad_name; do
    [[ -z "$bad_name" ]] && continue
    # Match whole word only (e.g. "Martini" should not match "Vodka Martini" unless exact)
    if echo "$TOP5" | grep -qiw "$bad_name"; then
      violations="${violations} ${bad_name}"
    fi
  done <<< "$should_not_appear"

  # Determine pass/fail
  if [[ $overlap -ge $min_overlap && -z "$violations" ]]; then
    L3_pass=$((L3_pass + 1))
    echo "  ✅ ${test_id} (${label}): overlap=${overlap}/${min_overlap} — PASS"
  else
    fail_msg=""
    [[ $overlap -lt $min_overlap ]] && fail_msg="overlap=${overlap} < ${min_overlap}"
    [[ -n "$violations" ]] && fail_msg="${fail_msg} should_not_appear:${violations}"
    echo "  ❌ ${test_id} (${label}): ${fail_msg}"
    TOP5_INLINE=$(echo "$TOP5" | tr '\n' '|')
    # Use jq --arg to safely inject strings with quotes/special chars
    FAILURES=$(echo "$FAILURES" | jq \
      --arg id "$test_id" --arg label "$label" \
      --arg fail "$fail_msg" --arg top5 "$TOP5_INLINE" \
      '. + [{"id": $id, "layer": "L3", "label": $label, "fail": $fail, "top5": $top5}]')
  fi
done <<< "$FIXTURES"

echo ""

# ============================================================
# Summary & Results JSON
# ============================================================
L2_pass_rate=0
L3_pass_rate=0
[[ $L2_total -gt 0 ]] && L2_pass_rate=$(echo "scale=1; $L2_pass * 100 / $L2_total" | bc)
[[ $L3_total -gt 0 ]] && L3_pass_rate=$(echo "scale=1; $L3_pass * 100 / $L3_total" | bc)

echo "── Summary ──────────────────────────────────────────"
echo "  L2 Canonicalization: ${L2_pass}/${L2_total} pass (${L2_pass_rate}%)"
echo "    ✅ Exact:    ${L2_exact}"
echo "    ⚠️  Partial:  ${L2_partial}"
echo "    ❌ Wrong:    ${L2_wrong}"
echo "    🔲 Unmapped: ${L2_unmapped}"
echo ""
echo "  L3 Recommendation:   ${L3_pass}/${L3_total} pass (${L3_pass_rate}%)"
echo ""

# Thresholds (from framework Section H)
EXIT_CODE=0
if (( $(echo "$L2_pass_rate < 80" | bc -l) )); then
  echo "  🚨 L2 pass rate ${L2_pass_rate}% below threshold (80%) — FAILING"
  EXIT_CODE=1
fi
if (( $(echo "$L3_pass_rate < 60" | bc -l) )); then
  echo "  🚨 L3 pass rate ${L3_pass_rate}% below threshold (60%) — FAILING"
  EXIT_CODE=1
fi

# Write results JSON
jq -n \
  --arg date "$RUN_DATE" \
  --arg api "$API_URL" \
  --argjson l2_total "$L2_total" \
  --argjson l2_pass "$L2_pass" \
  --argjson l2_exact "$L2_exact" \
  --argjson l2_partial "$L2_partial" \
  --argjson l2_wrong "$L2_wrong" \
  --argjson l2_unmapped "$L2_unmapped" \
  --argjson l3_total "$L3_total" \
  --argjson l3_pass "$L3_pass" \
  --argjson failures "$FAILURES" \
  '{
    run_date: $date,
    api_url: $api,
    L2: {
      total: $l2_total, pass: $l2_pass,
      exact: $l2_exact, partial: $l2_partial,
      wrong: $l2_wrong, unmapped: $l2_unmapped
    },
    L3: { total: $l3_total, pass: $l3_pass },
    failures: $failures
  }' > "${RESULT_FILE}"

echo "  Results saved → ${RESULT_FILE}"
echo ""

# Update REGRESSION_REPORT.md
cat > "${REPORT_FILE}" << REPORT_EOF
## Regression Report — ${RUN_DATE}

**API**: ${API_URL}
**Baseline**: v1.0
**Result file**: results/${RUN_DATE}.json

| Layer | Pass | Fail | Pass Rate | Threshold |
|-------|------|------|-----------|-----------|
| L2 Canonical | ${L2_pass}/${L2_total} | $((L2_total - L2_pass))/${L2_total} | ${L2_pass_rate}% | ≥ 80% |
| L3 Recommendation | ${L3_pass}/${L3_total} | $((L3_total - L3_pass))/${L3_total} | ${L3_pass_rate}% | ≥ 60% |

### L2 Breakdown
| Category | Count |
|----------|-------|
| ✅ Exact    | ${L2_exact} |
| ⚠️ Partial  | ${L2_partial} |
| ❌ Wrong    | ${L2_wrong} |
| 🔲 Unmapped | ${L2_unmapped} |

### Failures
$(echo "$FAILURES" | jq -r '.[] | "- **\(.id)** [\(.layer)]: expected \(.expected // "-") → actual \(.actual // "-") (\(.type // .fail // "-"))"' 2>/dev/null || echo "_(none)_")

---
*Auto-generated by run_regression.sh on ${RUN_DATE}*
REPORT_EOF

echo "  Report updated → ${REPORT_FILE}"
echo ""
echo "======================================================"
[[ $EXIT_CODE -eq 0 ]] && echo "  ✅ ALL TESTS PASSED" || echo "  ❌ REGRESSION DETECTED — check failures above"
echo "======================================================"

exit $EXIT_CODE
