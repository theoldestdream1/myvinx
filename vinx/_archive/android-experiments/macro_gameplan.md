codebase structure to map out system milestones, distribute micro-tasks, and enforce high-level architectural integrity across your whole repository.

Qwen 2.5 Coder (The Frontend Specialist): Swiftly generates responsive client-side user interfaces, templates, and state-management code across JavaScript web apps, native Kotlin Android screens.

Qwen 2.5 Coder (The Low-Level Systems Engineer): Executes high-performance algorithmic optimization, custom multi-threading execution, and rigid manual memory allocation layers written in low-level C.

Llama 3.1/4 (The Core Backend Engineer): Configures your foundational server-side logic, data routing pipelines, API orchestration, and microservice communication engines using Python and Java.

DeepSeek-R1 (The Omniscient Debugger): Deploys deep chain-of-thought logical reasoning to isolate raw terminal compilation errors and output precise code surgical patches the exact moment a milestone build breaks.

```python
markdown_content = """# VINX PHASE 2: AMBIENT CONTEXT INGESTION ENGINE (ANDROID NATIVE)
## SYSTEM ARCHITECTURE & MACRO EXECUTION PLAN

---

### SYSTEM OVERVIEW & STRATEGIC GOAL
The objective of Phase 2 is to transform Vinx from a passive web utility into a continuous, ambient "second brain" that runs at the OS level. We are engineering a high-performance, resource-insulated native Android background service in Kotlin.

This client will quietly intercept system-wide notifications, securely scrape contextual screen data, cache it locally in a failure-proof SQLite database, and stream it in optimized batches to our Phase 1 Supabase backend API (`POST /api/v1/context/ingest`).


```

```text
SUCCESS: macro_gameplan.md generated perfectly.


```

[Android OS Events]
│
├──► NotificationListenerService ──► [Regex/Package Filter] ──┐
│ ▼
└──► AccessibilityService (UI Tree) ─► [Deduplication] ──► [Room DB Local Cache]
│
┌──────────────────────────────────────────────────────────────┘
│ (Batched & Encrypted)
▼
[WorkManager Sync Engine] ───► [WiFi / Charging Check] ───► POST /api/v1/context/ingest (Supabase)

```

---

## MICRO-PHASES TIMELINE


```

┌───────────────────────────────────────────────────────────────────────────────────┐
│ MICRO-PHASE 2.1: FOUNDATION, CONFIGURATION & HARDENED SECURITY SETUP │
├───────────────────────────────────────────────────────────────────────────────────┤
│ MICRO-PHASE 2.2: THE NOTIFICATION INTERCEPTION FRAMEWORK │
├───────────────────────────────────────────────────────────────────────────────────┤
│ MICRO-PHASE 2.3: THE VISUAL AMBIENT SCREEN SCRAPER (ACCESSIBILITY ENGINE) │
├───────────────────────────────────────────────────────────────────────────────────┤
│ MICRO-PHASE 2.4: HIGH-PERFORMANCE LOCAL FAULT-TOLERANT CACHE (ROOM DATABASE) │
├───────────────────────────────────────────────────────────────────────────────────┤
│ MICRO-PHASE 2.5: SYSTEM SYNC ENGINE & INTELLIGENT WORKMANAGER INTEGATION │
├───────────────────────────────────────────────────────────────────────────────────┤
│ MICRO-PHASE 2.6: RESOURCE OPTIMIZATION, BATTERY EXEMPTIONS & FAIL-SAFE LOOPS │
└───────────────────────────────────────────────────────────────────────────────────┘

````

---

## DETAILED MICRO-PHASE SPECIFICATIONS

### MICRO-PHASE 2.1: Foundation, Configuration & Hardened Security Setup
**Objective:** Establish a rock-solid, production-ready native Kotlin Android structure with strict encryption protocols for storing personal tokens.

#### 1. Core Architecture Setup
* **Language & Build System:** Target Kotlin 2.x, Gradle (Kotlin DSL), SDK 34 (Android 14) down-targetable to SDK 26 (Android 8.0) to ensure deep market penetration.
* **Dependency Injection:** Implement Hilt / Dagger for clean component scoping (`SingletonComponent` for services, database, and network engines).

#### 2. Encrypted Storage Infrastructure
* Never store long-lived Phase 1 device bearer tokens in standard unencrypted `SharedPreferences`.
* **Implementation:** Use Android Jetpack **EncryptedSharedPreferences** backed by the Android Keystore system (`MasterKey.Builder`).
* **Fail-Safe:** Implement an immediate cryptographic fallback check: if the Keystore is corrupted or cleared by the OS, explicitly force a re-authentication prompt within the client app wrapper rather than throwing a silent runtime exception.

