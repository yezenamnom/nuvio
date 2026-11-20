#!/usr/bin/env bash
# نشر Nuvio: بيحط رقم نسخة جديد (لحتى التلفونات تحدّث حالها) وبيعمل push
set -e
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M%S)
printf '%s\n' "$V" > version.txt
sed -i "s/^const APP_VERSION = '.*';/const APP_VERSION = '$V';/" app.js
sed -i "s/^const VERSION = '.*';/const VERSION = '$V';/" sw.js
sed -i -E "s/(style\.css|player\.js|app\.js|music\.js|more\.js|acc\.js)(\?v=[0-9]+)?\"/\1?v=$V\"/g" index.html
git add -A
git -c core.autocrlf=false commit -q -m "${1:-Update}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q
echo "deployed $V"
