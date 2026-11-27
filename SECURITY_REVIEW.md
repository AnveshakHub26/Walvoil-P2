# Walvoil DPR Application Security & Confidentiality Review (Phase 16)

**Project:** Walvoil Daily Production Report (DPR) Handwriting Digitisation System  
**Template Standard:** ASLY-DPR-REV01 (Final Assembly)  
**Security Audit Date:** November 6, 2026  
**Auditor Classification:** Industrial Software Security & Compliance Audit  
**Status:** **AUDITED & HARDENED (Zero Critical Vulnerabilities Identified)**  

---

## 1. Security Scope & Confidentiality Principles

The Walvoil Daily Production Report contains commercially sensitive operational data: operator identity, work order batch numbers, valve part numbers, assembly station productivity, and downtime defect remarks.

The following foundational confidentiality principles govern this architecture:
1. **Air-Gapped Local Operation:** No scanned images, extracted text, or employee names are ever transmitted to third-party cloud OCR APIs (e.g., Google Cloud Vision, AWS Textract, Microsoft Azure Computer Vision, OpenAI).
2. **Volatile In-Memory Processing:** Scanned DPR images are evaluated entirely in volatile memory and are not permanently saved to disk.
3. **Data Immutability & Auditability:** Human edits never overwrite raw OCR logs without explicit tracking (`originalValue` vs `currentValue`).
4. **Zero Stack Trace Disclosure:** Internal server file paths, framework versions, and traceback details are shielded from client responses.

---

## 2. STRIDE Threat Model & Security Mitigations

| Threat Category | Potential Attack Vector | Applied Engineering Mitigation | Verification Status |
| :--- | :--- | :--- | :---: |
| **Spoofing** | Origin header spoofing by untrusted web applications to siphon DPR data. | CORS middleware strictly enforces explicit origin whitelist from `Settings.CORS_ORIGINS`. Wildcard `*` is explicitly blocked in production. | **VERIFIED** |
| **Tampering** | Directory traversal via malicious filename uploads (e.g. `../../../../etc/passwd.jpg`). | Filenames are stripped of path components using `os.path.basename(filename.replace('\\', '/'))` across all upload handlers. | **VERIFIED** |
| **Repudiation** | Untraceable edits or disputed production figures. | The HITL adapter preserves `originalValue`, `currentValue`, `isCorrected`, `isConfirmed`, and records an export audit notice in Excel Row 26. | **VERIFIED** |
| **Information Disclosure** | Stack traces revealing internal server paths (`D:\...`, `/app/...`) on unexpected errors. | Global exception middleware catches all unhandled exceptions, logs detailed tracebacks internally to secure log files, and returns a generic JSON response with a unique `request_id`. | **VERIFIED** |
| **Denial of Service (DoS)** | Image decompression bombs (e.g., tiny compressed file expanding to 10 GB in RAM). | Pillow `Image.MAX_IMAGE_PIXELS = 67,108,864` (8192 × 8192 px max) rejects decompression bombs immediately before memory allocation. Maximum upload size enforced at 10 MB. | **VERIFIED** |
| **Elevation of Privilege** | Container breakout or host filesystem compromise. | Docker container executes under unprivileged system user `appuser` (UID 10001); root execution is strictly prohibited. | **VERIFIED** |

---

## 3. OWASP API Security Top 10 Evaluation

### 3.1 API1: Broken Object Level Authorization (BOLA)
- **Status:** *Controlled by Session Scope*
- **Mechanism:** The application does not store user data in persistent databases with sequential IDs. In-memory temporary image IDs are cryptographically random UUIDv4 identifiers with a 3600-second TTL.

### 3.2 API2: Broken Authentication
- **Status:** *Documented Architecture for Walvoil IT*
- **Design:** In accordance with requirements, internal demo mode operates without local credentials. For enterprise deployment beyond localhost, the company IT team must configure an authenticating reverse proxy (see Section 5).

### 3.3 API3: Broken Object Property Level Authorization
- **Status:** *Compliant*
- **Mechanism:** Strict Pydantic models (`DPRRecognitionResponse`, `ProductionTableRow`, `RecognizedField`) validate all incoming and outgoing JSON payloads. Unrecognized properties are discarded.

