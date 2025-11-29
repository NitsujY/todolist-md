# Google Drive Setup Guide

To enable Google Drive integration in TodoMD, you need to create a project in the Google Cloud Console and obtain a Client ID and API Key.

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Click on the project dropdown at the top left and select **New Project**.
3. Give your project a name (e.g., "TodoMD") and click **Create**.

## Step 2: Enable Google Drive API

1. In the sidebar, go to **APIs & Services** > **Library**.
2. Search for "Google Drive API".
3. Click on **Google Drive API** and then click **Enable**.

## Step 3: Configure OAuth Consent Screen

1. In the sidebar, go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** (unless you have a Google Workspace organization) and click **Create**.
3. Fill in the required fields:
   - **App name**: TodoMD
   - **User support email**: Your email
   - **Developer contact information**: Your email
4. Click **Save and Continue**.
5. Under **Scopes**, click **Add or Remove Scopes**.
6. Search for and select `.../auth/drive.file` (See, edit, create, and delete only the specific Google Drive files you use with this app).
7. Click **Update**, then **Save and Continue**.
8. Add your email as a **Test User** so you can log in while the app is in testing mode.
9. Click **Save and Continue**.

## Step 4: Create Credentials

1. In the sidebar, go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **API Key**.
   - Copy the generated API Key. This is your **API Key**.
   - (Optional) You can restrict the key to only use the Google Drive API for better security.
3. Click **Create Credentials** > **OAuth client ID**.
4. Select **Web application** as the Application type.
5. Name it "TodoMD Web Client".
6. Under **Authorized JavaScript origins**, add the URL where your app is hosted.
   - For local development: `http://localhost:5173` (or your port)
   - For production: `https://your-app-domain.com`
7. Click **Create**.
8. Copy the **Client ID** (it ends with `.apps.googleusercontent.com`).

## Step 5: Configure TodoMD

1. Open TodoMD.
2. Go to **Settings**.
3. Click the **Settings icon** next to the Google Drive option.
4. Paste your **Client ID** and **API Key**.
5. Click **Save & Connect**.

You should now be able to sign in with your Google account and sync your markdown files!
