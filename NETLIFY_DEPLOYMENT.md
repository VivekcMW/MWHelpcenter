# Netlify Deployment Guide

This guide explains how to deploy the MW Helpcenter to Netlify.

## Prerequisites

- Netlify account (https://netlify.com)
- GitHub repository with this code pushed
- Environment variables configured (see Configuration section)

## Deployment Setup

### Option 1: Deploy from Git (Recommended)

1. Connect your GitHub repository to Netlify:
   - Go to https://app.netlify.com
   - Click "New site from Git"
   - Select GitHub and authorize
   - Choose the `MW-Helpcenter` repository

2. Netlify will auto-detect the configuration from `netlify.toml`:
   - **Build command**: `pnpm build`
   - **Publish directory**: `apps/web/build/client`
   - **Functions directory**: `netlify/functions`

3. Configure environment variables in the Netlify UI:
   - Go to Site Settings → Environment Variables
   - Add the following (see Configuration section below for values):
     - `CONTENT_MODE`
     - `SITE_URL`
     - `SUPPORT_EMAIL`
     - `SANITY_PROJECT_ID`
     - `SANITY_DATASET`
     - `SANITY_READ_TOKEN`

4. Deploy:
   - Click "Deploy site"
   - Netlify will build and deploy automatically

### Option 2: Deploy with Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Authenticate with your Netlify account
netlify login

# Deploy
netlify deploy --prod
```

## Configuration

### Environment Variables

Set these in Netlify Site Settings → Environment Variables:

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `CONTENT_MODE` | Yes | `sanity` | `demo` for test fixtures, `sanity` for live content |
| `SITE_URL` | Yes | `https://mwhelpcenter.netlify.app` | Public site URL for security headers |
| `SUPPORT_EMAIL` | No | `support@movingwalls.com` | Email address for support page mailto link |
| `SANITY_PROJECT_ID` | If using Sanity | `abc123xyz` | Your Sanity project ID |
| `SANITY_DATASET` | If using Sanity | `production` | Sanity dataset name |
| `SANITY_READ_TOKEN` | If using Sanity (private dataset) | `skyd123...` | Optional read token for private datasets |
| `FEEDBACK_DB_PATH` | No | Not supported on Netlify | Feedback/votes require persistent storage; not available in Functions |

### Important Notes

1. **Feedback Database**: Netlify Functions don't support persistent local storage. The feedback voting feature will be disabled in production unless you use:
   - A separate database service (PostgreSQL, MongoDB)
   - Modify the app to use an external API
   - Use a different hosting provider (Vercel, Railway, Render)

2. **Node.js Version**: The app requires Node.js 22.23.3 or higher. Netlify defaults to the version specified in `.nvmrc` and `netlify.toml`.

3. **Build Time**: First deployment may take 2-5 minutes (installs pnpm, dependencies, builds app).

## Troubleshooting

### 404 Error on Site

This usually means the serverless function isn't working. Check:
1. In Netlify Dashboard → Deploys → Build logs for errors
2. In Netlify Dashboard → Functions to verify `server` function was built
3. Ensure all environment variables are set correctly

### Build Fails

Common causes:
- Wrong Node.js version (needs 22.23.3+)
- Missing pnpm installation
- Sanity credentials incorrect

Check build logs in Netlify Dashboard → Deploys.

### Function Timeout

If requests time out (30-second limit):
1. Check if Sanity API is responding slowly
2. Increase function timeout in `netlify.toml` `[functions."server"]` section (max 60 seconds)
3. Consider offloading heavy operations to scheduled functions or external services

### Environment Variables Not Available

Ensure you've:
1. Set variables in Netlify UI (not just local `.env`)
2. Redeployed after adding variables (new deployment needed for changes)
3. Variable names match exactly (they're case-sensitive)

## Monitoring

### Logs

View real-time logs:
- Go to Netlify Dashboard → Functions → `server`
- Click "View logs" to see function execution logs

### Analytics

Netlify provides basic analytics:
- Site Settings → Analytics to view traffic patterns
- Useful for monitoring deployment health

## Rollback

To rollback to a previous deployment:
1. In Netlify Dashboard → Deploys
2. Find the working deployment
3. Click the "..." menu
4. Select "Publish deploy"

## Further Reading

- [Netlify Functions Documentation](https://docs.netlify.com/functions/overview/)
- [Netlify Environment Variables](https://docs.netlify.com/environment-variables/overview/)
- [React Router Server-Side Rendering](https://reactrouter.com/en/start/framework)
