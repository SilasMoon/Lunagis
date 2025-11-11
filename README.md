<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Temporal Data Viewer

A geospatial temporal data visualization application built with React, Vite, and D3.js. Visualize time-series data with geographic map visualization and time series plots.

View your app in AI Studio: https://ai.studio/apps/drive/1z2YoOHV_cdImX64Fp8eiTAfccUmmU2rV

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   ```bash
   npm install
   ```

2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key (optional)

3. Run the app:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:5173`

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## GitHub Pages Deployment

This app is configured for automatic deployment to GitHub Pages using GitHub Actions.

### Setup

1. **Enable GitHub Pages** in your repository settings:
   - Go to Settings > Pages
   - Under "Build and deployment", set Source to "GitHub Actions"

2. **Push to main branch** - The deployment workflow will automatically trigger on every push to the `main` branch

3. **Manual deployment** - You can also manually trigger the deployment from the Actions tab

### Deployment Workflow

The `.github/workflows/deploy.yml` workflow will:
- Build the application with Vite
- Upload the build artifacts
- Deploy to GitHub Pages

Your app will be available at: `https://[username].github.io/Lunagis/`

### Configuration

The app is configured with the base path `/Lunagis/` in `vite.config.ts` to work correctly with GitHub Pages subdirectory deployment.