### 3.4 API4: Unrestricted Resource Consumption
- **Status:** *Compliant & Hardened*
- **Enforced Boundaries:**
  - `MAX_FILE_SIZE_MB = 10` (File size ceiling: 10,485,760 bytes).
  - `MAX_IMAGE_WIDTH = 8192`, `MAX_IMAGE_HEIGHT = 8192` (Resolution ceiling).
  - `MAX_IMAGE_PIXELS = 67,108,864` (Decompression ceiling).
  - `CACHE_MAX_ENTRIES = 50` (In-memory bounded queue).
  - `CONCURRENCY_LIMIT = 4` (`asyncio.Semaphore` throttling CPU usage).

### 3.5 API5: Broken Function Level Authorization
- **Status:** *Compliant*
- **Mechanism:** No administrative or destructive endpoints exist. All exposed routes are restricted to report upload, preprocessing, layout inspection, and recognition extraction.

### 3.6 API6: Unrestricted Access to Sensitive Business Flows
- **Status:** *Compliant*
- **Mechanism:** File uploads require valid image streams with decodable magic bytes verified by Pillow; non-image payloads are rejected with HTTP 400.

### 3.7 API7: Server Side Request Forgery (SSRF)
- **Status:** *Compliant (Zero Risk)*
- **Mechanism:** The backend does not fetch remote URLs or make outbound HTTP requests. Model weights are stored locally in `.cache`.

### 3.8 API8: Security Misconfiguration
- **Status:** *Compliant & Hardened*
- **Production HTTP Security Headers Injected on All Responses:**
  - `X-Content-Type-Options: nosniff` (Prevents MIME sniffing attacks)
  - `X-Frame-Options: DENY` (Prevents Clickjacking)
  - `X-XSS-Protection: 1; mode=block` (Cross-site scripting protection)
  - `Referrer-Policy: strict-origin-when-cross-origin` (Shields referral paths)
  - `Permissions-Policy: geolocation=(), camera=(), microphone=()` (Restricts hardware APIs)
  - `X-Request-ID: <uuid8>` (Traceable request tracking)

### 3.9 API9: Improper Inventory Management
- **Status:** *Compliant*
- **Mechanism:** All API endpoints are versioned under `/api/v1`. Interactive Swagger documentation (`/docs`) is automatically disabled when `ENVIRONMENT=production`.

### 3.10 API10: Unsafe Consumption of APIs
- **Status:** *Compliant (Zero External APIs)*
- **Mechanism:** System operates completely standalone without external API consumption.

---

## 4. Privacy & Confidential Logging Standards

The standard logging configuration (`app.main`) adheres to industrial data protection standards:
1. **Redacted Logging:** Operator names, part numbers, customer order numbers, and raw handwriting text are **never logged** to disk or terminal stdout.
2. **Logged Metadata:** Only HTTP method, sanitized path, response status code, elapsed milliseconds, and `request_id` are recorded.
3. **Log Rotation:** In enterprise deployment, logs written to `/app/logs/walvoil_dpr_api.log` must be rotated daily using standard `logrotate` or container volume retention policies.

---

## 5. Enterprise Access Control & Deployment Security Architecture

For production deployment within Walvoil's corporate intranet, the following access control architecture is recommended for Walvoil IT approval:

```
[ Factory Operator Workstation ]
               │  (HTTPS : 443 with TLS 1.3)
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Walvoil Reverse Proxy / API Gateway (Nginx / Caddy / Traefik)│
│  • Terminates Corporate SSL/TLS Wildcard Certificate        │
│  • Authenticates against Walvoil Active Directory / LDAP    │
│  • Enforces Corporate IP Whitelist (VLAN 10.x / 192.168.x)  │
│  • Rate Limiting: 60 requests / minute per client           │
└──────────────────────────────┬──────────────────────────────┘
                               │  (Internal Bridge Network)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ Walvoil DPR Docker Container (appuser : UID 10001)          │
│  • FastAPI Backend Service (Port 8000, Internal Only)       │
│  • Offline Local PyTorch & PaddleOCR Engine                 │
│  • Persistent Cache Volume: /app/.cache (Read-Only)         │
│  • Persistent Log Volume: /app/logs                         │
└─────────────────────────────────────────────────────────────┘
```

### Access Control Recommendations for Walvoil IT:
1. **Authentication:** Integrate Nginx or Caddy with OAuth2/OIDC (e.g., Azure AD / Microsoft Entra ID) to restrict UI and API access to authorized Assembly Shop Floor personnel.
2. **Network Segmentation:** Place the backend container inside an isolated shopfloor VLAN with no direct Internet egress.
3. **Volume Permissions:** Mount the model weights volume (`/app/.cache`) with read-only (`:ro`) permissions to prevent container tampering.

