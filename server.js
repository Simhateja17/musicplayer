const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// PostgreSQL connection using Neon DB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Connected to Neon DB successfully');
  }
});

// API endpoint to get all songs
app.get('/api/songs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM songs ORDER BY created_at DESC');
    
    // Transform database results to match the frontend format
    const songs = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      streamingUrl: row.streaming_url,
      downloadUrl: row.download_url || row.streaming_url,
      artworkUrl: row.artwork_url || 'https://via.placeholder.com/500',
      wavUrl: row.wav_url
    }));

    res.json(songs);
  } catch (error) {
    console.error('Error fetching songs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint to get a specific song by ID
app.get('/api/songs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM songs WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Song not found' });
    }

    const song = {
      id: result.rows[0].id,
      title: result.rows[0].title,
      artist: result.rows[0].artist,
      streamingUrl: result.rows[0].streaming_url,
      downloadUrl: result.rows[0].download_url || result.rows[0].streaming_url,
      artworkUrl: result.rows[0].artwork_url || 'https://via.placeholder.com/500',
      wavUrl: result.rows[0].wav_url
    };

    res.json(song);
  } catch (error) {
    console.error('Error fetching song:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint to add a new song
app.post('/api/songs', async (req, res) => {
  try {
    const { title, artist, streamingUrl, downloadUrl, artworkUrl, wavUrl } = req.body;
    
    const result = await pool.query(
      'INSERT INTO songs (title, artist, streaming_url, download_url, artwork_url, wav_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [title, artist, streamingUrl, downloadUrl, artworkUrl, wavUrl]
    );

    const newSong = {
      id: result.rows[0].id,
      title: result.rows[0].title,
      artist: result.rows[0].artist,
      streamingUrl: result.rows[0].streaming_url,
      downloadUrl: result.rows[0].download_url,
      artworkUrl: result.rows[0].artwork_url,
      wavUrl: result.rows[0].wav_url
    };

    res.status(201).json(newSong);
  } catch (error) {
    console.error('Error adding song:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the webflow embed page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/webflow-embed.html');
});

app.listen(port, () => {
  console.log(`Music player server running on port ${port}`);
  console.log(`Visit http://localhost:${port} to see the music player`);
});
