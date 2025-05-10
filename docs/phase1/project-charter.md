## 📘 Project Charter: *GreatShield – Browser-Embedded Lightweight Antivirus*

### 1. **Project Name**

**GreatShield**

---

### 2. **Project Purpose**

GreatShield is a lightweight antivirus extension that operates within the Chrome browser environment, providing users with a **fast and lightweight security layer** by scanning PDFs, Office documents, compressed files, and other downloads at the point of download. The goal is to achieve **real-time threat protection** while avoiding the heavy performance overhead of traditional antivirus solutions.

---

### 3. **High-Level Objectives**

* Real-time static threat detection for document downloads (PDF/ZIP/Office)
* Implementation of in-browser scanning pipeline (Tier 1)
* Architecture design with future cloud sandbox integration in mind (including Tier 2 Stub)
* Achieve test coverage of 90% or higher
* Performance targets: Latency < 50ms, Memory < 5MB

---

### 4. **Key Stakeholders**

| Role            | Name/Organization        | Responsibilities        |
| --------------- | ----------------------- | ---------------------- |
| Product Owner   | Mose Park               | Product definition, strategy, and project management |
| Lead Developer  | Mose Park               | Architecture design and core logic development |
| Contributors    | GitHub open source contributors (planned) | Feature improvements and bug fixes |
| End Users       | Technical users, developer community | Extension installation and usage |

---

### 5. **Project Scope**

#### ✅ In-Scope

* Chrome extension architecture design and implementation
* Download event hooking and file scanning logic
* Rule Engine for malicious pattern detection
* Warning notification (Toast Notification) UI
* IndexedDB-based local scan caching
* GitHub Actions-based CI/CD setup
* E2E and unit test coverage

#### ❌ Out-of-Scope

* Cloud-based real-time sandbox (Tier 2)
* Browser extensions for other browsers (Firefox, Edge, etc.)
* ML-based dynamic analysis features
* Policy server/management console

---

### 6. **Assumptions**

* Users have basic technical capabilities and can manually install the extension through developer mode
* Browser download APIs are sufficiently stable in their current state
* Document threats can primarily be detected through static signatures

---

### 7. **Constraints**

| Constraint Type | Details                                |
| --------------- | -------------------------------------- |
| Environment     | Works only in Chrome browser           |
| Performance     | Scan latency < 50ms, Memory usage < 5MB |
| Deployment      | Must comply with Chrome Web Store policies |
| Feature         | Cloud integration limited to Stub in Tier 1 |

---

### 8. **Milestones (Phase 1)**

| Milestone           | Timeline (Expected) | Description                    |
| ------------------- | ------------------- | ------------------------------ |
| Kickoff            | 2025.05.10         | Requirements specification and initial structure |
| Core Logic Implementation | 2025.05.20    | Scanner, rule engine, and UI integration |
| Test Coverage      | 2025.05.25         | Jest + Playwright test setup   |
| Chrome Store Build | 2025.05.27         | Deployment files and metadata preparation |
| Internal Release   | 2025.05.30         | Test deployment via manual installation |

---

### 9. **Approval**

| Approver    | Role          | Signature                              |
| ----------- | ------------- | -------------------------------------- |
| Mose Park   | Product Owner | *(Considered as Git history or PR approval)* |
