// ================================================================
//  TYPES
// ================================================================

interface Song {
  id: string;
  title: string;
  artist: string;
  genre: string;
  duration: number; // seconds
  cover: string; // emoji or URL
  url?: string; // for demo, we use dummy
  isFavorite: boolean;
  isDownloaded: boolean;
}

interface DownloadTask {
  id: string;
  songId: string;
  title: string;
  artist: string;
  progress: number;
  status: 'pending' | 'downloading' | 'complete' | 'error';
}

// ================================================================
//  DATA
// ================================================================

const GENRES = ['Pop', 'Rock', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'R&B', 'Indie'];

const SONG_DATA: Omit<Song, 'isFavorite' | 'isDownloaded'>[] = [
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

let songs: Song[] = SONG_DATA.map(s => ({
  ...s,
  isFavorite: false,
  isDownloaded: false,
}));

let downloads: DownloadTask[] = [];
let currentSongId: string | null = null;
let isPlaying = false;
let currentProgress = 0;
let currentDuration = 0;
let audio: HTMLAudioElement | null = null;

// ================================================================
//  DOM REFS
// ================================================================

const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => document.querySelectorAll(sel) as NodeListOf<HTMLElement>;

const splash = $('#splash') as HTMLElement;
const app = $('#app') as HTMLElement;

const songGrid = $('#songGrid') as HTMLElement;
const featuredGrid = $('#featuredGrid') as HTMLElement;
const exploreGrid = $('#exploreGrid') as HTMLElement;
const libraryGrid = $('#libraryGrid') as HTMLElement;
const downloadList = $('#downloadList') as HTMLElement;
const genreGrid = $('#genreGrid') as HTMLElement;
const libraryStats = $('#libraryStats') as HTMLElement;
const searchInput = $('#searchInput') as HTMLInputElement;
const sortSelect = $('#sortSelect') as HTMLSelectElement;
const downloadBadge = $('#downloadBadge') as HTMLElement;

const playerTitle = $('#playerTitle') as HTMLElement;
const playerArtist = $('#playerArtist') as HTMLElement;
const playerThumb = $('#playerThumb') as HTMLElement;
const playerFav = $('#playerFav') as HTMLElement;
const playBtn = $('#playBtn') as HTMLElement;
const prevBtn = $('#prevBtn') as HTMLElement;
const nextBtn = $('#nextBtn') as HTMLElement;
const downloadBtn = $('#downloadBtn') as HTMLElement;
const progressBar = $('#progressBar') as HTMLElement;
const progressSlider = $('#progressSlider') as HTMLInputElement;
const timeCurrent = $('#timeCurrent') as HTMLElement;
const timeTotal = $('#timeTotal') as HTMLElement;
const volumeBtn = $('#volumeBtn') as HTMLElement;
const themeToggle = $('#themeToggle') as HTMLElement;

const navLinks = $$('.nav-link');
const viewSections = {
  home: $('#view-home') as HTMLElement,
  explore: $('#view-explore') as HTMLElement,
  library: $('#view-library') as HTMLElement,
  downloads: $('#view-downloads') as HTMLElement,
};
const pageTitle = $('#pageTitle') as HTMLElement;
const pageSub = $('#pageSub') as HTMLElement;

// ================================================================
//  SPLASH SCREEN
// ================================================================

function showSplash(): void {
  splash.classList.remove('fade-out');
  splash.style.display = 'flex';
}

function hideSplash(): void {
  splash.classList.add('fade-out');
  setTimeout(() => {
    splash.style.display = 'none';
    app.classList.remove('hidden');
    app.classList.add('visible');
  }, 800);
}

// ================================================================
//  UTILITY
// ================================================================

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getSongById(id: string): Song | undefined {
  return songs.find(s => s.id === id);
}

function getDownloadCount(): number {
  return downloads.filter(d => d.status === 'complete').length;
}

function getFavoriteCount(): number {
  return songs.filter(s => s.isFavorite).length;
}

// ================================================================
//  RENDER FUNCTIONS
// ================================================================

function renderSongCard(song: Song, grid: HTMLElement): void {
  const card = document.createElement('div');
  card.className = 'song-card';
  card.dataset.id = song.id;

  const isFeatured = Math.random() > 0.7;

  card.innerHTML = `
    ${isFeatured ? '<span class="card-badge">⭐ Featured</span>' : ''}
    <div class="card-thumb">${song.cover}</div>
    <div class="card-title">${song.title}</div>
    <div class="card-artist">${song.artist}</div>
    <div class="card-meta">
      <span>${song.genre}</span>
      <span>${formatTime(song.duration)}</span>
    </div>
    <div class="card-actions">
      <button class="play-card-btn" data-id="${song.id}">
        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Play
      </button>
      <button class="download-card-btn" data-id="${song.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${song.isDownloaded ? '✓ Downloaded' : 'Download'}
      </button>
    </div>
  `;

  // Play
  card.querySelector('.play-card-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    playSong(song.id);
  });

  // Download
  card.querySelector('.download-card-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    startDownload(song.id);
  });

  // Click card -> play
  card.addEventListener('click', () => playSong(song.id));

  grid.appendChild(card);
}

