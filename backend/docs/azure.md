# Deploy to Azure (App Service + Azure Database for PostgreSQL)

## 1) Provision Azure resources

```bash
# Login
az login
az account set --subscription <SUBSCRIPTION_ID>

# Resource group
az group create -n allin1-rg -l centralindia

# PostgreSQL Flexible Server
az postgres flexible-server create \
  -g allin1-rg -n allin1-pg -l centralindia \
  --tier Burstable --sku-name Standard_B1ms \
  --version 16 --storage-size 32 \
  --admin-user pgadmin --admin-password <StrongPassword>

# Allow all Azure services or your IP (simplified)
az postgres flexible-server firewall-rule create \
  -g allin1-rg -s allin1-pg -n allowAllAzureIps --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0

# Compose DATABASE_URL
# postgresql://pgadmin:<StrongPassword>@allin1-pg.postgres.database.azure.com:5432/allin1?sslmode=require

# App Service (Linux, Node 20)
az appservice plan create -g allin1-rg -n allin1-plan --is-linux --sku B1
az webapp create -g allin1-rg -p allin1-plan -n allin1-api --runtime "NODE|20-lts"
```

## 2) Configure settings

```bash
az webapp config appsettings set -g allin1-rg -n allin1-api --settings \
  NODE_ENV=production \
  PORT=4000 \
  JWT_SECRET=<generate_a_secret> \
  DATABASE_URL="postgresql://pgadmin:<StrongPassword>@allin1-pg.postgres.database.azure.com:5432/allin1?sslmode=require"
```

## 3) Build and deploy

- Add the server folder as its own repo or deploy from root specifying `server/`.

```bash
cd server
npm install
npx prisma generate
npx prisma migrate deploy

# One-time: Zip deploy
zip -r deploy.zip . -x "node_modules/*"
az webapp deployment source config-zip -g allin1-rg -n allin1-api --src deploy.zip
```

## 4) Startup command

Set startup command so App Service runs the correct directory:

```bash
az webapp config set -g allin1-rg -n allin1-api --startup-file "pm2 serve src/index.js --no-daemon || node src/index.js"
```

Alternatively set App Service setting: `SCM_DO_BUILD_DURING_DEPLOYMENT=true` and use `npm start`.

## 5) Health check

Enable Health Check at `/health` in App Service settings for auto-heal.

## 6) Useful Notes

- Use `prisma migrate deploy` on each deployment.
- For local dev with Docker: run a Postgres container and set `DATABASE_URL` accordingly.
- Protect JWT secret; rotate credentials regularly.
