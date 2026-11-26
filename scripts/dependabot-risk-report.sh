#!/usr/bin/env bash
# Builds a read-only risk report for one Dependabot GitHub Actions update.
#
# Inputs (env): REPO, DEP, PREV, NEW, ECOSYSTEM, REPORT_FILE, GH_TOKEN
# Only reads GitHub API data about the upstream action. It never runs code
# from the PR. The output is a heuristic aid for a human reviewer, not proof
# that an update is safe.
set -uo pipefail

: "${REPO:?}" "${DEP:?}" "${REPORT_FILE:?}" "${ECOSYSTEM:?}"
PREV="${PREV:-}"
NEW="${NEW:-}"

flags=()
add_flag() { flags+=("$1"); }

files_md="" ; urls="" ; sus="" ; commits_md="" ; slug="" ; newtag="" ; prevtag=""

write_report() {
  {
    echo "<!-- dependabot-risk-report -->"
    echo "## Dependabot risk report: \`${slug:-$DEP}\` ${PREV} → ${NEW}"
    echo
    if (( ${#flags[@]} == 0 )); then
      echo "**No automated flags.** Still read the file list below before merging."
    else
      echo "**Review before merging.** Automated checks raised ${#flags[@]} item(s):"
      echo
      for f in "${flags[@]}"; do echo "- $f"; done
    fi
    echo
    echo "_Required checks (Analyze, smoke-test, snyk, validate) are reported on the PR itself. This report is a heuristic, not proof that the update is safe._"
    echo
    echo "<details><summary>Files changed</summary>"
    echo
    echo "${files_md:-_No file list available._}"
    echo
    echo "</details>"
    echo
    echo "<details><summary>Commits in this update</summary>"
    echo
    echo "${commits_md:-_No commit list available._}"
    echo
    echo "</details>"
    echo
    echo "<details><summary>Network hosts added (count, host)</summary>"
    echo
    echo '````'
    echo "${urls:-none}"
    echo '````'
    echo
    echo "</details>"
    echo
    echo "<details><summary>Added lines matching risky patterns</summary>"
    echo
    echo '````'
    echo "${sus:-none}"
    echo '````'
    echo
    echo "</details>"
  } > "$REPORT_FILE"
}

if [[ "$ECOSYSTEM" != "github_actions" ]]; then
  add_flag "Automated analysis covers GitHub Actions only. Review this $ECOSYSTEM update manually."
  write_report
  exit 0
fi

if [[ "$DEP" == *,* ]]; then
  add_flag "Grouped update ($DEP). Automated analysis covers one dependency at a time. Review each one manually."
  write_report
  exit 0
fi

dep="${DEP// /}"
owner="${dep%%/*}"
rest="${dep#*/}"
repo_name="${rest%%/*}"
slug="$owner/$repo_name"

# Resolve a version to a tag that exists upstream (tries "1.2.3" then "v1.2.3").
resolve() {
  local v
  for v in "$1" "v$1"; do
    if gh api "repos/$slug/commits/$v" --jq .sha >/dev/null 2>&1; then
      echo "$v"
      return
    fi
  done
}

newtag=$(resolve "$NEW")
prevtag=$(resolve "$PREV")

if [[ -z "$newtag" || -z "$prevtag" ]]; then
  add_flag "Could not resolve tags for $slug ($PREV → $NEW). Review the diff by hand."
  write_report
  exit 0
fi

# 1. Is the release commit signed?
verified=$(gh api "repos/$slug/commits/$newtag" --jq '.commit.verification.verified' 2>/dev/null)
if [[ "$verified" != "true" ]]; then
  add_flag "The release commit for $newtag is not signed (GitHub reports verified=$verified)."
fi

# 2. How new is the release?
published=$(gh api "repos/$slug/releases/tags/$newtag" --jq .published_at 2>/dev/null || true)
if [[ -n "$published" ]]; then
  hours=$(( ( $(date +%s) - $(date -d "$published" +%s) ) / 3600 ))
  if (( hours < 72 )); then
    add_flag "Release $newtag was published ${hours}h ago. Brand-new releases get less community review."
  fi
else
  add_flag "No GitHub release page exists for $newtag. The tag is the only source."
fi

# 3. What actually changed between the two tags. Uses gh's built-in --jq so no
#    external jq binary is needed. If the compare can't be read, flag it: a
#    report must never pass silently on missing data.
cmpq() { gh api "repos/$slug/compare/$prevtag...$newtag" --jq "$1" 2>/dev/null; }

if ! cmpq '.total_commits' >/dev/null 2>&1 || [[ -z "$(cmpq '.total_commits')" ]]; then
  add_flag "Could not read the comparison between $prevtag and $newtag. Review the diff by hand before merging."
  write_report
  exit 0
fi

files_md=$(cmpq '.files[]? | "- `\(.filename)` (\(.status), +\(.additions)/-\(.deletions))"' | head -n 80)

sensitive=$(cmpq '.files[]?.filename' \
  | grep -E '(^|/)(action\.ya?ml|Dockerfile|package(-lock)?\.json|yarn\.lock|pnpm-lock\.yaml)$|^(dist|lib)/|^\.github/workflows/' || true)
if [[ -n "$sensitive" ]]; then
  n=$(echo "$sensitive" | wc -l)
  add_flag "$n file(s) that define behaviour or run code changed, e.g. $(echo "$sensitive" | head -n 8 | tr '\n' ' ')(see Files changed)."
fi
if echo "$sensitive" | grep -qE '^(dist|lib)/'; then
  add_flag "A compiled bundle (dist/ or lib/) changed. Source changes can't be checked against it by reading this diff."
fi

big=$(cmpq '[.files[]? | select(.patch | not)] | length')
if [[ "${big:-0}" != "0" ]]; then
  add_flag "$big changed file(s) are too large to show a diff for. Review them on GitHub."
fi

# 4. Added lines: new hosts, and code-execution or credential patterns.
added=$(cmpq '.files[]? | select(.patch) | .patch' | grep -E '^\+[^+]' || true)

urls=$(echo "$added" | grep -oE "https?://[^ \"'<>)\`]+" \
  | sed -E 's#^(https?://[^/]+).*#\1#' | sort | uniq -c | sort -rn | head -n 30 || true)
if [[ -n "$urls" ]]; then
  add_flag "New network hosts appear in added lines. Check each one (see details)."
fi

sus=$(echo "$added" | grep -nE 'curl |wget |base64|eval|new Function|child_process|spawnSync|execSync|/dev/tcp|nc -|chmod \+x|ACTIONS_ID_TOKEN|GITHUB_TOKEN|secrets\.' | head -n 40 || true)
if [[ -n "$sus" ]]; then
  add_flag "Added lines match risky patterns (fetching remote content, eval or exec, token or secret access). See details."
fi

# 5. Commits in the range.
unsigned=$(cmpq '[.commits[]? | select(.commit.verification.verified != true)] | length')
if [[ "${unsigned:-0}" != "0" ]]; then
  add_flag "$unsigned commit(s) between $prevtag and $newtag are not signed."
fi
commits_md=$(cmpq '.commits[]? | "- `\(.sha[0:7])` \(.commit.author.name): \(.commit.message | split("\n")[0]) (signed: \(.commit.verification.verified))"' | head -n 40)

write_report