function renderAllSongs(): void {
  songGrid.innerHTML = '';
  const sorted = getSortedSongs();
  sorted.forEach(s => renderSongCard(s, songGrid));
}

function renderFeatured(): void {
  featuredGrid.innerHTML = '';
  const shuffled = shuffleArray(songs).slice(0, 6);
  shuffled.forEach(s => renderSongCard(s, featuredGrid));
}

function renderExplore(): void {
  // Genres
  genreGrid.innerHTML = '';
  GENRES.forEach(g => {
    const chip = document.createElement('div');
    chip.className = 'genre-chip';
    chip.textContent = g;
    chip.addEventListener('click', () => {
      const filtered = songs.filter(s => s.genre === g);
      exploreGrid.innerHTML = '';
      filtered.forEach(s => renderSongCard(s, exploreGrid));
      exploreGrid.scrollIntoView({ behavior: 'smooth' });
    });
    genreGrid.appendChild(chip);
  });

  // Default explore grid
  exploreGrid.innerHTML = '';
  const shuffled = shuffleArray(songs).slice(0, 12);
  shuffled.forEach(s => renderSongCard(s, exploreGrid));
}

function renderLibrary(): void {
  const favs = songs.filter(s => s.isFavorite);
  libraryStats.innerHTML = `
    <div class="stat-card">
      <div class="stat-number">${songs.length}</div>
      <div class="stat-label">Total Songs</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${favs.length}</div>
      <div class="stat-label">Favorites</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${getDownloadCount()}</div>
      <div class="stat-label">Downloaded</div>
    </div>
  `;

  libraryGrid.innerHTML = '';
  if (favs.length === 0) {
    libraryGrid.innerHTML = `<div class="text-[#888] text-center py-8">No favorites yet. ❤️ Tap the heart on a song!</div>`;
  } else {
    favs.forEach(s => renderSongCard(s, libraryGrid));
  }
}

function renderDownloads(): void {
  downloadList.innerHTML = '';
  if (downloads.length === 0) {
    downloadList.innerHTML = `<div class="text-[#888] text-center py-8">No downloads yet. ⬇️ Download a song to see it here.</div>`;
    return;
  }

  downloads.forEach(d => {
    const item = document.createElement('div');
    item.className = 'download-item';
    const statusMap = {
      pending: '⏳ Pending',
      downloading: '⬇️ Downloading',
      complete: '✅ Complete',
      error: '❌ Error',
    };
    const statusClass = d.status === 'complete' ? 'complete' : d.status === 'downloading' ? 'downloading' : d.status === 'error' ? 'error' : '';

    item.innerHTML = `
      <div class="dl-thumb">${songs.find(s => s.id === d.songId)?.cover || '🎵'}</div>
      <div class="dl-info">
        <div class="dl-title">${d.title}</div>
        <div class="dl-artist">${d.artist}</div>
      </div>
      ${d.status === 'downloading' ? `
        <div class="dl-progress">
          <div class="dl-bar" style="width:${d.progress}%"></div>
        </div>
      ` : ''}
      <span class="dl-status ${statusClass}">${statusMap[d.status] || d.status}</span>
    `;
    downloadList.appendChild(item);
  });

  updateDownloadBadge();
}

function updateDownloadBadge(): void {
  const count = getDownloadCount();
  downloadBadge.textContent = String(count);
  downloadBadge.style.display = count > 0 ? 'inline-block' : 'none';
}

// ================================================================
//  SORT & FILTER
// ================================================================

