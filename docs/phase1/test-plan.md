# ✅ Test Plan & Test Cases – *GreatShield*

---

## 1. Purpose

This document outlines the test strategy, scope, and specific test cases for the GreatShield Chrome extension. It covers **unit tests**, **integration tests**, and **end-to-end (E2E)** scenarios to ensure correctness, stability, and performance of the scanning pipeline.

---

## 2. Test Strategy

| Layer | Tool | Description |
|-------|------|-------------|
| Unit | Jest | Test individual modules in isolation (e.g., RuleEngine, PolicyEnforcer) |
| Integration | Jest | Test combined behavior of components (e.g., FileAnalyzer + RuleEngine) |
| E2E | Playwright | Simulate real user interactions within the browser environment |

---

## 3. Test Scope

### 3.1. In-Scope

- Download event capture and dispatching
- File filtering based on policy
- Static scanning via regex rules
- Local caching logic (IndexedDB)
- User notification flow and verdict display
- CI pass with 90%+ unit test coverage

### 3.2. Out-of-Scope

- Cloud sandboxing (stubbed only)
- Cross-browser testing (Chrome only for Phase 1)
- Accessibility or internationalization testing

---

## 4. Unit Test Targets (Jest)

| Module | Test Cases |
|--------|------------|
| `PolicyEnforcer` | Should allow/deny files by size and extension |
| `FileAnalyzer` | Should parse content and compute SHA-256 hash |
| `RuleEngine` | Should correctly match patterns and return verdict |
| `ScanResultCache` | Should retrieve/store analysis results by hash |
| `NotificationManager` | Should display correct toast for verdicts |
| `Logger` | Should log events and errors as expected |

---

## 5. Integration Test Targets

| Integration | Test Case |
|-------------|-----------|
| FileAnalyzer + RuleEngine | Full content → rule evaluation pipeline |
| ServiceWorker → EventBus | End-to-end event routing flow |
| File download → notification | Simulate download and scan-to-alert pipeline |

---

## 6. E2E Test Scenarios (Playwright)

| ID | Description |
|----|-------------|
| E2E-001 | User downloads safe `.pdf` file → scan runs → toast shows "Safe" |
| E2E-002 | User downloads `.docx` with malicious macro pattern → "Blocked" verdict |
| E2E-003 | User downloads large `.zip` file → skipped with size warning |
| E2E-004 | User re-downloads previously scanned file → result comes from cache |
| E2E-005 | User clicks toast → popup shows scan summary |

---

## 7. CI Workflow

- Triggered on every PR and push to `main`
- Steps:
  - `npm run lint`
  - `npm run type-check`
  - `npm run test:unit`
  - `npm run test:e2e`
  - `npm run build`
- Minimum 90% coverage enforced via Jest config

---

## 8. Tools & Libraries

| Tool | Purpose |
|------|---------|
| Jest | Unit and integration testing |
| Playwright | E2E testing in real browser |
| `ts-jest` | TypeScript support in Jest |
| `coverage-badges` | CI badge generation |
| GitHub Actions | CI/CD automation |

---

## 9. Test Data & Fixtures

- Malicious files:
  - `test/assets/infected.pdf`
  - `test/assets/macro.docx`
- Clean files:
  - `test/assets/sample.pdf`
  - `test/assets/sample.zip`
- JSON mocks for caching and policy config

---

## 10. Reporting & Debugging

- All test results output to `tests/reports/`
- Coverage reports in `coverage/`
- Failed snapshots saved in `tests/__snapshots__/`

---

## 11. Maintenance

- All new features must include tests before merging
- Test files follow: `*.spec.ts` for unit, `*.e2e.ts` for browser flows
- Broken tests on main will block deployment

---