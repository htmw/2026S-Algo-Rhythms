##  PR Self-Review Checklist*Complete these checks before requesting a review to ensure a smooth integration.



###  Security & Environment

- [ ] **No Secrets:** Confirmed no `.env` files or hardcoded credentials (API keys, DB strings) are committed.

- [ ] **Data Privacy:** Verified that no sensitive user data is logged.



###  Code Quality (TypeScript)

- [ ] **Strict Typing:** No `any` types used. All interfaces and types are explicitly defined.

- [ ] **Contract Alignment:** Field names and JSON structures match the API documentation. 



###  Integration & Testing

- [ ] **Dependencies:** No unnecessary changes to `package.json` or `lock` files.

- [ ] **Logging:** Using structured Pino logging (`logger.info({ data }, 'message')`).

- [ ] **Local Build:** `npm run build` passes in the workspace.

- [ ] **Unit Tests:** `npm test` passes for the modified modules.