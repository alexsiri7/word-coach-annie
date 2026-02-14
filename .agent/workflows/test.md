---
description: How to run tests for Word Coach Annie
---

To ensure stability and prevent regressions, use the following commands to run the test suite.

### Running all tests
// turbo
1. Run all tests within the docker container:
```bash
docker compose exec app npm run test:run
```

### Running specific tests
If you are working on a specific feature, you can run only the relevant tests:
```bash
docker compose exec app npx vitest run src/__tests__/projects.test.ts
docker compose exec app npx vitest run src/__tests__/structure.test.ts
docker compose exec app npx vitest run src/__tests__/api-routes.test.ts
```

### Watching tests
To keep tests running while you develop:
```bash
docker compose exec app npm run test
```

### Database Schema Changes
If you modify `prisma/schema.prisma`, ensure you regenerate the client and push changes to the database:
```bash
docker compose exec app npx prisma generate
docker compose exec app npx prisma db push
docker compose restart app
```
And then run the tests again to verify.
