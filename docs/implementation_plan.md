# Phase 6: Continuous Integration & Deployment (CI/CD) Subplan

## 1. Analysis Findings
The repository already contains a `.github/workflows/ci.yml` file that runs Pytest for the backend and Vitest + Playwright for the frontend. However, it is missing critical pipeline steps that ensure the code quality and debugging capabilities we established in the earlier phases.

## 2. Issue Mapping & Improvements
1. **Missing Linting Gateway**: In Phase 1, we spent significant effort resolving `oxlint` warnings (unused variables, exhaustive-deps). The current CI pipeline does not run `npm run lint`, meaning developers can easily merge new linting errors.
2. **Missing Playwright Artifacts**: In Phase 5, we built complex UI resilience tests. When these tests fail in CI, developers will have no idea why unless Playwright uploads the trace videos and screenshots. The current `ci.yml` does not upload `playwright-report/` or `test-results/`.

## 3. Proposed Execution
I will modify `.github/workflows/ci.yml` using the `multi_replace_file_content` tool to:
- Add a new step: `Run Oxlint` (`npm run lint`) before the test steps.
- Add an `actions/upload-artifact@v4` step to capture Playwright reports, screenshots, and videos when E2E tests fail. This adheres strictly to `playwright-pro` CI best practices.

---
> [!IMPORTANT]
> **User Review Required**
> 
> Do you approve this CI/CD pipeline enhancement plan for the final Phase 6? If so, I will execute the changes!
