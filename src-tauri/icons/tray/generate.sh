#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

render() {
  local name=$1
  local color=$2
  local dasharray=${3:-}

  local extra=""
  if [ -n "$dasharray" ]; then
    extra=" stroke-dasharray=\"$dasharray\""
  fi

  cat > "_$name.svg" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22">
  <g fill="none" stroke="$color" stroke-width="1.75" stroke-linecap="round"$extra>
    <path d="M11 16 A 5 5 0 0 0 11 6" />
    <path d="M11 18.5 A 7.5 7.5 0 0 0 11 3.5" />
    <path d="M11 21 A 10 10 0 0 0 11 1" />
  </g>
  <circle cx="11" cy="11" r="1.6" fill="$color" />
</svg>
EOF
  rsvg-convert -w 22 -h 22 "_$name.svg" -o "tray-$name@1x.png"
  rsvg-convert -w 44 -h 44 "_$name.svg" -o "tray-$name@2x.png"
  rm "_$name.svg"
}

render "template" "#000000"
render "green"    "#16A34A"
render "yellow"   "#D97706"
render "red"      "#DC2626"
render "gray"     "#A1A1AA"
render "syncing"  "#71717A" "1.5 1.5"

echo "Generated tray icons:"
ls -la tray-*.png
