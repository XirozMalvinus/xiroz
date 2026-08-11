"use strict";
// ================================================================
//  TYPES
// ================================================================
// ================================================================
//  DATA
// ================================================================
var GENRES = ['Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'R&B', 'Indie'];
var SONG_DATA = [
    { id: 's1', title: 'Blinding Lights', artist: 'The Weeknd', genre: 'Pop', duration: 200, cover: '🌃' },
    { id: 's2', title: 'Shape of You', artist: 'Ed Sheeran', genre: 'Pop', duration: 233, cover: '🔴' },
    { id: 's3', title: 'Bohemian Rhapsody', artist: 'Queen', genre: 'Rock', duration: 354, cover: '🎸' },
    { id: 's4', title: 'Starboy', artist: 'The Weeknd', genre: 'Pop', duration: 230, cover: '⭐' },
    { id: 's5', title: 'Lose Yourself', artist: 'Eminem', genre: 'Hip-Hop', duration: 326, cover: '🎤' },
    { id: 's6', title: 'Smells Like Teen Spirit', artist: 'Nirvana', genre: 'Rock', duration: 300, cover: '🤘' },
    { id: 's7', title: 'Get Lucky', artist: 'Daft Punk', genre: 'Electronic', duration: 247, cover: '💫' },
    { id: 's8', title: 'Take Five', artist: 'Dave Brubeck', genre: 'Jazz', duration: 340, cover: '🎷' },
    { id: 's9', title: 'Clair de Lune', artist: 'Debussy', genre: 'Classical', duration: 302, cover: '🌙' },
    { id: 's10', title: 'Blinding Lights (Remix)', artist: 'The Weeknd', genre: 'Pop', duration: 210, cover: '🌌' },
    { id: 's11', title: 'HUMBLE', artist: 'Kendrick Lamar', genre: 'Hip-Hop', duration: 177, cover: '🏆' },
    { id: 's12', title: 'Boogie Wonderland', artist: 'Earth Wind & Fire', genre: 'R&B', duration: 278, cover: '🕺' },
    { id: 's13', title: 'Mr. Brightside', artist: 'The Killers', genre: 'Indie', duration: 222, cover: '😎' },
    { id: 's14', title: 'One More Time', artist: 'Daft Punk', genre: 'Electronic', duration: 300, cover: '🔄' },
    { id: 's15', title: 'All of Me', artist: 'John Legend', genre: 'R&B', duration: 270, cover: '❤️' },
    { id: 's16', title: 'Creep', artist: 'Radiohead', genre: 'Indie', duration: 248, cover: '👀' },
];
// ================================================================
//  STATE
// ================================================================
var songs = SONG_DATA.map(function (s) { return ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    genre: s.genre,
    duration: s.duration,
    cover: s.cover,
    isFavorite: false,
    isDownloaded: false,
}); });
var downloads = [];
var currentSongId = null;
var isPlaying = false;
var currentProgress = 0;
var currentDuration = 0;
var audio = null;
// ================================================================
//  DOM REFS
// ================================================================
var $ = function (sel) { return document.querySelector(sel); };
var $$ = function (sel) { return document.querySelectorAll(sel); };
var splash = $('#splash');
var app = $('#app');
var songGrid = $('#songGrid');
var featuredGrid = $('#featuredGrid');
var exploreGrid = $('#exploreGrid');
var libraryGrid = $('#libraryGrid');
var downloadList = $('#downloadList');
var genreGrid = $('#genreGrid');
var libraryStats = $('#libraryStats');
var searchInput = $('#searchInput');
var sortSelect = $('#sortSelect');
var downloadBadge = $('#downloadBadge');
var playerTitle = $('#playerTitle');
var playerArtist = $('#playerArtist');
var playerThumb = $('#playerThumb');
var playerFav = $('#playerFav');
var playBtn = $('#playBtn');
var prevBtn = $('#prevBtn');
var nextBtn = $('#nextBtn');
var downloadBtn = $('#downloadBtn');
var progressBar = $('#progressBar');
var progressSlider = $('#progressSlider');
var timeCurrent = $('#timeCurrent');
var timeTotal = $('#timeTotal');
var volumeBtn = $('#volumeBtn');
var themeToggle = $('#themeToggle');
var navLinks = $$('.nav-link');
var viewSections = {
    home: $('#view-home'),
    explore: $('#view-explore'),
    library: $('#view-library'),
    downloads: $('#view-downloads'),
};
var pageTitle = $('#pageTitle');
var pageSub = $('#pageSub');
// ================================================================
//  SPLASH SCREEN
// ================================================================
function showSplash() {
    splash.classList.remove('fade-out');
    splash.style.display = 'flex';
}
function hideSplash() {
    splash.classList.add('fade-out');
    setTimeout(function () {
        splash.style.display = 'none';
        app.classList.remove('hidden');
        app.classList.add('visible');
    }, 800);
}
// ================================================================
//  UTILITY
// ================================================================
function formatTime(seconds) {
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return "".concat(m, ":").concat(s.toString().padStart(2, '0'));
}
function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = a[i];
        a[i] = a[j];
        a[j] = temp;
    }
    return a;
}
function getSongById(id) {
    return songs.find(function (s) { return s.id === id; });
}
function getDownloadCount() {
    return downloads.filter(function (d) { return d.status === 'complete'; }).length;
}
function getFavoriteCount() {
    return songs.filter(function (s) { return s.isFavorite; }).length;
}
// ================================================================
//  RENDER FUNCTIONS
// ================================================================
function renderSongCard(song, grid) {
    var _a;
    var card = document.createElement('div');
    card.className = 'song-card';
    card.dataset.id = song.id;
    var isFeatured = Math.random() > 0.7;
    card.innerHTML = "\n    ".concat(isFeatured ? '<span class="card-badge">\u2B50 Featured</span>' : '', "\n    <div class=\"card-thumb\">").concat(song.cover, "</div>\n    <div class=\"card-title\">").concat(song.title, "</div>\n    <div class=\"card-artist\">").concat(song.artist, "</div>\n    <div class=\"card-meta\">\n      <span>").concat(song.genre, "</span>\n      <span>").concat(formatTime(song.duration), "</span>\n    </div>\n    <div class=\"card-actions\">\n      <button class=\"play-card-btn\" data-id=\"").concat(song.id, "\">\n        <svg viewBox=\"0 0 24 24\" fill=\"currentColor\" width=\"14\" height=\"14\"><polygon points=\"5 3 19 12 5 21 5 3\"/></svg>\n        Play\n      </button>\n      <button class=\"download-card-btn\" data-id=\"").concat(song.id, "\">\n        <svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" width=\"14\" height=\"14\"><path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"/><polyline points=\"7 10 12 15 17 10\"/><line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"/></svg>\n        ").concat(song.isDownloaded ? '✓ Downloaded' : 'Download', "\n      </button>\n    </div>\n  ");
    (_a = card.querySelector('.play-card-btn')) === null || _a === void 0 ? void 0 : _a.addEventListener('click', function (e) {
        e.stopPropagation();
        playSong(song.id);
    });
    card.querySelector('.download-card-btn') === null || card.querySelector('.download-card-btn') === void 0 ? void 0 : card.querySelector('.download-card-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        startDownload(song.id);
    });
    card.addEventListener('click', function () { return playSong(song.id); });
    grid.appendChild(card);
}
function renderAllSongs() {
    songGrid.innerHTML = '';
    var sorted = getSortedSongs();
    sorted.forEach(function (s) { return renderSongCard(s, songGrid); });
}
function renderFeatured() {
    featuredGrid.innerHTML = '';
    var shuffled = shuffleArray(songs).slice(0, 6);
    shuffled.forEach(function (s) { return renderSongCard(s, featuredGrid); });
}
function renderExplore() {
    genreGrid.innerHTML = '';
    GENRES.forEach(function (g) {
        var chip = document.createElement('div');
        chip.className = 'genre-chip';
        chip.textContent = g;
        chip.addEventListener('click', function () {
            var filtered = songs.filter(function (s) { return s.genre === g; });
            exploreGrid.innerHTML = '';
            filtered.forEach(function (s) { return renderSongCard(s, exploreGrid); });
            exploreGrid.scrollIntoView({ behavior: 'smooth' });
        });
        genreGrid.appendChild(chip);
    });
    exploreGrid.innerHTML = '';
    var shuffled = shuffleArray(songs).slice(0, 12);
    shuffled.forEach(function (s) { return renderSongCard(s, exploreGrid); });
}
function renderLibrary() {
    var favs = songs.filter(function (s) { return s.isFavorite; });
    libraryStats.innerHTML = "\n    <div class=\"stat-card\">\n      <div class=\"stat-number\">".concat(songs.length, "</div>\n      <div class=\"stat-label\">Total Songs</div>\n    </div>\n    <div class=\"stat-card\">\n      <div class=\"stat-number\">").concat(favs.length, "</div>\n      <div class=\"stat-label\">Favorites</div>\n    </div>\n    <div class=\"stat-card\">\n      <div class=\"stat-number\">").concat(getDownloadCount(), "</div>\n      <div class=\"stat-label\">Downloaded</div>\n    </div>\n  ");
    libraryGrid.innerHTML = '';
    if (favs.length === 0) {
        libraryGrid.innerHTML = "<div class=\"text-[#888] text-center py-8\">No favorites yet. \u2764\uFE0F Tap the heart on a song!</div>";
    }
    else {
        favs.forEach(function (s) { return renderSongCard(s, libraryGrid); });
    }
}
function renderDownloads() {
    downloadList.innerHTML = '';
    if (downloads.length === 0) {
        downloadList.innerHTML = "<div class=\"text-[#888] text-center py-8\">No downloads yet. \u2B07\uFE0F Download a song to see it here.</div>";
        return;
    }
    downloads.forEach(function (d) {
        var _a;
        var item = document.createElement('div');
        item.className = 'download-item';
        var statusMap = {
            pending: '⏳ Pending',
            downloading: '⬇️ Downloading',
            complete: '✅ Complete',
            error: '❌ Error',
        };
        var statusClass = d.status === 'complete' ? 'complete' : d.status === 'downloading' ? 'downloading' : d.status === 'error' ? 'error' : '';
        item.innerHTML = "\n      <div class=\"dl-thumb\">".concat(((_a = songs.find(function (s) { return s.id === d.songId; })) === null || _a === void 0 ? void 0 : _a.cover) || '🎵', "</div>\n      <div class=\"dl-info\">\n        <div class=\"dl-title\">").concat(d.title, "</div>\n        <div class=\"dl-artist\">").concat(d.artist, "</div>\n      </div>\n      ").concat(d.status === 'downloading' ? "\n        <div class=\"dl-progress\">\n          <div class=\"dl-bar\" style=\"width:".concat(d.progress, "%\"></div>\n        </div>\n      " : '', "\n      <span class=\"dl-status ").concat(statusClass, "\">").concat(statusMap[d.status] || d.status, "</span>\n    ");
        downloadList.appendChild(item);
    });
    updateDownloadBadge();
}
function updateDownloadBadge() {
    var count = getDownloadCount();
    downloadBadge.textContent = String(count);
    downloadBadge.style.display = count > 0 ? 'inline-block' : 'none';
}
// ================================================================
//  SORT & FILTER
// ================================================================
function getSortedSongs() {
    var search = searchInput.value.toLowerCase().trim();
    var filtered = songs.filter(function (s) {
        return s.title.toLowerCase().includes(search) ||
            s.artist.toLowerCase().includes(search) ||
            s.genre.toLowerCase().includes(search);
    });
    var sortBy = sortSelect.value;
    if (sortBy === 'title')
        filtered.sort(function (a, b) { return a.title.localeCompare(b.title); });
    else if (sortBy === 'artist')
        filtered.sort(function (a, b) { return a.artist.localeCompare(b.artist); });
    else if (sortBy === 'duration')
        filtered.sort(function (a, b) { return a.duration - b.duration; });
    return filtered;
}
// ================================================================
//  PLAYER
// ================================================================
function playSong(id) {
    var song = getSongById(id);
    if (!song)
        return;
    currentSongId = id;
    playerTitle.textContent = song.title;
    playerArtist.textContent = song.artist;
    playerThumb.textContent = song.cover;
    currentDuration = song.duration;
    timeTotal.textContent = formatTime(song.duration);
    updateFavButton();
    currentProgress = 0;
    progressBar.style.width = '0%';
    progressSlider.value = '0';
    timeCurrent.textContent = '0:00';
    isPlaying = true;
    updatePlayButton();
    if (audio) {
        audio.pause();
        audio = null;
    }
    var progress = 0;
    var step = function () {
        if (!isPlaying || currentSongId !== id)
            return;
        progress += 0.5;
        if (progress >= song.duration) {
            progress = song.duration;
            isPlaying = false;
            updatePlayButton();
            return;
        }
        currentProgress = progress;
        var pct = (progress / song.duration) * 100;
        progressBar.style.width = "".concat(pct, "%");
        progressSlider.value = String(pct);
        timeCurrent.textContent = formatTime(progress);
        requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    $$('.song-card').forEach(function (c) { return c.style.borderColor = ''; });
    var cards = $$('.song-card');
    for (var _i = 0, cards_1 = cards; _i < cards_1.length; _i++) {
        var c = cards_1[_i];
        if (c.dataset.id === id) {
            c.style.borderColor = '#D94F14';
        }
    }
}
function togglePlay() {
    if (!currentSongId) {
        if (songs.length > 0)
            playSong(songs[0].id);
        return;
    }
    isPlaying = !isPlaying;
    updatePlayButton();
    if (isPlaying) {
        var song_1 = getSongById(currentSongId);
        if (!song_1)
            return;
        var progress_1 = currentProgress;
        var step_1 = function () {
            if (!isPlaying || currentSongId !== song_1.id)
                return;
            progress_1 += 0.5;
            if (progress_1 >= song_1.duration) {
                progress_1 = song_1.duration;
                isPlaying = false;
                updatePlayButton();
                return;
            }
            currentProgress = progress_1;
            var pct = (progress_1 / song_1.duration) * 100;
            progressBar.style.width = "".concat(pct, "%");
            progressSlider.value = String(pct);
            timeCurrent.textContent = formatTime(progress_1);
            requestAnimationFrame(step_1);
        };
        requestAnimationFrame(step_1);
    }
}
function updatePlayButton() {
    if (isPlaying) {
        playBtn.innerHTML = "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><rect x=\"6\" y=\"4\" width=\"4\" height=\"16\"/><rect x=\"14\" y=\"4\" width=\"4\" height=\"16\"/></svg>";
    }
    else {
        playBtn.innerHTML = "<svg viewBox=\"0 0 24 24\" fill=\"currentColor\"><polygon points=\"5 3 19 12 5 21 5 3\"/></svg>";
    }
}
function updateFavButton() {
    if (!currentSongId)
        return;
    var song = getSongById(currentSongId);
    if (!song)
        return;
    playerFav.classList.toggle('active', song.isFavorite);
}
function toggleFavorite() {
    if (!currentSongId)
        return;
    var song = getSongById(currentSongId);
    if (!song)
        return;
    song.isFavorite = !song.isFavorite;
    updateFavButton();
    renderLibrary();
    renderAllSongs();
    renderFeatured();
    renderExplore();
    renderDownloads();
}
function prevSong() {
    if (!currentSongId)
        return;
    var idx = songs.findIndex(function (s) { return s.id === currentSongId; });
    if (idx > 0)
        playSong(songs[idx - 1].id);
}
function nextSong() {
    if (!currentSongId)
        return;
    var idx = songs.findIndex(function (s) { return s.id === currentSongId; });
    if (idx < songs.length - 1)
        playSong(songs[idx + 1].id);
}
// ================================================================
//  DOWNLOAD
// ================================================================
function startDownload(songId) {
    var song = getSongById(songId);
    if (!song)
        return;
    if (song.isDownloaded) {
        toast('Already downloaded ✓');
        return;
    }
    var existing = downloads.find(function (d) { return d.songId === songId && d.status !== 'complete'; });
    if (existing) {
        toast('Already downloading...');
        return;
    }
    var task = {
        id: "dl_".concat(Date.now()),
        songId: song.id,
        title: song.title,
        artist: song.artist,
        progress: 0,
        status: 'downloading',
    };
    downloads.push(task);
    renderDownloads();
    toast("\u2B07\uFE0F Downloading \"".concat(song.title, "\"..."));
    var prog = 0;
    var interval = setInterval(function () {
        prog += 5 + Math.random() * 15;
        if (prog >= 100) {
            prog = 100;
            clearInterval(interval);
            task.status = 'complete';
            task.progress = 100;
            song.isDownloaded = true;
            renderDownloads();
            renderAllSongs();
            renderFeatured();
            renderExplore();
            renderLibrary();
            toast("\u2705 \"".concat(song.title, "\" downloaded!"));
            return;
        }
        task.progress = Math.min(prog, 100);
        renderDownloads();
    }, 300 + Math.random() * 400);
}
// ================================================================
//  NAVIGATION
// ================================================================
function navigateTo(view) {
    navLinks.forEach(function (link) { return link.classList.remove('active'); });
    var targetLink = Array.from(navLinks).find(function (link) { return link.dataset.view === view; });
    if (targetLink)
        targetLink.classList.add('active');
    Object.entries(viewSections).forEach(function (_a) {
        var key = _a[0], el = _a[1];
        el.classList.toggle('active', key === view);
    });
    var titles = {
        home: 'Home',
        explore: 'Explore',
        library: 'Library',
        downloads: 'Downloads',
    };
    var subs = {
        home: 'Discover your favorite tracks',
        explore: 'Find new music by genre',
        library: 'Your saved and loved songs',
        downloads: 'All your downloaded tracks',
    };
    pageTitle.textContent = titles[view];
    pageSub.textContent = subs[view];
    if (view === 'explore')
        renderExplore();
    if (view === 'library')
        renderLibrary();
    if (view === 'downloads')
        renderDownloads();
}
// ================================================================
//  TOAST
// ================================================================
function toast(message) {
    var existing = document.querySelector('.toast-float');
    if (existing)
        existing.remove();
    var div = document.createElement('div');
    div.className = 'toast-float';
    div.textContent = message;
    Object.assign(div.style, {
        position: 'fixed',
        bottom: '90px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: '#1A1A1A',
        color: '#FFFFFF',
        padding: '10px 24px',
        borderRadius: '9999px',
        border: '1px solid #2A2A2A',
        fontSize: '13px',
        fontWeight: '500',
        zIndex: '9999',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        animation: 'toastIn 0.3s ease both',
        fontFamily: 'Inter, sans-serif',
    });
    document.body.appendChild(div);
    setTimeout(function () {
        div.style.opacity = '0';
        div.style.transform = 'translateX(-50%) translateY(20px)';
        div.style.transition = 'all 0.3s ease';
        setTimeout(function () { return div.remove(); }, 400);
    }, 2800);
}
var styleSheet = document.createElement('style');
styleSheet.textContent = "\n  @keyframes toastIn {\n    0% { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }\n    100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }\n  }\n";
document.head.appendChild(styleSheet);
// ================================================================
//  INIT
// ================================================================
function init() {
    showSplash();
    setTimeout(hideSplash, 3200);
    renderAllSongs();
    renderFeatured();
    renderExplore();
    renderLibrary();
    renderDownloads();
    searchInput.addEventListener('input', renderAllSongs);
    sortSelect.addEventListener('change', renderAllSongs);
    navLinks.forEach(function (link) {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            var view = link.dataset.view;
            if (view)
                navigateTo(view);
        });
    });
    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', prevSong);
    nextBtn.addEventListener('click', nextSong);
    playerFav.addEventListener('click', toggleFavorite);
    downloadBtn.addEventListener('click', function () {
        if (currentSongId)
            startDownload(currentSongId);
    });
    progressSlider.addEventListener('input', function (e) {
        var val = parseFloat(e.target.value);
        if (!currentSongId)
            return;
        var song = getSongById(currentSongId);
        if (!song)
            return;
        var newTime = (val / 100) * song.duration;
        currentProgress = newTime;
        progressBar.style.width = "".concat(val, "%");
        timeCurrent.textContent = formatTime(newTime);
    });
    themeToggle.addEventListener('click', function () {
        document.body.classList.toggle('light-theme');
        var isLight = document.body.classList.contains('light-theme');
        document.documentElement.style.setProperty('--bg', isLight ? '#F5F5F5' : '#0A0A0A');
        document.documentElement.style.setProperty('--surface', isLight ? '#FFFFFF' : '#111111');
        document.documentElement.style.setProperty('--text', isLight ? '#1A1A1A' : '#FFFFFF');
    });
    document.addEventListener('keydown', function (e) {
        if (e.target instanceof HTMLInputElement)
            return;
        if (e.key === ' ' || e.key === 'Space') {
            e.preventDefault();
            togglePlay();
        }
        if (e.key === 'ArrowRight')
            nextSong();
        if (e.key === 'ArrowLeft')
            prevSong();
    });
    console.log('\uD83C\uDFB5 Music Dashboard loaded!');
    console.log("\uD83D\uDCC0 ".concat(songs.length, " songs ready."));
}
document.addEventListener('DOMContentLoaded', init);
