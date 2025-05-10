# 🧩 Interface Specification – *GreatShield*

---

## 1. Purpose

This document defines all key TypeScript interfaces, method signatures, and data structures used within the GreatShield extension. It serves as a single source of truth for module contracts, type safety, and component integration.

---

## 2. Core TypeScript Interfaces

### 2.1. `DownloadEvent`

```ts
interface DownloadEvent {
  id: number;
  filename: string;
  mime: string;
  url: string;
  fileSize: number;
  extension: string;
  timestamp: number;
}
```

- **Description**: Represents metadata for a downloaded file intercepted by the extension.
- **Used by**: `PolicyEnforcer`, `FileAnalyzer`, `ScanResultCache`.

---

### 2.2. `ScanVerdict`

```ts
type ScanVerdict = 'safe' | 'suspicious' | 'blocked' | 'skipped';
```

- **Description**: Result classification after scanning a file.
- **Used by**: `RuleEngine`, `NotificationManager`, `Popup UI`.

---

### 2.3. `AnalysisResult`

```ts
interface AnalysisResult {
  fileHash: string;
  verdict: ScanVerdict;
  matchedRules: string[];
  scannedAt: number;
  durationMs: number;
}
```

- **Description**: Encapsulates the full result of file analysis.
- **Used by**: `ScanResultCache`, `NotificationManager`, UI Renderer.

---

### 2.4. `Policy`

```ts
interface Policy {
  maxFileSizeMB: number;
  allowedExtensions: string[];
  enableCaching: boolean;
}
```

- **Description**: Runtime policy configuration for file filtering.
- **Used by**: `PolicyEnforcer`, `ConfigManager`.

---

## 3. Module API Signatures

### 3.1. `PolicyEnforcer`

```ts
function validateDownload(file: DownloadEvent, policy: Policy): boolean;
```

- **Returns**: `true` if file passes policy checks; `false` otherwise.

---

### 3.2. `FileAnalyzer`

```ts
function analyzeFile(file: File): Promise<{ parsedContent: string; hash: string }>;
```

- **Returns**: Promise resolving with parsed file content and SHA-256 hash.

---

### 3.3. `RuleEngine`

```ts
function applyRules(content: string): { verdict: ScanVerdict; matchedRules: string[] };
```

- **Returns**: Threat assessment and list of matched signature rules.

---

### 3.4. `ScanResultCache`

```ts
function getCachedResult(fileHash: string): Promise<AnalysisResult | null>;
function storeResult(result: AnalysisResult): Promise<void>;
```

- **Purpose**: Prevents redundant scanning of identical files.

---

### 3.5. `NotificationManager`

```ts
function showToast(verdict: ScanVerdict, fileName: string): void;
function handleUserClick(result: AnalysisResult): void;
```

- **Purpose**: Provides user feedback and opens result UI on interaction.

---

## 4. Configuration API

### 4.1. `ConfigManager`

```ts
function getPolicy(): Policy;
function setPolicy(p: Policy): void;
```

- **Note**: May be extended in future for remote or user-defined policies.

---

## 5. Utility Types

### 5.1. `Logger`

```ts
function logInfo(message: string): void;
function logError(message: string, error?: any): void;
```

- Used across modules for internal tracing and debugging.

---

## 6. Popup Interface Data Contract

### 6.1. `PopupDisplayPayload`

```ts
interface PopupDisplayPayload {
  fileName: string;
  verdict: ScanVerdict;
  matchedRules: string[];
  scannedAt: number;
  durationMs: number;
}
```

- **Sent from**: `NotificationManager`
- **Rendered by**: `popup.ts` UI module

---

## 7. External APIs (Chrome Extension APIs Used)

| API | Purpose |
|-----|---------|
| `chrome.downloads.*` | Intercept and control download flow |
| `chrome.notifications.*` | Display toast alerts to users |
| `chrome.storage.*` | Manage local extension config and cache |
| `chrome.runtime.*` | Message passing between background and UI |

---

## 8. Future Interface Considerations

| Module | Planned Additions |
|--------|-------------------|
| `SmartScanGateway` | Async cloud submission API stub (`submitForSandbox(fileHash: string): Promise<ScanVerdict>`) |
| `ConfigManager` | Dynamic policy loading from remote JSON or admin UI |
| `RuleEngine` | Rule set versioning and metadata tagging |

---