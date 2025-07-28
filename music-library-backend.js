const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
const corsOptions = {
    origin: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://music-player-hadbg3c8cwazh4gm.canadacentral-01.azurewebsites.net'
    ],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// Database connection (Neon DB)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.on('connect', () => {
    console.log('Connected to Neon database');
});

pool.on('error', (err) => {
    console.error('Database connection error:', err);
});

// Helper function to get current month in YYYY-MM format
function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Helper function to calculate max allowed tracks
function calculateMaxTracks(tierLevel, signupDate) {
    const tierConfig = {
        1: { initial: 10, monthly: 5 },
        2: { initial: 20, monthly: 10 },
        3: { initial: 30, monthly: 15 },
        4: { initial: -1, monthly: -1 } // Unlimited
    };

    const config = tierConfig[tierLevel] || tierConfig[1];
    
    if (config.initial === -1) return -1; // Unlimited

    const signup = new Date(signupDate);
    const now = new Date();
    const monthsDiff = (now.getFullYear() - signup.getFullYear()) * 12 + 
                      (now.getMonth() - signup.getMonth());

    return config.initial + (config.monthly * monthsDiff);
}

// =====================
// SONG ROUTES
// =====================

// Get all songs
app.get('/api/songs', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, title, artist, streaming_url, download_url, artwork_url, wav_url, created_at
            FROM songs 
            ORDER BY title ASC
        `);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching songs:', error);
        res.status(500).json({ error: 'Failed to fetch songs' });
    }
});

// Get single song
app.get('/api/songs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT * FROM songs WHERE id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Song not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching song:', error);
        res.status(500).json({ error: 'Failed to fetch song' });
    }
});

// =====================
// USER PLAYLIST ROUTES
// =====================

// Get user's playlist
app.get('/api/user-playlist/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(`
            SELECT 
                s.id, s.title, s.artist, s.streaming_url, s.download_url, 
                s.artwork_url, s.wav_url, up.added_date, up.tier_level
            FROM user_playlists up
            JOIN songs s ON up.song_id = s.id
            WHERE up.memberstack_user_id = $1
            ORDER BY up.added_date DESC
        `, [userId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching user playlist:', error);
        res.status(500).json({ error: 'Failed to fetch playlist' });
    }
});

// Add single song to user's playlist
app.post('/api/user-playlist', async (req, res) => {
    try {
        const { userId, songId, tierLevel } = req.body;
        
        if (!userId || !songId || !tierLevel) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check if user can add more songs
        const canAdd = await checkUserCanAddSongs(userId, tierLevel, 1);
        if (!canAdd.allowed) {
            return res.status(403).json({ error: canAdd.reason });
        }

        // Check if song already exists in playlist
        const existingCheck = await pool.query(`
            SELECT id FROM user_playlists 
            WHERE memberstack_user_id = $1 AND song_id = $2
        `, [userId, songId]);

        if (existingCheck.rows.length > 0) {
            return res.status(409).json({ error: 'Song already in playlist' });
        }

        // Add song to playlist
        const currentMonth = getCurrentMonth();
        const result = await pool.query(`
            INSERT INTO user_playlists (memberstack_user_id, song_id, tier_level, added_month)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [userId, songId, tierLevel, currentMonth]);

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding song to playlist:', error);
        res.status(500).json({ error: 'Failed to add song to playlist' });
    }
});

// Add multiple songs to user's playlist (bulk add)
app.post('/api/user-playlist/bulk', async (req, res) => {
    try {
        const { userId, songIds, tierLevel } = req.body;
        
        if (!userId || !songIds || !Array.isArray(songIds) || !tierLevel) {
            return res.status(400).json({ error: 'Missing required fields or invalid data' });
        }

        // Check if user can add this many songs
        const canAdd = await checkUserCanAddSongs(userId, tierLevel, songIds.length);
        if (!canAdd.allowed) {
            return res.status(403).json({ error: canAdd.reason });
        }

        // Check for existing songs
        const existingCheck = await pool.query(`
            SELECT song_id FROM user_playlists 
            WHERE memberstack_user_id = $1 AND song_id = ANY($2::int[])
        `, [userId, songIds]);

        const existingSongIds = existingCheck.rows.map(row => row.song_id);
        const newSongIds = songIds.filter(id => !existingSongIds.includes(id));

        if (newSongIds.length === 0) {
            return res.status(409).json({ error: 'All songs are already in playlist' });
        }

        // Add new songs to playlist
        const currentMonth = getCurrentMonth();
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const addedSongs = [];
            for (const songId of newSongIds) {
                const result = await client.query(`
                    INSERT INTO user_playlists (memberstack_user_id, song_id, tier_level, added_month)
                    VALUES ($1, $2, $3, $4)
                    RETURNING *
                `, [userId, songId, tierLevel, currentMonth]);
                
                addedSongs.push(result.rows[0]);
            }
            
            await client.query('COMMIT');
            
            res.status(201).json({
                message: `Successfully added ${addedSongs.length} song(s) to playlist`,
                addedSongs,
                skippedCount: existingSongIds.length
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('Error bulk adding songs:', error);
        res.status(500).json({ error: 'Failed to add songs to playlist' });
    }
});

// Remove song from user's playlist
app.delete('/api/user-playlist/:userId/:songId', async (req, res) => {
    try {
        const { userId, songId } = req.params;
        
        const result = await pool.query(`
            DELETE FROM user_playlists 
            WHERE memberstack_user_id = $1 AND song_id = $2
            RETURNING *
        `, [userId, songId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Song not found in playlist' });
        }

        res.json({ message: 'Song removed from playlist', removedSong: result.rows[0] });
    } catch (error) {
        console.error('Error removing song from playlist:', error);
        res.status(500).json({ error: 'Failed to remove song from playlist' });
    }
});

// Clear user's entire playlist
app.delete('/api/user-playlist/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const result = await pool.query(`
            DELETE FROM user_playlists 
            WHERE memberstack_user_id = $1
            RETURNING *
        `, [userId]);

        res.json({ 
            message: `Removed ${result.rows.length} song(s) from playlist`,
            removedSongs: result.rows 
        });
    } catch (error) {
        console.error('Error clearing playlist:', error);
        res.status(500).json({ error: 'Failed to clear playlist' });
    }
});

// =====================
// USER TIER STATUS ROUTES
// =====================

// Get user's tier status
app.get('/api/user-tier-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await pool.query(`
            SELECT * FROM user_tier_status WHERE memberstack_user_id = $1
        `, [userId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User tier status not found' });
        }
        
        const status = result.rows[0];
        const maxTracks = calculateMaxTracks(status.tier_level, status.signup_date);
        
        res.json({
            ...status,
            max_allowed_tracks: maxTracks
        });
    } catch (error) {
        console.error('Error fetching user tier status:', error);
        res.status(500).json({ error: 'Failed to fetch tier status' });
    }
});

// Create or update user's tier status
app.post('/api/user-tier-status', async (req, res) => {
    try {
        const { userId, tierLevel, currentMonth } = req.body;
        
        if (!userId || !tierLevel) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const monthToUse = currentMonth || getCurrentMonth();
        
        const result = await pool.query(`
            INSERT INTO user_tier_status (memberstack_user_id, tier_level, current_month, songs_selected_this_month)
            VALUES ($1, $2, $3, 0)
            ON CONFLICT (memberstack_user_id) DO UPDATE SET
                tier_level = $2,
                current_month = $3,
                updated_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [userId, tierLevel, monthToUse]);

        const status = result.rows[0];
        const maxTracks = calculateMaxTracks(status.tier_level, status.signup_date);
        
        res.json({
            ...status,
            max_allowed_tracks: maxTracks
        });
    } catch (error) {
        console.error('Error creating/updating tier status:', error);
        res.status(500).json({ error: 'Failed to create/update tier status' });
    }
});

