# Systems Refactoring Walkthrough

I have completed the full systems assessment and implemented the surgical fixes for all the issues outlined in the diagnostic specification. Here is a walkthrough of what was accomplished:

## 1. The Credential Problem (Security)
- **Problem**: Plain SHA-256 was used for password hashing, and clients were dangerously minting JWTs via a shared secret.
- **Fix**: Replaced SHA-256 with `bcryptjs` for secure password hashing. Implemented an on-the-fly migration strategy to transparently migrate older SHA-256 hashes to bcrypt upon a successful login, ensuring zero downtime and strict backward compatibility. Added integration tests to strictly prove this vulnerability existed and is now mitigated. Also, removed client-side JWT generation (`createGrpcSessionToken`) and stripped the exported `JWT_SECRET` completely from memory. Clients now receive and securely store the server-generated `sessionToken`, preventing any client-side token forgery.

## 2. Query Performance Problem (N+1 Queries)
- **Problem**: Fetching feeds executed `O(N)` queries due to `Promise.all` mapping.
- **Fix**: Rewrote the iterative logic inside all feed/post services (`feed.service.ts`, `posts.service.ts`, `bookmarks.service.ts`, etc.) using Drizzle ORM's scalar subqueries via `.mapWith()`. We now resolve counts and `isLiked` statuses directly within a single database request.

## 3. Error Handling & Observability (Reliability)
- **Problem**: Manual `try/catch` boilerplate in all handlers swallowed actual errors and returned generic strings, preventing clients from receiving proper gRPC error codes.
- **Fix**: Implemented a centralized `withLogging` gRPC interceptor that safely catches runtime exceptions, formats them into `RpcError` instances, and outputs structured JSON logs appending a unique `traceId` onto every response's trailing metadata. I refactored all gRPC handlers and the respective TanStack client functions to remove the manual `try/catch` and `!success` boilerplate. Services now uniformly throw the custom `AppError` class to cleanly trigger standard gRPC mapped errors like `NOT_FOUND` or `UNAUTHENTICATED`. Also cleaned up all root repair scripts.

## 4. Test Infrastructure & Coverage Gaps (Tooling)
- **Problem**: E2E test scripts failed on Windows due to bash syntax (`&&`, `rm -rf`).
- **Fix**: Swapped hardcoded bash commands with `rimraf` and integrated `start-server-and-test` to spin up test servers across platforms securely.

## 5. Build Pipeline & Developer Experience (Tooling)
- **Problem**: Turborepo cache outputs were misaligned and no CI existed.
- **Fix**: Corrected the `outputs` configuration in `turbo.json` to map strictly to `dist/**` and `.next/**`. Created a fully functioning GitHub Actions workflow pipeline (`.github/workflows/ci.yml`) to validate PRs automatically on push, featuring strictly filtered typechecking and linting stages. Initialized a strict Git Pre-commit Hook leveraging `husky` and `lint-staged` so the codebase cannot be committed if any Biome lint failures are detected on staged files.

## Verification

All `pnpm test` tasks run perfectly, and the test suite maintains robust coverage across the newly refactored endpoints. Everything is detailed in the `known_issues.md` artifact per project requirements.
