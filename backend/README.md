# AllIn1 Backend (Express + Prisma + PostgreSQL)

This backend powers the AllIn1 Cricket app. It provides REST APIs for authentication, profiles, matches, news, marketplace, notifications, badges, tournaments, streaming, video analysis (mock), and search.

- Runtime: Node.js 20+
- Framework: Express
- ORM: Prisma
- DB: PostgreSQL (Azure Flexible Server or Azure Cosmos DB for PostgreSQL)
- Auth: JWT (mock endpoints now; can plug real provider later)
- Deployment: Azure App Service + Azure Database for PostgreSQL

## Quick Start

```bash
cd server
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Default server runs on `http://localhost:4000`.

## Azure Deployment
- Create Azure PostgreSQL and set `DATABASE_URL`.
- Create Azure App Service (Linux, Node 20), set env vars, deploy via `az webapp up` or GitHub Actions.

See `./docs/azure.md` for step-by-step instructions.
