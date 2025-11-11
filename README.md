<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1z2YoOHV_cdImX64Fp8eiTAfccUmmU2rV

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to GitHub Pages

This app is configured for automatic deployment to GitHub Pages.

### Automatic Deployment

The app will automatically deploy to GitHub Pages when you push to the `main` branch. The deployment workflow is configured in `.github/workflows/deploy.yml`.

**Setup Steps:**

1. Go to your repository settings on GitHub
2. Navigate to **Settings** > **Pages**
3. Under **Build and deployment**, select:
   - **Source**: GitHub Actions
4. Push to the `main` branch to trigger the deployment

Your app will be available at: `https://silasmoon.github.io/Lunagis/`

### Manual Deployment

You can also manually deploy using:

```bash
npm run deploy
```

This will build and deploy the app to the `gh-pages` branch.
