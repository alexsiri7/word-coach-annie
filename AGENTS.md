# Agent Instructions

## Infrastructure & Deployment

This project is deployed on **Railway**.

### Railway CLI

The `railway` CLI is installed at `/home/asiri/.local/bin/railway`. Use it to check deploy status, view logs, and manage services.

```bash
# Check latest deployment status
railway logs --service word-coach-annie --environment production --num 50

# View staging logs
railway logs --service word-coach-annie --environment staging --num 50

# View deploy history
railway deployment list --service word-coach-annie --environment production

# Trigger a redeploy
railway up --service word-coach-annie --environment production

# Check service status
railway status
```

### Project Details

| Key | Value |
|-----|-------|
| Project | word-coach-annie |
| Project ID | 12353dbf-5c67-4fad-a07d-a11155662b6d |
| Service | word-coach-annie |
| Service ID | 2ace1020-2351-4980-b263-c62f222513e5 |
| Environments | production, staging |

### Deploy Flow

1. PR merged to `main`
2. Railway auto-deploys from GitHub (connected repo)
3. Build → health check → traffic switches

### Troubleshooting Deploys

When a deploy fails:
1. Check build logs: `railway logs --service word-coach-annie --environment production --num 100`
2. Check Railway dashboard: `railway open`
3. Check deploy history: `railway deployment list --service word-coach-annie`
4. Common issues: missing env vars, build failures, health check timeout
