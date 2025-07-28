# Music Library System - Setup Guide

This document outlines how to set up and deploy the complete music library system with tiered access control.

## System Overview

The music library system consists of:
- **User Dashboard** (`user-dashboard.html`) - Personal control center
- **Music Library** (`music-library.html`) - Song selection interface  
- **Backend API** (`music-library-backend.js`) - Server with Neon DB integration
- **Database Extensions** (`database-extensions.sql`) - User playlist tables

## Tier Structure

Based on the Memberstack configuration:

| Tier | Name | Initial Songs | Monthly Addition | Features |
|------|------|---------------|------------------|----------|
| 1 | Electric Blue | 10 | 5 | Streaming only |
| 2 | Neon Seduction | 20 | 10 | MP3 downloads + WAV streaming |
| 3 | Neon Oracle | 30 | 15 | Full downloads + creator features |
| 4 | Neon Muse | Unlimited | Unlimited | Premium features + custom tracks |

## Setup Instructions

### 1. Database Setup (Neon DB)

```sql
-- Run the database extensions
-- Execute database-extensions.sql in your Neon DB console
-- This creates the user_playlists and user_tier_status tables
```

### 2. Backend Deployment (Azure)

1. **Create Azure Web App**:
   ```bash
   # Install Azure CLI if not already installed
   npm install -g @azure/cli
   
   # Login to Azure
   az login
   
   # Create resource group
   az group create --name music-library-rg --location "East US"
   
   # Create App Service plan
   az appservice plan create --name music-library-plan --resource-group music-library-rg --sku B1 --is-linux
   
   # Create web app
   az webapp create --resource-group music-library-rg --plan music-library-plan --name your-music-library-api --runtime "NODE|18-lts"
   ```

2. **Configure Environment Variables**:
   ```bash
   # Set database connection string
   az webapp config appsettings set --resource-group music-library-rg --name your-music-library-api --settings DATABASE_URL="your-neon-db-connection-string"
   
   # Set Node environment
   az webapp config appsettings set --resource-group music-library-rg --name your-music-library-api --settings NODE_ENV="production"
   ```

3. **Deploy Backend**:
   ```bash
   # Create package.json for backend
   npm init -y
   npm install express cors pg dotenv
   
   # Deploy using Azure CLI or GitHub Actions
   az webapp deployment source config-zip --resource-group music-library-rg --name your-music-library-api --src backend.zip
   ```

### 3. Update API URLs

Update the API base URLs in both HTML files:

**In `user-dashboard.html` and `music-library.html`**:
```javascript
function getApiBaseUrl() {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    }
    return 'https://your-music-library-api.azurewebsites.net'; // Replace with your Azure URL
}
```

### 4. Memberstack Integration

Update the tier mapping based on their actual plan IDs:

**In both HTML files, update the `getTierFromMemberstack` function**:
```javascript
function getTierFromMemberstack(member) {
    if (member.planConnections && member.planConnections.length > 0) {
        const planId = member.planConnections[0].planId;
        
        // Update these with their actual Memberstack plan IDs
        const planMapping = {
            'plan_id_for_electric_blue': 1,
            'plan_id_for_neon_seduction': 2,
            'plan_id_for_neon_oracle': 3,
            'plan_id_for_neon_muse': 4
        };
        
        return planMapping[planId] || 1;
    }
    return 1;
}
```

### 5. Webflow Integration

**Embed the Dashboard** (on their music player page):
```html
<div class="dashboard-section">
    <iframe src="path-to-your-hosted-dashboard.html" 
            width="100%" 
            height="600" 
            frameborder="0"
            title="User Dashboard">
    </iframe>
</div>
```

**Embed the Music Library** (separate page or modal):
```html
<div class="library-section">
    <iframe src="path-to-your-hosted-music-library.html" 
            width="100%" 
            height="800" 
            frameborder="0"
            title="Music Library">
    </iframe>
</div>
```

### 6. Update Existing Players

Modify the existing tier players to use user playlists instead of all songs:

**In each `webflow-embed-tierX.html` file, update the `loadPlaylist` function**:
```javascript
async function loadPlaylist() {
    try {
        // Get current user from Memberstack
        const member = await window.$memberstackDom.getCurrentMember();
        if (!member) {
            console.log('No user logged in');
            return;
        }
        
        // Fetch user's personal playlist instead of all songs
        const response = await fetch(`${getApiBaseUrl()}/api/user-playlist/${member.id}`);
        if (!response.ok) {
            throw new Error('Failed to fetch user playlist');
        }
        
        playlist = await response.json();
        
        if (playlist.length > 0) {
            loadTrack(0);
        } else {
            console.log('User playlist is empty');
            // Show message to browse music library
        }
    } catch (error) {
        console.error('Error loading user playlist:', error);
        // Fallback to original behavior if needed
    }
}
```

## API Endpoints

### Songs
- `GET /api/songs` - Get all available songs
- `GET /api/songs/:id` - Get single song

### User Playlists
- `GET /api/user-playlist/:userId` - Get user's playlist
- `POST /api/user-playlist` - Add single song to playlist
- `POST /api/user-playlist/bulk` - Add multiple songs to playlist
- `DELETE /api/user-playlist/:userId/:songId` - Remove song from playlist
- `DELETE /api/user-playlist/:userId` - Clear entire playlist

### User Tier Status
- `GET /api/user-tier-status/:userId` - Get user's tier status and limits
- `POST /api/user-tier-status` - Create/update user tier status

### Admin
- `POST /api/admin/reset-monthly-counts` - Reset monthly track counts
- `GET /api/admin/stats` - Get system statistics

## Monthly Reset Job

Set up a scheduled job to reset monthly track counts:

**Azure Function or Logic App**:
```javascript
// Call this endpoint monthly (first day of each month)
POST https://your-music-library-api.azurewebsites.net/api/admin/reset-monthly-counts
```

## Security Considerations

1. **Authentication**: Validate Memberstack tokens on backend
2. **Rate Limiting**: Implement rate limiting for API endpoints
3. **Input Validation**: Validate all user inputs
4. **CORS**: Configure CORS properly for your domains
5. **HTTPS**: Ensure all communications use HTTPS

## Testing

1. **Test User Flow**:
   - User signs up with different tiers
   - Access dashboard and library
   - Add/remove songs within limits
   - Test monthly reset functionality

2. **Test Integration**:
   - Verify Memberstack authentication
   - Test tier-based restrictions
   - Validate player integration

## Monitoring

Set up monitoring for:
- API response times
- Database connection health
- User activity and errors
- Monthly reset job execution

## Support

The system includes comprehensive error handling and user feedback:
- Loading states for all operations
- Clear error messages
- Tier limit notifications
- Success confirmations

This system provides a complete, scalable solution for tiered music access with user playlist management.
