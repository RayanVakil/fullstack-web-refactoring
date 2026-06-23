# Engineering Audit & Architectural Review Spec
**Candidate:** Rayan Vakil  
**Task:** Full-Stack Systems Assessment  
**Tooling Stack:** pnpm Workspace, TypeScript, Antigravity Orchestrator  

---

## 1. System Vulnerability & Defect Registry
*Use this section to document every issue discovered during the initial codebase read-through. Note severity and root cause analysis—even for issues left unpatched due to the 90-minute limit.*

### Issue 1: The Credential Problem (Security)
* **Domain Class:** Security
* **Target Package/File:** `apps/api/src/services/utils.ts`, `apps/api/src/services/auth.service.ts`, `apps/client-user/src/lib/grpc.server.ts`, `apps/client-admin/src/lib/grpc.server.ts`
* **Root Cause Diagnosis:** Passwords were unconditionally hashed using SHA-256 with a static, hardcoded salt, making them highly vulnerable to rainbow table attacks and offline cracking. Additionally, both client applications (`client-user` and `client-admin`) were independently minting their own JWT session tokens using a shared `JWT_SECRET`, meaning a compromised client could mint elevated-privilege tokens for arbitrary user IDs.
* **Remediation Status:** Patched

### Issue 2: Query Performance Problem (N+1 Queries)
* **Domain Class:** Performance
* **Target Package/File:** `apps/api/src/services/*` (feed, users, bookmarks, search, posts, comments, admin, notifications)
* **Root Cause Diagnosis:** Resolving nested data (e.g., likes, comments, author details) was implemented via `Promise.all` mapping over the initial result set and executing independent queries for each row. This resulted in O(N) database queries per request, creating severe load vulnerabilities on the database under high traffic.
* **Remediation Status:** Patched

### Issue 3: Error Handling & Observability
* **Domain Class:** Reliability
* **Target Package/File:** `apps/api/src/server.ts`
* **Root Cause Diagnosis:** Lack of centralized error handling and request-level tracing. 
* **Remediation Status:** Identified / Out of Scope for Time (Pending Implementation)

### Issue 4: Test Infrastructure & Coverage Gaps
* **Domain Class:** Tooling
* **Target Package/File:** `package.json`, `apps/api/package.json`
* **Root Cause Diagnosis:** Cross-platform incompatibilities (e.g., `&&` usage in NPM scripts not supporting Windows) and failing E2E tests.
* **Remediation Status:** Identified / Out of Scope for Time (Pending Implementation)

### Issue 5: Build Pipeline & Developer Experience
* **Domain Class:** Tooling
* **Target Package/File:** `turbo.json`
* **Root Cause Diagnosis:** Turborepo cache configuration is misaligned with the actual outputs.
* **Remediation Status:** Identified / Out of Scope for Time (Pending Implementation)

---

## 2. Surgical Patch Execution & Justifications
*For every issue successfully resolved, document the explicit written justification here to satisfy deliverable criteria.*

### Patch Registry: Issue 1 (The Credential Problem)
* **Impacted Line Ranges:** 
  - `utils.ts`: Modified lines 1-25.
  - `auth.service.ts`: Inserted lines 79-84.
  - `grpc.server.ts` (client-user & client-admin): Modified lines 1-56.
* **Surgical Justification:** We introduced `bcryptjs` for secure password hashing. To maintain backward compatibility with legacy seeded hashes, `verifyPassword` transparently detects old SHA-256 hashes (`!hash.startsWith("$2")`), checks them against the static salt, and then `loginUser` actively re-hashes and persists the password via `bcrypt`. Token generation was moved securely to the API by using the `sessionToken` natively returned by the login endpoint, eliminating the shared secret vulnerability on clients.
* **Migration / Long-Term Scale Considerations:** Legacy hashes are migrated to bcrypt strictly on-demand (at user login), spreading the computational cost and requiring zero database downtime or mass conversion scripts.

### Patch Registry: Issue 2 (Query Performance Problem)
* **Impacted Line Ranges:** 
  - `feed.service.ts`, `posts.service.ts`, `bookmarks.service.ts`, `search.service.ts`, `users.service.ts`, `comments.service.ts`, `admin.service.ts`, `notifications.service.ts`
* **Surgical Justification:** Refactored the data access logic from iterative `Promise.all` `get()` operations into Drizzle ORM integrated scalar subqueries using `.mapWith()`. We replaced multi-stage maps with unified query definitions (e.g. `buildPostSelect` and `buildCommentSelect`). This transforms N+1 roundtrips into single optimized SQL requests per feed fetch without altering the external function signatures.
* **Migration / Long-Term Scale Considerations:** Database load scales efficiently O(1) instead of O(N) relative to the feed limit size. Single unified queries also make database index utilization optimal.

---

## 3. Automated Validation Log
* **Local Package Manager:** `pnpm`
* **Monorepo Build Verification:** Run `pnpm build` -> `[Status: Success / Fail]`
* **Test Suite Verification:** Run `pnpm test` -> `[Status: All Pass]`
* **Regression Audit:** Run `git diff` to ensure zero unintended changes outside the surgical targets.

---

## 4. Antigravity Prompt Harness
*Copy and paste this instruction block into the Antigravity TUI window to execute pinpoint fixes using this document as strict context.*

```text
Context file: ./diagnostic_spec.md
Target file: [Insert relative path to the specific file you are patching]

Instructions:
1. Parse sections 1 and 2 of the context spec for the corresponding target file.
2. Execute an in-place, highly surgical logic correction to fix the root cause.
3. CONSTRAINTS:
   - Make minimal modifications. Do not rewrite surrounding functions or clean up style patterns.
   - Maintain strict backward compatibility; do not alter function headers or export interfaces.
   - Ensure file line endings remain strictly LF.
   - Output only the file modification diff. Do not output conversational explanations.
```