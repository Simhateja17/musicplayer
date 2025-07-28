document.addEventListener('DOMContentLoaded', () => {
    // --- PLAYLIST DATA & LOGIC ---
    const playlist = [
        {
            title: 'Vinaro Bhagyamu',
            artist: 'a Keerthana, S. P. Balasubrahmanyam, Sril...',
            src: 'YOUR_FIRST_MP3_URL',
            artwork: 'URL_TO_YOUR_FIRST_ARTWORK',
            download_mp3: 'URL_TO_MP3_FOR_DOWNLOAD',
            download_wav: 'URL_TO_WAV_FOR_DOWNLOAD'
        },
        {
            title: 'Another Song Title',
            artist: 'Another Artist',
            src: 'YOUR_SECOND_MP3_URL',
            artwork: 'URL_TO_YOUR_SECOND_ARTWORK',
            download_mp3: 'URL_TO_SECOND_MP3_FOR_DOWNLOAD',
            download_wav: 'URL_TO_SECOND_WAV_FOR_DOWNLOAD'
        }
        // Add more tracks here
    ];

    let currentTrackIndex = 0;

    const trackTitleEl = document.getElementById('trackTitle');
    const trackArtistEl = document.getElementById('trackArtist');
    const albumArtEl = document.getElementById('albumArt');

    // --- DOWNLOAD BUTTONS (Optional, add to HTML first) ---
    // For now, let's just create the logic.
    const downloadMp3Btn = document.getElementById('downloadMp3Btn');
    const downloadWavBtn = document.getElementById('downloadWavBtn');

    function loadTrack(trackIndex) {
        const track = playlist[trackIndex];

        // Update player source
        player.source = {
            type: 'audio',
            title: track.title,
            sources: [
                {
                    src: track.src,
                    type: 'audio/mp3',
                },
            ],
        };

        // Update UI elements
        trackTitleEl.textContent = track.title;
        trackArtistEl.textContent = track.artist;
        albumArtEl.src = track.artwork;
        
        // Update download links (we'll add buttons later)
        downloadMp3Btn.href = track.download_mp3;
        downloadWavBtn.href = track.download_wav;

        currentTrackIndex = trackIndex;
        player.play();
    }

    // --- 1. GET ALL OUR CUSTOM PLAYER ELEMENTS ---
    const customPlayer = document.getElementById('custom-player-container');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const progressBar = document.getElementById('progressBar');
    const currentTimeEl = document.getElementById('currentTime');
    const totalDurationEl = document.getElementById('totalDuration');
    const shuffleBtn = document.getElementById('shuffleBtn');
    const repeatBtn = document.getElementById('repeatBtn');

    // Define the SVG icons for play and pause
    const playIcon = `<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"></path></svg>`;
    const pauseIcon = `<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`;

    // --- 2. INITIALIZE PLYR ---
    const player = new Plyr('#audioPlayer', {
        // We hide Plyr's default controls using CSS, but this is a fallback
        controls: [], 
        // We don't want Plyr to manage the progress bar its own way
        // We'll do it manually
    });

    // Make player instance available for debugging
    window.player = player;

    // --- 3. HELPER FUNCTION TO FORMAT TIME ---
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // --- 4. WIRE UP EVENT LISTENERS ---

    // Play/Pause button
    playPauseBtn.addEventListener('click', () => {
        if (player.playing) {
            player.pause();
        } else {
            player.play();
        }
    });

    // Update play/pause button icon based on player state
    player.on('play', () => {
        playPauseBtn.innerHTML = pauseIcon;
    });

    player.on('pause', () => {
        playPauseBtn.innerHTML = playIcon;
    });

    // When the player is ready, update duration
    player.on('ready', () => {
        const duration = player.duration;
        if (isFinite(duration)) {
            totalDurationEl.textContent = formatTime(duration);
            progressBar.max = duration;
        }
    });
    
    // As the track plays, update the current time and progress bar
    player.on('timeupdate', () => {
        const currentTime = player.currentTime;
        currentTimeEl.textContent = formatTime(currentTime);
        progressBar.value = currentTime;
    });

    // Allow seeking by dragging the progress bar
    progressBar.addEventListener('input', (e) => {
        player.currentTime = e.target.value;
    });

    // Shuffle and Repeat button toggling
    shuffleBtn.addEventListener('click', () => {
        shuffleBtn.classList.toggle('active');
        // Add your shuffle logic here in a later phase
    });

    repeatBtn.addEventListener('click', () => {
        repeatBtn.classList.toggle('active');
        // The 'loop' property on the player controls repeating
        player.loop = !player.loop; 
    });

    // Next button
    nextBtn.addEventListener('click', () => {
        currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
        loadTrack(currentTrackIndex);
    });

    // Previous button
    prevBtn.addEventListener('click', () => {
        currentTrackIndex = (currentTrackIndex - 1 + playlist.length) % playlist.length;
        loadTrack(currentTrackIndex);
    });

    // Automatically play the next track when the current one ends
    player.on('ended', () => {
        nextBtn.click();
    });

    // --- INITIALIZE FIRST TRACK ---
    loadTrack(0);
    // Manually pause it so it doesn't autoplay on page load
    player.pause();

});
