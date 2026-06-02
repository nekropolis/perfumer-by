# Perfumer CRM Calls (Android)

Ручной перевод входящего звонка в админку CRM.

## Установка на телефон (кратко)

1. Соберите APK (Android Studio — ниже).
2. Скопируйте APK на телефон и откройте файл → «Установить».
3. Разрешите «Установку из неизвестных источников», если Android спросит.
4. В приложении: **API URL** + **токен** из админки → **Сохранить**.
5. **Настроить Call Screening** → выберите это приложение.
6. При звонке нажмите **«Открыть в CRM»** (в приложении или в уведомлении).

---

## VS Code / Cursor

В редакторе **нет кнопки «Собрать APK»** — это нормально. Два рабочих варианта:

1. **Android Studio** (проще всего) — см. раздел ниже.
2. **Терминал в VS Code** (`Terminal → New Terminal`), если уже установлены Android Studio + JDK:

   ```bash
   cd android/incoming-call-bridge
   ./gradlew assembleDebug
   ```

   APK: `app/build/outputs/apk/debug/app-debug.apk`

   Иконка Gradle слева и «Initializing Gradle Language Server» **не обязательны** для сборки — достаточно терминала или Android Studio.

---

## Сборка APK в Android Studio (рекомендуется)

### Что нужно на компьютере

- [Android Studio](https://developer.android.com/studio) (Ladybug или новее)
- JDK 17 (обычно идёт с Android Studio)

### Шаги

1. Откройте Android Studio → **Open** → папка:
   ```
   perfumer-by/android/incoming-call-bridge
   ```
2. Дождитесь **Gradle Sync** (первый раз может скачать SDK — 5–15 минут).
3. Сборка APK — **любой** из способов ниже.

### Способ A — меню (если Gradle Sync зелёный)

**Сборка** → **Собрать Bundle(s) / APK(s)** → **Собрать APK(s)**  
(англ.: **Build → Build Bundle(s) / APK(s) → Build APK(s)**)

Если этого пункта **нет** — sync не прошёл. См. «Если нет пункта Build APK» ниже.

### Способ B — панель Gradle (всегда работает)

1. Справа вкладка **Gradle** (иконка слона). Если не видно: **View → Tool Windows → Gradle**.
2. Раскройте **IncomingCallBridge → app → Tasks → build**.
3. Дважды кликните **assembleDebug**.
4. Внизу **Build** — `BUILD SUCCESSFUL`.

### Способ C — терминал в Android Studio

**View → Tool Windows → Terminal**:

```bash
./gradlew assembleDebug
```

4. Когда сборка готова (способ A), внизу появится ссылка **locate** — откроется папка с файлом:
   ```
   app/build/outputs/apk/debug/app-debug.apk
   ```
5. Этот файл — установщик для телефона (после любого способа A/B/C путь одинаковый).

### Если нет пункта «Собрать APK» / sync красный

1. Открыта именно папка **`android/incoming-call-bridge`**, не весь `perfumer-by`.
2. Внизу **Build** / **Sync** — нет ошибок. Если есть: **File → Sync Project with Gradle Files**.
3. Файл **`local.properties`** с путём к SDK (Android Studio обычно создаёт сам):
   ```
   sdk.dir=/Users/ВАШ_ЮЗЕР/Library/Android/sdk
   ```
   Путь: **Android Studio → Settings → Languages & Frameworks → Android SDK** → **Android SDK Location**.
4. **File → Project Structure → SDK Location** — тот же путь.
5. Снова **Sync**, затем способ **B** (Gradle → **assembleDebug**).

### Установка APK на телефон

**Вариант A — USB**

1. На телефоне: **Настройки → О телефоне** → 7 раз нажать «Номер сборки» → включить **Режим разработчика**.
2. **Для разработчиков** → **Отладка по USB**.
3. Подключите кабель к ПК.
4. В Android Studio: **Run** (зелёный треугольник) — приложение установится само.

   Или с ПК:
   ```bash
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```

**Вариант B — без USB**

1. Перешлите `app-debug.apk` себе в Telegram / почту / облако.
2. На телефоне откройте файл → **Установить**.

---

## Сборка из терминала (если уже есть Android SDK + JDK 17)

```bash
cd android/incoming-call-bridge
./gradlew assembleDebug
```

Нужны: **JDK 17** (идёт с Android Studio) и **Android SDK** (после первого открытия проекта в Android Studio). Если `./gradlew` пишет «Unable to locate Java Runtime» — установите [Android Studio](https://developer.android.com/studio) и откройте проект там один раз.

APK: `app/build/outputs/apk/debug/app-debug.apk`

---

## Настройка после установки

### 1. Токен в админке

**Админка → Система → Телефоны CRM** → создайте устройство (например `SIM 1`) → скопируйте **токен** (показывается один раз).

На **каждый** телефон — **своё** устройство и **свой** токен.

### 2. Поля в приложении

| Поле | Пример | Пояснение |
|------|--------|-----------|
| API URL | `http://perfumer.test` | Адрес сайта/API **без** `/api` в конце |
| Device token | длинная строка из админки | Токен этого телефона |

Нажмите **Сохранить настройки**.

Телефон должен достучаться до сервера (Wi‑Fi / VPN в ту же сеть, что dev-сервер).

### 3. Call Screening (обязательно для номера звонящего)

1. **Настроить Call Screening** в приложении (или вручную):
   - **Настройки Android → Приложения → Особые доступы** (названия зависят от прошивки)
   - **Определитель номера / Скрининг вызовов / Call screening**
   - Выберите **Perfumer CRM Calls**
2. Разрешите **Телефон** и **Уведомления**, если спросит при первом запуске.

Без этой роли на Android 10+ номер входящего может не появиться в приложении.

### 4. CRM на компьютере

- Менеджер **залогинен** в админку (тот же пользователь, что выбран при создании устройства).
- Reverb запущен (`supervisorctl status perfumer-reverb` → RUNNING).
- В браузере WebSocket подключён (DevTools → WS → 101).

---

## Как пользоваться

1. Входящий звонок → номер появляется в приложении (и часто в уведомлении).
2. CRM **сама не открывается** — это нормально.
3. Нажмите **«Открыть в CRM»**.
4. На ПК откроется создание заказа с подставленным телефоном.

---

## API (для справки)

```
POST {API_URL}/api/incoming-calls/send-to-crm
Authorization: Bearer {device_token}

{"phone":"375291234567","trigger":"manual","received_at":1717160000}
```
