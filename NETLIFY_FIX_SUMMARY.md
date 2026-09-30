# MW Helpcenter Netlify Deployment - Fix Summary

## What Was Wrong

Your site returned a 404 error because the Netlify deployment was incomplete. The app uses **React Router with Server-Side Rendering (SSR)**, which requires:

1. A server to handle requests (not just static files)
2. Proper serverless function configuration
3. Correct build output structure

Without these, Netlify couldn't serve the application.

## What Was Fixed

### 1. Created `netlify.toml` Configuration
- Specifies build command: `pnpm build`
- Tells Netlify to publish client assets to `apps/web/build/client`
- Configures serverless functions from `netlify/functions`
- Sets up HTTP redirects to route all requests through the function
- Configures caching headers for static assets

### 2. Created Netlify Serverless Function
**File**: `netlify/functions/server.js`

This function:
- Intercepts all HTTP requests from Netlify
- Converts them to Node.js Request format
- Passes them to React Router's handler
- Returns the rendered HTML response

### 3. Created GitHub Actions Workflow
**File**: `.github/workflows/deploy-netlify.yml`

Automatically:
- Runs tests and linting
- Builds the project
- Deploys to Netlify on every push to `main` branch

### 4. Created Deployment Documentation
**File**: `NETLIFY_DEPLOYMENT.md`

Complete guide including:
- Step-by-step deployment instructions
- Environment variables configuration
- Troubleshooting tips
- Monitoring and rollback procedures

## How to Deploy Now

### Quick Start (Recommended)

1. **Push to GitHub** (if not already done):
   ```bash
   git add netlify.toml netlify/functions/ NETLIFY_DEPLOYMENT.md .github/workflows/
   git commit -m "chore: Add Netlify deployment configuration"
   git push origin main
   ```

2. **Set up Netlify**:
   - Go to https://app.netlify.com
   - Click "New site from Git"
   - Select your GitHub repository
   - Netlify auto-detects `netlify.toml` config

3. **Configure Environment Variables**:
   In Netlify UI: Site Settings → Environment Variables
   
   **For Sanity CMS (Production)**:
   ```
   CONTENT_MODE = sanity
   SANITY_PROJECT_ID = your-project-id
   SANITY_DATASET = production
   SANITY_READ_TOKEN = (optional, if dataset is private)
   SUPPORT_EMAIL = support@movingwalls.com
   SITE_URL = https://your-site.netlify.app
   ```

   **For Demo Mode (Testing)**:
   ```
   CONTENT_MODE = demo
   SUPPORT_EMAIL = support@movingwalls.com
   SITE_URL = https://your-site.netlify.app
   ```

4. **Deploy**:
   - Netlify will build and deploy automatically
   - Check deployment status in Dashboard → Deploys

### Deploy from CLI (Alternative)

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Authenticate
netlify login

# Deploy to production
netlify deploy --prod
```

## Important Notes

### Feedback Feature Limitation
The feedback voting system (helpfulness ratings) requires persistent local storage. Netlify Serverless Functions don't support this. In production:

- Feedback feature is **disabled** automatically
- Users can still see the interface but votes won't be saved
- To enable feedback, migrate to a hosting provider that supports persistent storage:
  - **Vercel** (recommended for React Router)
  - **Railway**
  - **Render**
  - **Fly.io**
  - Traditional VPS/Node.js hosting

Alternatively, refactor the app to use an external database (MongoDB, PostgreSQL) for feedback storage.

### Performance
- Build time: ~2-5 minutes (includes dependency installation)
- Function timeout: 30 seconds (can increase to 60 in `netlify.toml`)
- Cold starts: First request after deployment may take 2-5 seconds

## Verification

After deployment, verify it's working:

1. Visit your Netlify URL (e.g., https://mwhelpcenter.netlify.app)
2. You should see the help center home page
3. Check browser console (F12 → Console) for any errors
4. Test navigation to different sections:
   - `/en` (English)
   - `/en/articles/getting-started` (Sample article)
   - `/en/search` (Search page)
   - `/en/support` (Support page)

## Troubleshooting

### Still Getting 404?

1. Check build succeeded:
   - Netlify Dashboard → Deploys → (latest) → View build log
   - Look for errors in the logs

2. Verify serverless function was built:
   - Netlify Dashboard → Functions → should see "server" listed
   - If not listed, check build logs for errors

3. Clear browser cache:
   - Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)

### Build Failing?

Common causes:
- **Wrong Node version**: Netlify uses system default. Check `.nvmrc` (needs 22.23.3+)
- **Missing env vars**: Some packages need environment variables at build time
- **Sanity credentials wrong**: Double-check `SANITY_PROJECT_ID` and token

## Next Steps

1. **Monitor logs**:
   - Netlify Dashboard → Functions → "server"
   - Watch for errors in production

2. **Set up monitoring**:
   - Enable Netlify Analytics (Site Settings → Analytics)
   - Monitor function execution times and errors

3. **Configure custom domain**:
   - Netlify Dashboard → Domain management
   - Add your custom domain
   - Set up automatic HTTPS (free with Let's Encrypt)

4. **Add branch previews** (optional):
   - Every PR will get a preview deployment
   - Great for testing before merging to main

## Support

For issues with:
- **Netlify**: Check [Netlify Docs](https://docs.netlify.com)
- **React Router**: Check [React Router Docs](https://reactrouter.com)
- **Build errors**: Check `.github/workflows/deploy-netlify.yml` for what the build expects

---

**Ready to deploy?** Push your changes to GitHub and Netlify will handle the rest! 🚀
