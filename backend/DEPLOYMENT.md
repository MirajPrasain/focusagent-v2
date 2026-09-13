# HackRU Application - Docker & Render Deployment Guide

This guide will help you dockerize and deploy your FastAPI application with computer vision capabilities to Render.

## Prerequisites

- Docker installed on your local machine
- A Render account (free tier available at [render.com](https://render.com))
- Git repository (GitHub, GitLab, or Bitbucket)

## Files Created for Deployment

1. **Dockerfile** - Multi-stage Docker build configuration
2. **render.yaml** - Render deployment configuration
3. **.dockerignore** - Excludes unnecessary files from Docker image

## Local Testing with Docker

### Build the Docker image:
```bash
docker build -t hackru-app .
```

### Run the container locally:
```bash
docker run -p 8000:8000 hackru-app
```

### Test the application:
Visit `http://localhost:8000` in your browser or:
```bash
curl http://localhost:8000
```

### Run with environment variables:
```bash
docker run -p 8000:8000 \
  -e GOOGLE_API_KEY=your_api_key_here \
  hackru-app
```

## Deploying to Render

### Method 1: Using render.yaml (Recommended)

1. **Push your code to GitHub:**
   ```bash
   git add .
   git commit -m "Add Docker and Render configuration"
   git push origin main
   ```

2. **Create New Web Service on Render:**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click "New +" → "Blueprint"
   - Connect your GitHub repository
   - Render will automatically detect `render.yaml`
   - Click "Apply" to deploy

3. **Configure Environment Variables:**
   - In Render dashboard, go to your service
   - Navigate to "Environment" tab
   - Add any required API keys or secrets:
     - `GOOGLE_API_KEY` (if using Google Generative AI)
     - Any other environment variables your app needs

### Method 2: Manual Web Service Creation

1. **Push your code to GitHub**

2. **Create New Web Service:**
   - Go to Render Dashboard
   - Click "New +" → "Web Service"
   - Connect your repository

3. **Configure the service:**
   - **Name:** hackru-app
   - **Runtime:** Docker
   - **Region:** Choose closest to your users
   - **Branch:** main (or your default branch)
   - **Dockerfile Path:** ./Dockerfile
   - **Docker Context:** .

4. **Instance Type:**
   - Free tier: Limited resources, good for testing
   - Starter: $7/month, better performance
   - Standard: More resources for production

5. **Environment Variables:**
   Add any required variables in the Environment section

6. **Deploy:**
   Click "Create Web Service"

## Environment Variables

Add these in Render dashboard under Environment tab:

```
GOOGLE_API_KEY=your_google_api_key_here
PORT=8000
PYTHON_VERSION=3.12
```

## Important Notes

### Model Files
The `yolov5su.pt` model file is included in the build. If it's large (>500MB), consider:
1. Downloading it at runtime from cloud storage
2. Using Render's disk storage
3. Using a smaller model variant

### Memory Requirements
- Computer vision apps can be memory-intensive
- Free tier: 512MB RAM (may not be sufficient)
- Starter tier: 2GB RAM (recommended minimum)
- Monitor memory usage in Render dashboard

### Build Time
- First build may take 10-20 minutes due to CV dependencies
- Subsequent builds are faster (uses layer caching)

### Health Checks
The Dockerfile includes a health check. Render will:
- Monitor application health
- Restart if unhealthy
- Show status in dashboard

## Troubleshooting

### Build Failures
1. Check build logs in Render dashboard
2. Verify all dependencies in requirements.txt
3. Ensure Dockerfile paths are correct

### Runtime Errors
1. Check application logs in Render
2. Verify environment variables are set
3. Check memory usage (upgrade plan if needed)

### WebSocket Issues
- Ensure your frontend connects to `wss://` (not `ws://`) for HTTPS
- Update CORS settings if needed in `main.py`

## Monitoring

- **Logs:** Available in Render dashboard under "Logs" tab
- **Metrics:** CPU, Memory usage in "Metrics" tab
- **Events:** Deployment history in "Events" tab

## Scaling

To handle more traffic:
1. Go to service settings in Render
2. Increase instance count (horizontal scaling)
3. Upgrade plan for more resources (vertical scaling)

## Costs

- **Free Tier:** 
  - 750 hours/month free
  - Spins down after inactivity
  - Limited resources

- **Starter Plan ($7/month):**
  - Always on
  - Better performance
  - Recommended for production

## Support Resources

- [Render Documentation](https://render.com/docs)
- [FastAPI Deployment Guide](https://fastapi.tiangolo.com/deployment/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

## Next Steps After Deployment

1. Set up custom domain (optional)
2. Configure CI/CD for automatic deployments
3. Set up monitoring and alerts
4. Configure backup strategies
5. Implement proper logging and error tracking

## Local Development vs Production

The Docker setup works for both:
- **Development:** Run locally with `docker run`
- **Production:** Render builds and runs automatically

Remember to keep your `.env` file local and use Render's environment variables for production secrets!