// =====================
// UTILITY FUNCTIONS
// =====================

// Helper function to check if user can add songs
async function checkUserCanAddSongs(userId, tierLevel, songsToAdd) {
    try {
        // For unlimited tier (tier 4), always allow
        if (tierLevel === 4) {
            return { allowed: true };
        }

        // Get user's tier status
        const statusResult = await pool.query(`
            SELECT * FROM user_tier_status WHERE memberstack_user_id = $1
        `, [userId]);

        let userStatus;
        if (statusResult.rows.length === 0) {
            // Create initial status for new user
            const currentMonth = getCurrentMonth();
            const createResult = await pool.query(`
                INSERT INTO user_tier_status (memberstack_user_id, tier_level, current_month, songs_selected_this_month)
                VALUES ($1, $2, $3, 0)
                RETURNING *
            `, [userId, tierLevel, currentMonth]);
            userStatus = createResult.rows[0];
        } else {
            userStatus = statusResult.rows[0];
        }

        // Calculate max allowed tracks
        const maxTracks = calculateMaxTracks(userStatus.tier_level, userStatus.signup_date);

        // Get current playlist count
        const playlistResult = await pool.query(`
            SELECT COUNT(*) as count FROM user_playlists WHERE memberstack_user_id = $1
        `, [userId]);

        const currentCount = parseInt(playlistResult.rows[0].count);
        const remainingTracks = maxTracks - currentCount;

        if (remainingTracks < songsToAdd) {
            return {
                allowed: false,
                reason: `You can only add ${remainingTracks} more track(s) this month. You're trying to add ${songsToAdd}.`
            };
        }

        return { allowed: true };

    } catch (error) {
        console.error('Error checking user limits:', error);
        return { allowed: false, reason: 'Error checking user limits' };
    }
}

// =====================
// ADMIN/UTILITY ROUTES
// =====================

// Reset monthly track counts (should be called by scheduled job)
app.post('/api/admin/reset-monthly-counts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT reset_monthly_track_counts() as reset_count
        `);
        
        const resetCount = result.rows[0].reset_count;
        res.json({ 
            message: `Reset monthly track counts for ${resetCount} users`,
            resetCount 
        });
    } catch (error) {
        console.error('Error resetting monthly counts:', error);
        res.status(500).json({ error: 'Failed to reset monthly counts' });
    }
});

// Get system statistics
app.get('/api/admin/stats', async (req, res) => {
    try {
        const [songsResult, usersResult, playlistsResult, tierResult] = await Promise.all([
            pool.query('SELECT COUNT(*) as count FROM songs'),
            pool.query('SELECT COUNT(*) as count FROM user_tier_status'),
            pool.query('SELECT COUNT(*) as count FROM user_playlists'),
            pool.query(`
                SELECT tier_level, COUNT(*) as user_count 
                FROM user_tier_status 
                GROUP BY tier_level 
                ORDER BY tier_level
            `)
        ]);

        res.json({
            totalSongs: parseInt(songsResult.rows[0].count),
            totalUsers: parseInt(usersResult.rows[0].count),
            totalPlaylistItems: parseInt(playlistsResult.rows[0].count),
            usersByTier: tierResult.rows
        });
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// =====================
// ERROR HANDLING & SERVER START
// =====================

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Handle 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(port, () => {
    console.log(`Music Library Backend running on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    pool.end(() => {
        console.log('Database pool closed');
        process.exit(0);
    });
});

module.exports = app;
