# Testing

The web application has 331 tests across 35 test files, using [Vitest](https://vitest.dev/) and [Testing Library](https://testing-library.com/).

## Running Tests

```bash
cd web

# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# With coverage report
npm run test:coverage
```

## Test Philosophy

The test suite focuses on the boundaries where bugs are most likely: data transformations, API request/response contracts, and user-facing component behavior. Pure utility functions (formatting, conversions, weather comparison) have near-complete coverage because they're cheap to test and easy to break. UI components are tested for rendering correctness and user interactions, not visual styling.

Tests mock Supabase at the client level so they verify query construction and response handling without hitting a real database. API route tests mock both Supabase and external services (Gemini, WeatherAPI, Resend) to verify auth checks, input validation, and error handling in isolation.

## Test Organization

| Area | Files | What's covered |
|------|-------|----------------|
| **API routes** | `src/app/api/{chat,keepalive,weather}/route.test.ts` | Request validation, auth checks, response shapes, error handling |
| **Components** | `src/components/__tests__/*.test.tsx` (16 files) | Rendering, user interactions, loading/error states, props |
| **Contexts** | `src/contexts/__tests__/{DevicesContext,ThemeContext}.test.tsx` | Provider behavior, state updates, consumer hooks |
| **Hooks** | `src/hooks/__tests__/useTimeRange.test.ts` | Time range logic, preset/custom/deployment modes |
| **Lib utilities** | `src/lib/__tests__/*.test.ts` (9 files) | Conversions, formatting, auth helpers, weather comparison, AI tools |
| **Supabase queries** | `src/lib/supabase/queries/__tests__/*.test.ts` | Query construction for devices, readings, deployments |

## Coverage

High-coverage areas include the Supabase query layer (95-100%), API routes (78-93%), utility modules (format, weatherZip, weatherCompare, conversions, auth), and core components (AuthGate, FilterToolbar, ChatShell, DeviceManager, ExportModal).

| Category | Statements | Branches | Functions | Lines |
|----------|-----------|----------|-----------|-------|
| **Overall** | 72% | 64% | 68% | 74% |
| API routes | 78-93% | 67-88% | 83-100% | 79-93% |
| Components | 68% | 62% | 59% | 71% |
| Lib/utilities | 78% | 70% | 80% | 80% |
| Supabase queries | 95-100% | 84-100% | 100% | 98-100% |

## CI Pipeline

Three GitHub Actions workflows run on every push to `main`/`develop` and on pull requests:

- **ci.yml** -- Lint, typecheck, and run the full test suite with coverage. Coverage reports are uploaded as build artifacts.
- **arduino.yml** -- Compiles the Arduino sketch to verify firmware builds.
- **audit.yml** -- Checks for known vulnerabilities in npm dependencies.
