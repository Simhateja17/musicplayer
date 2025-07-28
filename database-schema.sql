
CREATE TABLE IF NOT EXISTS songs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) NOT NULL,
    streaming_url TEXT NOT NULL,
    download_url TEXT,
    artwork_url TEXT,
    wav_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


INSERT INTO songs (title, artist, streaming_url, download_url, artwork_url, wav_url) VALUES
('Ain''t Got No Time', 'Digitized Sensation', 'https://ds-stream.b-cdn.net/ds-vol1/aintgottime.wav', 'https://ds-stream.b-cdn.net/ds-vol1/aintgottime.wav', 'https://via.placeholder.com/500?text=Ain''t+Got+No+Time', 'https://ds-stream.b-cdn.net/ds-vol1/aintgottime.wav'),
('All the Way Real', 'Digitized Sensation', 'https://ds-stream.b-cdn.net/ds-vol1/allthewayreal.wav', 'https://ds-stream.b-cdn.net/ds-vol1/allthewayreal.wav', 'https://via.placeholder.com/500?text=All+the+Way+Real', 'https://ds-stream.b-cdn.net/ds-vol1/allthewayreal.wav'),
('Amant de Coeur', 'Digitized Sensation', 'https://ds-stream.b-cdn.net/ds-vol1/amantdecoeur.wav', 'https://ds-stream.b-cdn.net/ds-vol1/amantdecoeur.wav', 'https://via.placeholder.com/500?text=Amant+de+Coeur', 'https://ds-stream.b-cdn.net/ds-vol1/amantdecoeur.wav');


CREATE INDEX idx_songs_title_artist ON songs(title, artist);