#### 3. Initialization Config UI
* Build a lean, zero-bloat modern Jetpack Compose configuration UI.
* **Features:** Token pairing field, real-time connection validator status (hitting `GET /api/v1/health` on Phase 1), and quick system toggle switches to view active OS permission states.

---

### MICRO-PHASE 2.2: The Notification Interception Framework
**Objective:** Intercept and parse inbound application data before notifications vanish from the device lock screen.

#### 1. Native Service Component
* Extend `NotificationListenerService`. Declare the service inside `AndroidManifest.xml` protected by the `android.permission.BIND_NOTIFICATION_LISTENER_SERVICE` permission.

#### 2. Targeted Ingestion Filters
* To prevent ingestion noise, implement a rigid package-filtering system.
* **Whitelist Categories:** Core messaging systems (`com.whatsapp`, `org.telegram.messenger`, `com.google.android.apps.messaging`), email systems (`com.google.android.gm`), and social knowledge sources (`com.twitter.android`, `com.google.android.youtube`).
* **Blacklist Categories:** System indicators, battery warnings, download managers, and media player persistent states.

#### 3. Payload Parsing Logic
* Overriding `onNotificationPosted(sbn: StatusBarNotification)`:
    * Extract `sbn.packageName`.
    * Extract Text Payload via `sbn.notification.extras.getCharSequence(Notification.EXTRA_TEXT)`.
    * Extract Sender Identity via `Notification.EXTRA_TITLE`.
    * Normalize string contents by converting them to clean, trimmed UTF-8 structures. Filter out system emojis and unsupported inline metadata strings before they reach memory queues.

---

### MICRO-PHASE 2.3: The Visual Ambient Screen Scraper
**Objective:** Build the ultimate context pipeline using accessibility nodes to read text directly off the user's screen.

#### 1. Native Service Implementation
* Extend `AccessibilityService`. Configure the explicit service attributes using an XML configuration file (`res/xml/accessibility_service_config.xml`):
    ```xml
    <accessibility-service
        android:accessibilityEventTypes="typeWindowStateChanged|typeWindowContentChanged"
        android:accessibilityFeedbackType="feedbackGeneric"
        android:accessibilityFlags="flagDefault|flagIncludeNotImportantViews|flagRetrieveInteractiveWindows"
        android:canRetrieveWindowContent="true"
        android:description="@string/accessibility_description" />
    ```

#### 2. Layout Tree Traverser & Intelligent Rate-Limiting
* **The Problem:** High-frequency UI interactions (like rapid scrolling through Twitter or a WhatsApp chat) will flood `onAccessibilityEvent(event: AccessibilityEvent)` with thousands of events per second, causing UI lag and rapid battery drain.
* **The Architecture Fix:** Implement a strict **Debounce Algorithm** (2000ms window). Do not run a window node layout crawl unless the screen state settles for 2 full seconds.
* **Node Crawling Engine:** Write a recursive function traversing `AccessibilityNodeInfo`. Extract text elements matching interactive view elements. Ignore sensitive system input fields explicitly (`node.isPassword == true`).

#### 3. In-Memory Tokenizer Deduplication
* Before writing scraped layout strings to the local cache, pass them through a sliding-window text hashing engine. If the exact same structural text chunk was parsed within the last 60 seconds, discard it immediately. This mitigates duplicate data creation caused by standard screen refreshes.

---

### MICRO-PHASE 2.4: High-Performance Local Fault-Tolerant Cache
**Objective:** Ensure zero data loss when the user is offline by utilizing a highly responsive database layer.

#### 1. Room DB Architecture
* Implement a clean **Room Data Access Object (DAO)** ecosystem with a single, highly indexable flat table: `context_events`.

