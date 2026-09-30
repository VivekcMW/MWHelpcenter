# Netlify Deployment Quick Start

## 5-Minute Setup

### Step 1: Connect to Netlify
1. Go to https://app.netlify.com
2. Click "New site from Git"
3. Select GitHub → authorize → select **MW-Helpcenter** repository

### Step 2: Configure Build
- Netlify auto-detects from `netlify.toml` ✓
- No manual build settings needed

### Step 3: Set Environment Variables
Go to: **Site Settings → Environment Variables**

Copy-paste these into Netlify:

```
CONTENT_MODE = sanity
SANITY_PROJECT_ID = [your-project-id]
SANITY_DATASET = production
SUPPORT_EMAIL = support@movingwalls.com
SITE_URL = https://[your-site].netlify.app
```

(Leave `SANITY_READ_TOKEN` blank unless your dataset is private)

### Step 4: Deploy
Click "Deploy site" → Wait for build → Done! ✓

## Verify It Works

1. Visit your site URL
2. See the home page? ✓ Success!
3. Having issues? See troubleshooting below

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Still 404? | Hard refresh browser: `Cmd+Shift+R` |
| Build failed? | Check Netlify Dashboard → Deploys → View logs |
| No content showing? | Verify `SANITY_PROJECT_ID` is correct |
| Function not found? | Wait 5min, Netlify is building. Refresh. |

## Next Deployment

Every push to GitHub's `main` branch auto-deploys! 🎉

To deploy manually:
```bash
git push origin main
```

Check status: Netlify Dashboard → Deploys

## Need More Help?

See full guide: **[NETLIFY_DEPLOYMENT.md](./NETLIFY_DEPLOYMENT.md)**

---

**Questions?** Check the troubleshooting section or read the full deployment guide.
