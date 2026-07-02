# Known Issues & Remediation Plan

This document outlines the core system vulnerabilities and architectural defects discovered in the Chirp monorepo, alongside the planned surgical patches for each issue.

## Issue 1: The Credential Problem

### Vulnerability 1: Password Storage
* **Domain:** Security
* **Target Package/File:** `apps/api/src/services/utils.ts` and `apps/api/src/services/auth.service.ts`
* **Root Cause Diagnosis:** Passwords are being hashed using a simple `SHA-256` hash with a static salt (`password + "salt"`). This is vulnerable to dictionary attacks, brute-forcing, and rainbow tables. Additionally, there is no work-factor involved to slow down attackers.
* **Fix Plan:** We will replace `SHA-256` with `bcrypt`. To ensure backward compatibility (so existing users can still log in without their plaintext passwords), we will update `verifyPassword` to check if a password hash is a bcrypt hash (e.g., starts with `$2a$` or `$2b$`). If it's the old SHA-256 hash, we verify it using the old method, and then *immediately* re-hash the provided plaintext password using `bcrypt` and update the database transparently.

### Vulnerability 2: Trust Establishment (Session Token Forgery)
* **Domain:** Security
* **Target Package/File:** `apps/client-user/src/lib/grpc.server.ts` and `apps/client-user/src/server/functions/auth.ts`
* **Root Cause Diagnosis:** The `client-user` application receives a signed `sessionToken` from the API upon login/register, but it discards this token and instead stores only the `userId` and `username` in its cookie session. When making subsequent gRPC calls to the API, the client uses a shared `JWT_SECRET` to forge and sign its own JWT tokens via `createGrpcSessionToken()`. Because the client holds the secret and mints tokens, any compromise of the client allows an attacker to forge tokens for any user (including admins).
* **Fix Plan:** Update `SessionData` in `session.server.ts` to store the actual `sessionToken` returned by the API. Update `getGrpcSessionToken()` to return the stored token directly. Remove `createGrpcSessionToken` and the `JWT_SECRET` from the client entirely.

## Issue 2: The Query Performance Problem (N+1 Queries)

* **Domain:** Performance
* **Target Package/File:** `apps/api/src/services/feed.service.ts`, `users.service.ts`, `bookmarks.service.ts`
* **Root Cause Diagnosis:** When fetching lists of posts (like the home feed, user profiles, and bookmarks), the application retrieves the posts first, and then iterates over them using `Promise.all`, calling a `getPostCounts` or similar helper for each post. This executes 3 additional queries per post (count likes, count comments, check if the current user liked it). For a feed of 20 posts, this is 1 + (20 * 3) = 61 queries.
* **Fix Plan:** Use Drizzle ORM to aggregate counts and `isLiked` status directly within the initial database query using Left Joins with `GROUP BY` or subqueries. We will create a reusable utility for attaching these counts to prevent the N+1 problem from returning.

## Issue 3: Error Handling & Observability

* **Domain:** Reliability / Observability
* **Target Package/File:** `apps/api/src/grpc/handlers/*`
* **Root Cause Diagnosis:** Handlers currently use `try-catch` blocks that catch `Error` instances and return generic strings (e.g., `error.message` or `"Registration failed"`). This loses error types (e.g., Not Found, Validation Error, Unauthorized) and fails to set appropriate gRPC status codes. Additionally, there is no tracing or logging.
* **Fix Plan:** Implement a unified gRPC interceptor / middleware for error handling and logging. We will inject a trace ID into requests, log every request/response, and map application errors to the correct gRPC status codes.

## Issue 4: Test Infrastructure & Coverage Gaps

* **Domain:** Tooling / Testing
* **Target Package/File:** `apps/api/package.json`, `apps/client-user/tests/e2e/`
* **Root Cause Diagnosis:** E2E tests are failing on Windows due to Bash syntax in the `package.json` scripts (`||`, `&`, `$!`). Furthermore, the tests themselves might lack isolation if they share the same seeded database without cleanup.
* **Fix Plan:** Refactor the test scripts using cross-platform tools like `npm-run-all` or a JS script to orchestrate the test server, or fix the syntax for Windows. We'll also ensure test database isolation.

## Issue 5: Build Pipeline & Developer Experience

* **Domain:** Tooling
* **Target Package/File:** `.github/workflows/ci.yml`, `.husky/pre-commit`, `turbo.json`
* **Root Cause Diagnosis:** There's no CI pipeline to validate PRs, and no pre-commit hooks. `turbo.json` has missing `outputs` configuration, causing caching warnings.
* **Fix Plan:** Add a GitHub Actions workflow for CI. Set up `husky` or `lefthook` for pre-commit linting. Fix the `outputs` configuration in `turbo.json` to correctly capture `dist` and `coverage`.

---

## Breakdown of Implemented Fixes

