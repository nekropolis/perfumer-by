#!/usr/bin/env bash
# Сборка debug APK без панели Gradle в Android Studio.
set -euo pipefail
cd "$(dirname "$0")"

if [ -d "/Applications/Android Studio.app/Contents/jbr/Contents/Home" ]; then
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
fi

if [ ! -f local.properties ]; then
  SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
  if [ -d "$SDK" ]; then
    echo "sdk.dir=$SDK" > local.properties
    echo "Создан local.properties → $SDK"
  else
    echo "Ошибка: нет local.properties и не найден SDK в $SDK"
    echo "Android Studio → Settings → Android SDK → скопируйте путь в local.properties"
    exit 1
  fi
fi

echo "Сборка APK (1–3 минуты)..."
./gradlew assembleDebug

APK="app/build/outputs/apk/debug/app-debug.apk"
echo ""
echo "Готово:"
echo "  $(pwd)/$APK"
open "$(dirname "$APK")" 2>/dev/null || true