#### 2. Schema Layout Specification
```sql
CREATE TABLE context_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    source_app TEXT NOT NULL,
    capture_type TEXT NOT NULL, -- "notification" OR "screen_ocr"
    raw_content TEXT NOT NULL,
    timestamp INTEGER NOT NULL, -- Unix epoch millisecond timestamp
    is_synced INTEGER NOT NULL DEFAULT 0, -- Boolean marker (0 or 1)
    hash_signature TEXT UNIQUE NOT NULL -- Enforces database-level deduplication
);
CREATE INDEX idx_unsynced_events ON context_events(is_synced, timestamp);

````

#### 3. Transaction Safety

- All batch insertions must run within a high-speed `@Transaction` block to ensure execution safety. If a device crashes mid-crawl, database integrity remains uncompromised.
- **Auto-Pruning:** Implement a database cleanup trigger: upon every successful remote sync, immediately drop rows older than 7 days where `is_synced == 1` to prevent local mobile storage bloating.

---

### MICRO-PHASE 2.5: System Sync Engine & Intelligent WorkManager Integration

**Objective:** Safely stream batched local events to the Phase 1 Supabase endpoint without triggering rate limits or dropping requests.

#### 1. Background Work Architecture

- Utilize standard Jetpack **WorkManager** to handle background networking tasks. Define a unique, persistent work request (`PeriodicWorkRequestBuilder`) scheduled to execute every 15 minutes.

#### 2. Physical Environmental Constraints

- Configure the synchronization worker with strict runtime constraints to protect device integrity:
- `.setRequiredNetworkType(NetworkType.CONNECTED)`
- `.setRequiresBatteryNotLow(true)`

#### 3. Transmission Batching & Phase 1 API Integration

- When invoked, the Worker pulls the oldest 100 unsynced events from `Room DB` (`is_synced == 0`).
- Map the raw SQL structure perfectly into the expected Phase 1 payload format:

```json
{
  "source_app": "com.whatsapp",
  "capture_type": "notification",
  "raw_content": "Cleaned message payload string",
  "timestamp": "ISO-8601-Formatted-String-Utc",
  "metadata": { "device_model": "Android Client Native" }
}
```

- Fire an HTTP `POST` network call using **Retrofit** equipped with an explicit OkHttpClient connection timeout ceiling of 30 seconds.
- **Atomic State Update:** If the response returns `HTTP 200 / 201 OK`, immediately execute a database update statement setting `is_synced = 1` for that specific ID array.

#### 4. Resiliency & Backoff Protocol

- If the remote server returns an `HTTP 429` (Rate Limited) or `HTTP 5xx` (Server Error), the Worker must exit with `Result.retry()`. Configure an **Exponential Backoff Policy** starting at a 30-second initial step.

---

### MICRO-PHASE 2.6: Resource Optimization, Battery Exemptions & Fail-Safe Loops

**Objective:** Prevent Android's Doze Mode from killing our data ingestion engine and implement self-healing background layers.

#### 1. Foreground Execution Insulation

- To keep services alive during prolonged background sleep cycles, wrap the ingestion coordinators inside a persistent **Foreground Service**.
- **UI Footprint:** Serve a mandatory, subtle, ongoing low-priority system notification: _"Vinx is optimizing your ambient cognitive context."_

#### 2. Battery Optimization Whitelisting

- Direct your team to add the runtime explicit intent routing to request permission for the user to disable Doze mode optimization for our application package:

```kotlin
val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
    data = Uri.parse("package:${context.packageName}")
}

```

#### 3. Persistent Boot Resiliency

- Register a static broadcast receiver (`BootReceiver`) listening directly for `Intent.ACTION_BOOT_COMPLETED`.
- **Function:** The moment the user reboots their phone, the receiver intercepts the broadcast signal and automatically boots up the Foreground Service and spins up WorkManager schedules. This ensures the app is persistent without requiring manual user intervention.

---

## ENGINEERING MILESTONES & VALIDATION MATRIX

Your team must satisfy the following checklist constraints before Phase 2 can be marked as complete:

| Component               | Target Metrics           | Testing / Validation Protocol                                                                                                  |
| ----------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| **Notification Engine** | 100% Ingestion Accuracy  | Trigger mock WhatsApp and Telegram messages. Confirm content appears in local database within 100ms.                           |
| **Screen Crawler**      | Zero UI Thread Blocking  | Run a layout traversal script while scrolling a heavy text field at 120Hz. Frame drop must remain at 0%.                       |
| **Database Caching**    | < 15MB Storage Footprint | Run a continuous 24-hour ingestion simulation. Confirm auto-pruning triggers successfully on old synced sync items.            |
| **Network Sync Engine** | Atomic Transmission Loop | Simulate a network failure mid-transmission. Validate that zero duplicate entries are committed to Supabase upon reconnection. |
| **Power Overhead**      | < 3% Total Battery Use   | Profile the app package using Android Studio Energy Profiler over a continuous 6-hour cycle.                                   |

---

## CRITICAL REVISIT: PREPARING THE METAL FOR THE C BRAIN (PHASE 3)

While your development team focuses on building Phase 2 using native Kotlin components, keep your long-term goal in sight.

Ensure that your engineering lead structures the Room Data Access Layer cleanly behind a **Repository Pattern Interface** (`ContextRepository`).

By separating the high-level UI/OS collection components from the database writing logic through an interface, we can seamlessly swap out the local Room database later. In Phase 3, we can replace it with a hyper-optimized **compiled C static binary engine** without needing to touch or rewrite our Phase 2 collection architecture.

This decoupling ensures that our core infrastructure remains modular, scale-ready, and highly adaptable.
"""

with open("macro_gameplan.md", "w") as f:
f.write(markdown_content)

print("SUCCESS: macro_gameplan.md generated perfectly.")