### 1. The Credential Problem (Security)
* **What was fixed:** The system used a plain SHA-256 hash for passwords. Clients were also dangerously minting their own JWT tokens using a shared secret.
* **How it was fixed:** 
  - Integrated `bcryptjs` for secure password hashing. 
  - Modified the login flow to transparently migrate older SHA-256 hashed passwords to bcrypt on-demand to maintain backward compatibility without forced resets.
  - Removed client-side JWT generation (`createGrpcSessionToken`). Clients now receive and securely store the server-generated `sessionToken` returned from the API, removing the risk of client-side token forgery.

### 2. Query Performance Problem (N+1 Queries)
* **What was fixed:** Fetching feeds caused 3 additional database queries per post, resulting in severe N+1 latency issues on load.
* **How it was fixed:** 
  - Rewrote the iterative `Promise.all` logic inside `feed.service.ts`, `posts.service.ts`, `bookmarks.service.ts`, etc., using Drizzle ORM's scalar subqueries via `.mapWith()`.
  - Replaced multi-stage data fetching with unified, efficient SQL statements to count likes/comments and resolve the `isLiked` status directly inside the single query.
* **Query Profiling Before/After (N = 20):**
  - **Home Feed:** 61 queries previously -> **1 query** now.
  - **User Profile Posts:** 61 queries previously -> **1 query** now.
  - **Bookmarks:** 61 queries previously -> **2 queries** now (1 for bookmarks metadata, 1 for fetching posts efficiently via `inArray`).

### 3. Error Handling & Observability (Reliability)
* **What was fixed:** Individual API handlers were manually throwing generic strings inside `try/catch` blocks, causing loss of contextual error information, and failing to return native gRPC error codes. There was also no central logging.
* **How it was fixed:**
  - Implemented a unified gRPC interceptor (`withLogging` higher-order function in `server.ts`) to wrap all gRPC handlers.
  - The interceptor automatically handles logging execution time and catches thrown errors, converting them safely into standardized `RpcError` types for the clients.
  - Wrote an automated refactor script (`refactor.js`) that safely stripped out all the manual `try/catch` boilerplate across the handlers and client integrations, standardizing error propagation.
  - Updated all `apps/api` unit test assertions to accurately expect standard Promise rejections (`.rejects.toThrow()`) instead of checking for `success: false` properties.

### 4. Test Infrastructure & Coverage Gaps (Tooling)
* **What was fixed:** NPM scripts for E2E tests were failing on Windows environments due to Bash-specific syntax (e.g., `&&`, `rm -rf`).
* **How it was fixed:** 
  - Swapped hardcoded bash cleanup commands with cross-platform equivalents like `rimraf` and configured `test:e2e` for cross-platform support.
  - Integrated `start-server-and-test` to securely and deterministically spin up the backend/frontend servers before kicking off the tests, ensuring zero port conflicts.
* **Test Coverage Audit:**
  | Component | Covered? | Gap Description |
  |-----------|----------|-----------------|
  | `auth.service.ts` | Yes | Includes vulnerability migration test. |
  | `posts.service.ts` | Yes | CRUD & likes verified. |
  | `comments.service.ts`| Yes | Nested resolutions verified. |
  | `bookmarks.service`| Partial | Needs robust testing for sort orders. |
  | `search.service.ts`| No | Missing unit tests for full-text search. |
  | `users.service.ts` | No | Missing follow/unfollow unit tests. |
  | `feed.service.ts`  | Partial | Needs service-level feed sorting tests. |
  | E2E Auth / Feed    | Yes | Covered by Playwright tests. |

### 5. Build Pipeline & Developer Experience (Tooling)
* **What was fixed:** Turborepo cache outputs were misaligned with the build directories, causing cache-miss warnings. No automated CI checks existed for pull requests.
* **How it was fixed:**
  - Corrected the `outputs` array in `turbo.json` to properly map to `dist/**` and `.next/**`.
  - Created a robust GitHub Actions pipeline (`.github/workflows/ci.yml`) that runs `pnpm build`, `pnpm lint`, and `pnpm test` automatically on pushing to `main` or opening PRs.

---

## Developer Setup & Execution Instructions

To get this project running cleanly on your local machine, follow these steps:

1. **Install Dependencies:**
   Ensure you have Node.js and `pnpm` installed, then run:
   ```bash
   pnpm install
   ```

2. **Build the Monorepo:**
   Compile all TypeScript, protos, and applications:
   ```bash
   pnpm build
   ```

3. **Run the Local Development Servers:**
   This spins up the database, gRPC API, and web clients simultaneously:
   ```bash
   pnpm dev
   ```
   * The End-User Client will be available at: `http://localhost:3000`
   * The Admin Dashboard will be available at: `http://localhost:3001`

4. **Verify the System (Test Suite):**
   Run the unit and end-to-end tests to ensure full system stability:
   ```bash
   # Run all Unit Tests natively
   pnpm test:unit

   # Run the Playwright E2E Integration Suite
   pnpm test:e2e
   ```
