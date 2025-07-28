-- MUSIC LIBRARY SYSTEM - DATABASE SCHEMA EXTENSIONS

-- Add user playlist management tables
CREATE TABLE IF NOT EXISTS user_playlists (
    id SERIAL PRIMARY KEY,
    memberstack_user_id VARCHAR(255) NOT NULL,
    song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    tier_level INTEGER NOT NULL,
    added_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    added_month VARCHAR(7) NOT NULL, -- Format: "2025-01" for monthly tracking
    
    -- Ensure a user can't add the same song twice
    UNIQUE(memberstack_user_id, song_id)
);

-- Track user tier status and monthly limits
CREATE TABLE IF NOT EXISTS user_tier_status (
    memberstack_user_id VARCHAR(255) PRIMARY KEY,
    tier_level INTEGER NOT NULL,
    songs_selected_this_month INTEGER DEFAULT 0,
    current_month VARCHAR(7) NOT NULL, -- Format: "2025-01"
    last_reset_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    signup_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_playlists_user_id ON user_playlists(memberstack_user_id);
CREATE INDEX IF NOT EXISTS idx_user_playlists_song_id ON user_playlists(song_id);
CREATE INDEX IF NOT EXISTS idx_user_playlists_tier_level ON user_playlists(tier_level);
CREATE INDEX IF NOT EXISTS idx_user_playlists_added_month ON user_playlists(added_month);
CREATE INDEX IF NOT EXISTS idx_user_tier_status_tier_level ON user_tier_status(tier_level);
CREATE INDEX IF NOT EXISTS idx_user_tier_status_current_month ON user_tier_status(current_month);

-- Function to get current month in YYYY-MM format
CREATE OR REPLACE FUNCTION get_current_month() 
RETURNS VARCHAR(7) AS $$
BEGIN
    RETURN TO_CHAR(CURRENT_DATE, 'YYYY-MM');
END;
$$ LANGUAGE plpgsql;

-- Function to calculate max allowed tracks for a user
CREATE OR REPLACE FUNCTION calculate_max_tracks(
    p_tier_level INTEGER,
    p_signup_date TIMESTAMP
) RETURNS INTEGER AS $$
DECLARE
    tier_initial_tracks INTEGER;
    tier_monthly_tracks INTEGER;
    months_since_signup INTEGER;
    max_tracks INTEGER;
BEGIN
    -- Define tier configurations
    CASE p_tier_level
        WHEN 1 THEN 
            tier_initial_tracks := 10;
            tier_monthly_tracks := 5;
        WHEN 2 THEN 
            tier_initial_tracks := 20;
            tier_monthly_tracks := 10;
        WHEN 3 THEN 
            tier_initial_tracks := 30;
            tier_monthly_tracks := 15;
        WHEN 4 THEN 
            -- Unlimited tier
            RETURN -1;
        ELSE 
            -- Default to tier 1
            tier_initial_tracks := 10;
            tier_monthly_tracks := 5;
    END CASE;
    
    -- Calculate months since signup
    months_since_signup := EXTRACT(YEAR FROM AGE(CURRENT_DATE, p_signup_date::DATE)) * 12 + 
                          EXTRACT(MONTH FROM AGE(CURRENT_DATE, p_signup_date::DATE));
    
    -- Calculate max tracks
    max_tracks := tier_initial_tracks + (tier_monthly_tracks * months_since_signup);
    
    RETURN max_tracks;
END;
$$ LANGUAGE plpgsql;

-- Function to reset monthly track counts (to be called by a scheduled job)
CREATE OR REPLACE FUNCTION reset_monthly_track_counts()
RETURNS INTEGER AS $$
DECLARE
    current_month_str VARCHAR(7);
    reset_count INTEGER := 0;
BEGIN
    current_month_str := get_current_month();
    
    -- Update users who haven't been reset for the current month
    UPDATE user_tier_status 
    SET 
        songs_selected_this_month = 0,
        current_month = current_month_str,
        last_reset_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE current_month < current_month_str;
    
    GET DIAGNOSTICS reset_count = ROW_COUNT;
    
    RETURN reset_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update user_tier_status when songs are added/removed
CREATE OR REPLACE FUNCTION update_user_tier_status_trigger()
RETURNS TRIGGER AS $$
DECLARE
    current_month_str VARCHAR(7);
    current_count INTEGER;
BEGIN
    current_month_str := get_current_month();
    
    IF TG_OP = 'INSERT' THEN
        -- Update or insert user tier status
        INSERT INTO user_tier_status (
            memberstack_user_id, 
            tier_level, 
            songs_selected_this_month, 
            current_month
        ) VALUES (
            NEW.memberstack_user_id, 
            NEW.tier_level, 
            1, 
            current_month_str
        )
        ON CONFLICT (memberstack_user_id) DO UPDATE SET
            songs_selected_this_month = user_tier_status.songs_selected_this_month + 1,
            current_month = current_month_str,
            updated_at = CURRENT_TIMESTAMP;
            
        RETURN NEW;
        
    ELSIF TG_OP = 'DELETE' THEN
        -- Decrease count when song is removed
        UPDATE user_tier_status 
        SET 
            songs_selected_this_month = GREATEST(songs_selected_this_month - 1, 0),
            updated_at = CURRENT_TIMESTAMP
        WHERE memberstack_user_id = OLD.memberstack_user_id
        AND current_month = current_month_str;
        
        RETURN OLD;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS user_playlist_tier_status_trigger ON user_playlists;
CREATE TRIGGER user_playlist_tier_status_trigger
    AFTER INSERT OR DELETE ON user_playlists
    FOR EACH ROW
    EXECUTE FUNCTION update_user_tier_status_trigger();

-- View to get user playlist with song details
CREATE OR REPLACE VIEW user_playlist_with_songs AS
SELECT 
    up.id as playlist_id,
    up.memberstack_user_id,
    up.tier_level,
    up.added_date,
    up.added_month,
    s.id as song_id,
    s.title,
    s.artist,
    s.streaming_url,
    s.download_url,
    s.artwork_url,
    s.wav_url
FROM user_playlists up
JOIN songs s ON up.song_id = s.id
ORDER BY up.added_date DESC;

-- View to get user tier status with calculated limits
CREATE OR REPLACE VIEW user_tier_status_with_limits AS
SELECT 
    uts.*,
    calculate_max_tracks(uts.tier_level, uts.signup_date) as max_allowed_tracks,
    (SELECT COUNT(*) FROM user_playlists WHERE memberstack_user_id = uts.memberstack_user_id) as current_playlist_count
FROM user_tier_status uts;

-- Sample data migration (if needed) - Update existing songs table if missing WAV URLs
-- This ensures compatibility with your existing data
UPDATE songs 
SET wav_url = streaming_url 
WHERE wav_url IS NULL AND streaming_url IS NOT NULL;

-- Add some helper comments
COMMENT ON TABLE user_playlists IS 'Stores individual user playlists with tier-based access control';
COMMENT ON TABLE user_tier_status IS 'Tracks user tier information and monthly track selection limits';
COMMENT ON FUNCTION calculate_max_tracks IS 'Calculates maximum allowed tracks based on tier and signup date';
COMMENT ON FUNCTION reset_monthly_track_counts IS 'Resets monthly track counts - should be called by scheduled job';
COMMENT ON VIEW user_playlist_with_songs IS 'User playlists joined with full song information';
COMMENT ON VIEW user_tier_status_with_limits IS 'User tier status with calculated limits and current counts';