function getSortedSongs(): Song[] {
  const search = searchInput.value.toLowerCase().trim();
  let filtered = songs.filter(s =>
    s.title.toLowerCase().includes(search) ||
    s.artist.toLowerCase().includes(search) ||
    s.genre.toLowerCase().includes(search)
  );

  const sortBy = sortSelect.value;
  if (sortBy === 'title') filtered.sort((a, b) => a.title.localeCompare(b.title));
  else if (sortBy === 'artist') filtered.sort((a, b) => a.artist.localeCompare(b.artist));
  else if (sortBy === 'duration') filtered.sort((a, b) => a.duration - b.duration);

  return filtered;
}

// ================================================================
//  PLAYER
// ================================================================

function playSong(id: string): void {
  const song = getSongById(id);
  if (!song) return;

  currentSongId = id;
  playerTitle.textContent = song.title;
  playerArtist.textContent = song.artist;
  playerThumb.textContent = song.cover;
  currentDuration = song.duration;
  timeTotal.textContent = formatTime(song.duration);

  // Update fav button
  updateFavButton();

  // Update progress
  currentProgress = 0;
  progressBar.style.width = '0%';
  progressSlider.value = '0';
  timeCurrent.textContent = '0:00';

  // Play
  isPlaying = true;
  updatePlayButton();

  // Simulate audio
  if (audio) {
    audio.pause();
    audio = null;
  }

  // Fake audio for demo
  let progress = 0;
  const step = () => {
    if (!isPlaying || currentSongId !== id) return;
    progress += 0.5;
    if (progress >= song.duration) {
      progress = song.duration;
      isPlaying = false;
      updatePlayButton();
      return;
    }
    currentProgress = progress;
    const pct = (progress / song.duration) * 100;
    progressBar.style.width = `${pct}%`;
    progressSlider.value = String(pct);
    timeCurrent.textContent = formatTime(progress);
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  // Highlight active card
  $$('.song-card').forEach(c => c.style.borderColor = '');
  const cards = $$('.song-card');
  for (const c of cards) {
    if ((c as HTMLElement).dataset.id === id) {
      (c as HTMLElement).style.borderColor = '#D94F14';
    }
  }
}

function togglePlay(): void {
  if (!currentSongId) {
    // Play first song
    if (songs.length > 0) playSong(songs[0].id);
    return;
  }
  isPlaying = !isPlaying;
  updatePlayButton();
  if (isPlaying) {
    // Resume simulation
    const song = getSongById(currentSongId);
    if (!song) return;
    let progress = currentProgress;
    const step = () => {
      if (!isPlaying || currentSongId !== song.id) return;
      progress += 0.5;
      if (progress >= song.duration) {
        progress = song.duration;
        isPlaying = false;
        updatePlayButton();
        return;
      }
      currentProgress = progress;
      const pct = (progress / song.duration) * 100;
      progressBar.style.width = `${pct}%`;
      progressSlider.value = String(pct);
      timeCurrent.textContent = formatTime(progress);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

function updatePlayButton(): void {
  if (isPlaying) {
    playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
  } else {
    playBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
  }
}

function updateFavButton(): void {
  if (!currentSongId) return;
  const song = getSongById(currentSongId);
  if (!song) return;
  playerFav.classList.toggle('active', song.isFavorite);
}

function toggleFavorite(): void {
  if (!currentSongId) return;
  const song = getSongById(currentSongId);
  if (!song) return;
  song.isFavorite = !song.isFavorite;
  updateFavButton();
  renderLibrary();
  renderAllSongs();
  renderFeatured();
  renderExplore();
  renderDownloads();
}

function prevSong(): void {
  if (!currentSongId) return;
  const idx = songs.findIndex(s => s.id === currentSongId);
  if (idx > 0) playSong(songs[idx - 1].id);
}

function nextSong(): void {
  if (!currentSongId) return;
  const idx = songs.findIndex(s => s.id === currentSongId);
  if (idx < songs.length - 1) playSong(songs[idx + 1].id);
}

// ================================================================
//  DOWNLOAD
// ================================================================

function startDownload(songId: string): void {
  const song = getSongById(songId);
  if (!song) return;

  if (song.isDownloaded) {
    toast('Already downloaded ✓');
    return;
  }

  // Check if already downloading
  const existing = downloads.find(d => d.songId === songId && d.status !== 'complete');
  if (existing) {
    toast('Already downloading...');
    return;
  }

  const task: DownloadTask = {
    id: `dl_${Date.now()}`,
    songId: song.id,
    title: song.title,
    artist: song.artist,
    progress: 0,
    status: 'downloading',
  };

  downloads.push(task);
  renderDownloads();
  toast(`⬇️ Downloading "${song.title}"...`);

  // Simulate download
  let prog = 0;
  const interval = setInterval(() => {
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
      toast(`✅ "${song.title}" downloaded!`);
      return;
    }
    task.progress = Math.min(prog, 100);
    renderDownloads();
  }, 300 + Math.random() * 400);
}

// ================================================================
//  NAVIGATION
// ================================================================

function navigateTo(view: 'home' | 'explore' | 'library' | 'downloads'): void {
  // Update nav
  navLinks.forEach(link => link.classList.remove('active'));
  const targetLink = Array.from(navLinks).find(
    link => link.dataset.view === view
  );
  if (targetLink) targetLink.classList.add('active');

  // Update sections
  Object.entries(viewSections).forEach(([key, el]) => {
    el.classList.toggle('active', key === view);
  });

  // Update title
  const titles = {
    home: 'Home',
    explore: 'Explore',
    library: 'Library',
    downloads: 'Downloads',
  };
  const subs = {
    home: 'Discover your favorite tracks',
    explore: 'Find new music by genre',
    library: 'Your saved and loved songs',
    downloads: 'All your downloaded tracks',
  };
  pageTitle.textContent = titles[view];
  pageSub.textContent = subs[view];

  // Render content on demand
  if (view === 'explore') renderExplore();
  if (view === 'library') renderLibrary();
  if (view === 'downloads') renderDownloads();
}

// ================================================================
//  TOAST
// ================================================================

function toast(message: string): void {
  const existing = document.querySelector('.toast-float');
  if (existing) existing.remove();

  const div = document.createElement('div');
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

  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transform = 'translateX(-50%) translateY(20px)';
    div.style.transition = 'all 0.3s ease';
    setTimeout(() => div.remove(), 400);
  }, 2800);
}

// Inject toast keyframe
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes toastIn {
    0% { opacity: 0; transform: translateX(-50%) translateY(20px) scale(0.95); }
    100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
  }
`;
document.head.appendChild(styleSheet);

// ================================================================
//  INIT
// ================================================================

function init(): void {
  // Show splash
  showSplash();

  // Hide splash after animation
  setTimeout(hideSplash, 3200);

  // Render initial content
  renderAllSongs();
  renderFeatured();
  renderExplore();
  renderLibrary();
  renderDownloads();

  // Event listeners
  searchInput.addEventListener('input', renderAllSongs);
  sortSelect.addEventListener('change', renderAllSongs);

  // Navigation
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.view as 'home' | 'explore' | 'library' | 'downloads';
      if (view) navigateTo(view);
    });
  });

  // Player controls
  playBtn.addEventListener('click', togglePlay);
  prevBtn.addEventListener('click', prevSong);
  nextBtn.addEventListener('click', nextSong);
  playerFav.addEventListener('click', toggleFavorite);

  // Download current song
  downloadBtn.addEventListener('click', () => {
    if (currentSongId) startDownload(currentSongId);
  });

  // Progress slider
  progressSlider.addEventListener('input', (e) => {
    const val = parseFloat((e.target as HTMLInputElement).value);
    if (!currentSongId) return;
    const song = getSongById(currentSongId);
    if (!song) return;
    const newTime = (val / 100) * song.duration;
    currentProgress = newTime;
    progressBar.style.width = `${val}%`;
    timeCurrent.textContent = formatTime(newTime);
  });

  // Theme toggle (light/dark demo)
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    // Simple toggle: we keep dark always, but we can invert some colors
    const isLight = document.body.classList.contains('light-theme');
    document.documentElement.style.setProperty('--bg', isLight ? '#F5F5F5' : '#0A0A0A');
    document.documentElement.style.setProperty('--surface', isLight ? '#FFFFFF' : '#111111');
    document.documentElement.style.setProperty('--text', isLight ? '#1A1A1A' : '#FFFFFF');
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === ' ' || e.key === 'Space') {
      e.preventDefault();
      togglePlay();
    }
    if (e.key === 'ArrowRight') nextSong();
    if (e.key === 'ArrowLeft') prevSong();
  });

  console.log('🎵 Music Dashboard loaded!');
  console.log(`📀 ${songs.length} songs ready.`);
}

// Run
document.addEventListener('DOMContentLoaded', init);
