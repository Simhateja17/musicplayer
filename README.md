# Music Player V2 with PostgreSQL Database

A modern music player that fetches songs from a PostgreSQL database hosted on Neon DB, instead of hard-coding the playlist.

## Features

- Dynamic playlist loading from PostgreSQL database
- Support for WAV and MP3 audio formats
- Shuffle and repeat functionality
- Progress bar with seeking
- Download links for both MP3 and WAV formats
- Responsive design for both desktop and mobile
- Fallback playlist if database is unavailable

## Setup Instructions

### 1. Database Setup (Neon DB)

1. Go to [Neon DB](https://neon.tech/) and create a new database
2. Run the SQL commands from `database-schema.sql` to create the songs table and insert the initial data
3. Copy your database connection string

### 2. Local Development Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

3. Edit the `.env` file and add your Neon DB connection string:
   ```
   DATABASE_URL=postgresql://username:password@your-neon-host/your-database?sslmode=require
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Visit `http://localhost:3000` to see the music player

### 3. Using the Embed Code

The music player can be embedded in any HTML page (including Webflow) using the code in `webflow-embed.html`. 

#### For Webflow Integration:
1. Copy the entire contents of `webflow-embed.html`
2. Paste it into a Webflow Embed element
3. Update the API URL in the JavaScript code to point to your deployed server

#### For Other Websites:
1. Copy the contents of `webflow-embed.html`
2. Update the API base URL in the `getApiBaseUrl()` function
3. Embed the code in your website

## API Endpoints

- `GET /api/songs` - Get all songs
- `GET /api/songs/:id` - Get a specific song by ID
- `POST /api/songs` - Add a new song

### Adding New Songs

You can add new songs via the API or directly in the database:

```bash
curl -X POST http://localhost:3000/api/songs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Song Title",
    "artist": "Artist Name",
    "streamingUrl": "https://example.com/song.wav",
    "downloadUrl": "https://example.com/song.wav",
    "artworkUrl": "https://example.com/artwork.jpg",
    "wavUrl": "https://example.com/song.wav"
  }'
```

## Current Songs in Database

The database comes pre-loaded with these Digitized Sensation tracks:

1. **"Ain't Got No Time"** - https://ds-stream.b-cdn.net/ds-vol1/aintgottime.wav
2. **"All the Way Real"** - https://ds-stream.b-cdn.net/ds-vol1/allthewayreal.wav
3. **"Amant de Coeur"** - https://ds-stream.b-cdn.net/ds-vol1/amantdecoeur.wav

## Deployment

### For Production Deployment:

1. Deploy the server to a platform like Vercel, Heroku, or Railway
2. Update the `getApiBaseUrl()` function in `webflow-embed.html` with your production API URL
3. Make sure your Neon DB is accessible from your deployed server

## File Structure

- `server.js` - Express server with PostgreSQL integration
- `database-schema.sql` - Database schema and initial data
- `webflow-embed.html` - Complete embed code for the music player
- `package.json` - Node.js dependencies
- `.env.example` - Environment variables template

## Technologies Used

- **Frontend**: HTML, CSS, JavaScript, Plyr.js
- **Backend**: Node.js, Express
- **Database**: PostgreSQL (Neon DB)
- **Libraries**: pg (PostgreSQL client), cors, dotenv
# musicplayer
