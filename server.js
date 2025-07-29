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

// API endpoint to get user's playlist
app.get('/api/user-playlist/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(`
      SELECT s.id, s.title, s.artist, s.streaming_url, s.download_url, 
             s.artwork_url, s.wav_url, up.added_at
      FROM user_playlists up
      JOIN songs s ON up.song_id = s.id
      WHERE up.user_id = $1
      ORDER BY up.added_at DESC
    `, [userId]);
    
    const playlist = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      streamingUrl: row.streaming_url,
      downloadUrl: row.download_url || row.streaming_url,
      artworkUrl: row.artwork_url || 'https://via.placeholder.com/500',
      wavUrl: row.wav_url,
      addedAt: row.added_at
    }));

    res.json(playlist);
  } catch (error) {
    console.error('Error fetching user playlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint to add songs to user playlist (bulk)
app.post('/api/user-playlist/bulk', async (req, res) => {
  try {
    const { userId, songIds, tierLevel } = req.body;
    
    if (!userId || !songIds || !Array.isArray(songIds)) {
      return res.status(400).json({ error: 'Invalid request data' });
    }

    // Check current playlist count
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM user_playlists WHERE user_id = $1',
      [userId]
    );
    
    const currentCount = parseInt(countResult.rows[0].count);
    
    // Define tier limits
    const tierLimits = {
      1: 15, // 10 initial + 5 monthly (simplified)
      2: 30, // 20 initial + 10 monthly
      3: 45, // 30 initial + 15 monthly
      4: -1  // Unlimited
    };
    
    const maxTracks = tierLimits[tierLevel] || tierLimits[1];
    
    if (maxTracks !== -1 && (currentCount + songIds.length) > maxTracks) {
      return res.status(400).json({ 
        error: `Adding these songs would exceed your tier limit of ${maxTracks} tracks` 
      });
    }

    // Add songs to playlist
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const songId of songIds) {
        await client.query(
          'INSERT INTO user_playlists (user_id, song_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [userId, songId]
        );
      }
      
      await client.query('COMMIT');
      res.json({ success: true, message: `Added ${songIds.length} songs to playlist` });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Error adding songs to playlist:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API endpoint to get user dashboard data
app.get('/api/user-dashboard/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get playlist count
    const playlistResult = await pool.query(
      'SELECT COUNT(*) as count FROM user_playlists WHERE user_id = $1',
      [userId]
    );
    
    // Get recent activity (last 5 added songs)
    const recentResult = await pool.query(`
      SELECT s.title, s.artist, up.added_at
      FROM user_playlists up
      JOIN songs s ON up.song_id = s.id
      WHERE up.user_id = $1
      ORDER BY up.added_at DESC
      LIMIT 5
    `, [userId]);
    
    const dashboardData = {
      playlistCount: parseInt(playlistResult.rows[0].count),
      recentActivity: recentResult.rows.map(row => ({
        title: row.title,
        artist: row.artist,
        addedAt: row.added_at
      }))
    };

    res.json(dashboardData);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the webflow embed page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/webflow-embed.html');
});

// Serve the music library
app.get('/library', (req, res) => {
  res.sendFile(__dirname + '/music-library.html');
});

// Serve the user dashboard
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/user-dashboard.html');
});

// Serve the webflow integration guide
app.get('/webflow-guide', (req, res) => {
  res.sendFile(__dirname + '/webflow-integration-guide.html');
});

app.listen(port, () => {
  console.log(`Music player server running on port ${port}`);
  console.log(`Visit http://localhost:${port} to see the music player`);
  console.log(`Visit http://localhost:${port}/library for the music library`);
  console.log(`Visit http://localhost:${port}/dashboard for the user dashboard`);
  console.log(`Visit http://localhost:${port}/webflow-guide for integration guide`);
});
