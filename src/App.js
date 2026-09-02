import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { toJpeg } from 'html-to-image';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');

// 🤖 LOCKED & DETERMINISTIC SCI-FI ROBOT AVATAR HELPER (DICEBEAR BOTTTS)
const getMemberAvatar = (name) => {
  const safeSeed = name ? name.trim().toLowerCase() : 'cubbon';
  return `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(safeSeed)}&backgroundColor=0f172a,020617&radius=50`;
};

// Smart Poster Fallback Helper Component
const MoviePoster = ({ src, title, className, style }) => {
  const [imgError, setImgError] = useState(false);

  if (!src || src === 'N/A' || imgError) {
    return (
      <div
        className={className}
        style={{
          ...style,
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px',
          textAlign: 'center',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: '24px', marginBottom: '6px' }}>🎬</span>
        <span style={{ fontSize: '11px', fontWeight: '800', color: '#00FF41', lineHeight: '1.2' }}>
          {title}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      className={className}
      style={style}
      onError={() => setImgError(true)}
    />
  );
};

export default function MovieClubApp() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(localStorage.getItem('movieClubAdminSession') === 'true' ? 'admin' : 'public');

  const [selectedUser, setSelectedUser] = useState(null);

  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(localStorage.getItem('movieClubAdminSession') === 'true');

  // Form Submission States
  const [memberName, setMemberName] = useState('');
  const [movieTitle, setMovieTitle] = useState('');
  const [customPosterUrl, setCustomPosterUrl] = useState('');
  const [imdbLink, setImdbLink] = useState('');
  const [memberReview, setMemberReview] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  // 🍿 FILTER & SORT STATES
  const [selectedMemberFilter, setSelectedMemberFilter] = useState('');
  const [sortByRating, setSortByRating] = useState(false);

  // 📸 EXPORTER REFS & STATES
  const exportCardRef = useRef(null);
  const memberExportCardRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isMemberExporting, setIsMemberExporting] = useState(false);

  useEffect(() => {
    const isAdmin = localStorage.getItem('movieClubAdminSession') === 'true';
    if (isAdmin) {
      setIsAuthenticated(true);
      if (currentPage === 'login') {
        setCurrentPage('admin');
      }
    } else {
      setIsAuthenticated(false);
    }
  }, [currentPage]);

  useEffect(() => {
    fetchLiveLogs();
  }, []);

  // 🛰️ FETCH LOGS FROM SEPTEMBER TABLE
  async function fetchLiveLogs() {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('movie_logs_september')
        .select('*');

      if (error) throw error;

      const sortedData = data ? [...data].reverse() : [];
      setLogs(sortedData);
    } catch (err) {
      console.error('Database connection error: ', err.message);
    } finally {
      setLoading(false);
    }
  }

  // 📺 TMDB WATCH PROVIDERS FETCHER
  const fetchWatchProviders = async (imdbId) => {
    const tmdbApiKey = process.env.REACT_APP_TMDB_API_KEY;
    if (!tmdbApiKey || !imdbId) return [];

    try {
      const findRes = await fetch(
        `https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbApiKey}&external_source=imdb_id`
      );
      const findData = await findRes.json();
      const tmdbMovie = findData.movie_results?.[0];

      if (!tmdbMovie) return [];

      const providerRes = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbMovie.id}/watch/providers?api_key=${tmdbApiKey}`
      );
      const providerData = await providerRes.json();
      
      const resultsIN = providerData.results?.IN || providerData.results?.US;
      if (!resultsIN) return [];

      const streamingOnly = [
        ...(resultsIN.flatrate || []),
        ...(resultsIN.free || []),
        ...(resultsIN.ads || [])
      ];

      const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w92';
      const providerList = [];
      const seenNames = new Set();

      for (const item of streamingOnly) {
        if (!seenNames.has(item.provider_name)) {
          seenNames.add(item.provider_name);
          providerList.push(
            JSON.stringify({
              name: item.provider_name,
              logo: item.logo_path ? `${TMDB_IMAGE_BASE}${item.logo_path}` : null,
            })
          );
        }
      }

      return providerList;
    } catch (err) {
      console.error('Error fetching TMDb Watch Providers:', err);
      return [];
    }
  };

  const memberStats = logs.reduce((acc, log) => {
    if (!acc[log.name]) {
      acc[log.name] = { name: log.name, count: 0, movies: [] };
    }
    acc[log.name].count += 1;
    acc[log.name].movies.push({ title: log.movie, poster: log.poster, rating: log.rating });
    return acc;
  }, {});

  const leaderboard = Object.values(memberStats).sort(
    (a, b) => b.count - a.count
  );

  const uniqueMembers = [...new Set(logs.map((log) => log.name))].sort();

  // FILTER & SORT LOGIC FOR LOGGED FEED
  const processedLogs = logs
    .filter((log) => (selectedMemberFilter ? log.name === selectedMemberFilter : true))
    .sort((a, b) => {
      if (!sortByRating) return 0;
      const parseRating = (r) => {
        if (!r) return 0;
        const val = parseFloat(r.replace(/[^0-9.]/g, ''));
        return isNaN(val) ? 0 : val;
      };
      return parseRating(b.rating) - parseRating(a.rating);
    });

  // 📸 EXPORT LEADERBOARD JPG VIA HTML-TO-IMAGE
  const handleDownloadLeaderboardImage = async () => {
    if (!exportCardRef.current || isExporting || logs.length === 0) return;

    try {
      setIsExporting(true);

      const dataUrl = await toJpeg(exportCardRef.current, {
        quality: 0.95,
        backgroundColor: '#040507',
        pixelRatio: 2,
      });

      const dateTag = new Date().toISOString().split('T')[0];
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `Cubbon-Leaderboard-September-${dateTag}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Image Generation Error:', err);
      alert('Failed to generate leaderboard image.');
    } finally {
      setIsExporting(false);
    }
  };

  // 📸 EXPORT MEMBER PROFILE BADGE JPG VIA HTML-TO-IMAGE
  const handleDownloadMemberImage = async () => {
    if (!memberExportCardRef.current || isMemberExporting || !selectedUser) return;

    try {
      setIsMemberExporting(true);

      const dataUrl = await toJpeg(memberExportCardRef.current, {
        quality: 0.95,
        backgroundColor: '#040507',
        pixelRatio: 2,
      });

      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${selectedUser}-Cubbon-Movie-Stats-September.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Member Image Generation Error:', err);
      alert('Failed to generate personal card.');
    } finally {
      setIsMemberExporting(false);
    }
  };

  const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD || window._env_?.REACT_APP_ADMIN_PASSWORD || 'abc123_test';

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    if (passwordInput === ADMIN_PASSWORD) {
      setAuthError(false);
      setIsAuthenticated(true);
      localStorage.setItem('movieClubAdminSession', 'true');
      setCurrentPage('admin');
    } else {
      setAuthError(true);
    }
  };

  // 📝 PUBLISH WATCH TO SEPTEMBER TABLE
  const handleLogMovie = async (e) => {
    e.preventDefault();
    if (!memberName || !movieTitle || isPublishing) return;

    try {
      setIsPublishing(true);

      let fetchedGenre = 'September Selection';
      let fetchedDirector = 'Production Syncing';
      let fetchedStars = 'Cast Populating';
      let fetchedRating = '★ —';
      let fetchedPoster = customPosterUrl.trim() || '';
      let fetchedPlot = 'This film was freshly logged by the club curator. Production metadata will sync shortly.';
      let autoImdbLink = '#';
      let detectedImdbId = null;

      const secureOmdbKey = process.env.REACT_APP_OMDB_API_KEY;
      let apiUrl = `https://www.omdbapi.com/?t=${encodeURIComponent(movieTitle)}&apikey=${secureOmdbKey}`;

      if (imdbLink && imdbLink.includes('imdb.com/title/')) {
        const matches = imdbLink.match(/tt\d+/);
        if (matches && matches[0]) {
          detectedImdbId = matches[0];
          apiUrl = `https://www.omdbapi.com/?i=${detectedImdbId}&apikey=${secureOmdbKey}`;
        }
      }

      const omdbResponse = await fetch(apiUrl);
      const movieData = await omdbResponse.json();

      if (movieData && movieData.Response === 'True') {
        fetchedGenre = movieData.Genre || fetchedGenre;
        fetchedDirector = movieData.Director || fetchedDirector;
        fetchedStars = movieData.Actors || fetchedStars;
        fetchedRating = movieData.imdbRating && movieData.imdbRating !== 'N/A' ? `★ ${movieData.imdbRating}` : fetchedRating;
        
        if (customPosterUrl.trim()) {
          fetchedPoster = customPosterUrl.trim();
        } else if (movieData.Poster && movieData.Poster !== 'N/A') {
          fetchedPoster = movieData.Poster;
        } else {
          alert(`⚠️ OMDb could not find a poster for "${movieTitle}". Please paste a direct image link in the "Custom Poster Image URL" field to proceed.`);
          setIsPublishing(false);
          return;
        }
        
        fetchedPlot = movieData.Plot || fetchedPlot;
        
        if (movieData.imdbID) {
          detectedImdbId = movieData.imdbID;
          autoImdbLink = `https://www.imdb.com/title/${movieData.imdbID}`;
        }
      } else {
        if (!customPosterUrl.trim()) {
          alert(`⚠️ Could not find "${movieTitle}" on IMDb/OMDb. Please enter a Custom Poster Image URL to publish.`);
          setIsPublishing(false);
          return;
        }
      }

      const watchProviders = await fetchWatchProviders(detectedImdbId);

      const newLogEntry = {
        name: memberName.trim(),
        movie: movieTitle.trim(),
        genre: fetchedGenre,
        director: fetchedDirector,
        stars: fetchedStars,
        rating: fetchedRating,
        poster: fetchedPoster,
        date_logged: new Date().toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }),
        imdb: imdbLink.trim() || autoImdbLink,
        plot: fetchedPlot,
        review: memberReview.trim(),
        watch_providers: watchProviders,
      };

      const { error } = await supabase.from('movie_logs_september').insert([newLogEntry]);
      if (error) throw error;

      setMovieTitle('');
      setMemberName('');
      setCustomPosterUrl('');
      setImdbLink('');
      setMemberReview('');

      await fetchLiveLogs();
      setCurrentPage('public');
    } catch (err) {
      alert('Error saving log to cloud database: ' + err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  // 🗑️ DELETE LOG FROM SEPTEMBER TABLE
  const handleDeleteLog = async (logId, movieTitle) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete "${movieTitle}" from the September club logs?`
    );
    if (!confirmDelete) return;

    try {
      const { error } = await supabase
        .from('movie_logs_september')
        .delete()
        .eq('id', logId);

      if (error) throw error;
      await fetchLiveLogs();
    } catch (err) {
      alert('Error deleting entry: ' + err.message);
    }
  };

  const selectedMemberLogs = logs.filter((log) => log.name === selectedUser);
  const isHighVolumeMember = selectedMemberLogs.length >= 12;

  return (
    <div className="min-h-screen bg-[#040507] text-slate-100 font-sans antialiased">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
      <link href="https://fonts.googleapis.com/css2?family=Syncopate:wght@700&display=swap" rel="stylesheet" />

      {/* NAVBAR */}
      <header className="max-w-4xl mx-auto px-4 pt-8 flex items-center justify-between border-b border-slate-900 pb-6">
        <div className="flex items-center gap-5">
          <div
            className="flex flex-col text-sm font-bold tracking-widest leading-tight uppercase select-none"
            style={{ fontFamily: "'Syncopate', sans-serif" }}
          >
            <span className="text-white">CUBBON</span>
            <span className="text-[#00FF41]">MOVIE</span>
            <span className="text-white">CLUB</span>
          </div>
          {/* 🤖 MATRIX VECTOR ROBOT NAVBAR ICON */}
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center p-2.5 shadow-sm">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle cx="50" cy="20" r="4" fill="#00FF41" />
              <rect x="48" y="22" width="4" height="10" fill="#00FF41" />
              <rect x="20" y="32" width="60" height="46" rx="12" fill="#00FF41" />
              <rect x="12" y="46" width="8" height="18" rx="3" fill="#00FF41" />
              <rect x="80" y="46" width="8" height="18" rx="3" fill="#00FF41" />
              <rect x="30" y="42" width="14" height="14" rx="4" fill="#040507" />
              <rect x="56" y="42" width="14" height="14" rx="4" fill="#040507" />
              <circle cx="37" cy="49" r="3" fill="#00FF41" />
              <circle cx="63" cy="49" r="3" fill="#00FF41" />
              <rect x="34" y="64" width="32" height="6" rx="2" fill="#040507" />
            </svg>
          </div>
        </div>
        {currentPage === 'public' ? (
          <button
            onClick={() => {
              setPasswordInput('');
              setAuthError(false);
              setCurrentPage('login');
            }}
            className="text-[10px] font-bold tracking-widest uppercase text-slate-500 hover:text-[#00FF41] border border-slate-900 bg-slate-900/10 px-3 py-1.5 rounded-xl transition-all"
          >
            ADMIN
          </button>
        ) : (
          <button
            onClick={() => setCurrentPage('public')}
            className="text-xs font-bold tracking-wider uppercase text-slate-400 hover:text-white"
          >
            ← Back
          </button>
        )}
      </header>

      {/* MAIN LAYOUT FRAME */}
      <main className="max-w-4xl mx-auto p-4 md:p-8">
        {currentPage === 'public' && (
          <div className="space-y-16">
            {/* 🗓️ SEPTEMBER THEME HEADER BANNER */}
            <div className="text-left py-4 border-b border-slate-900">
              <div
                className="text-2xl md:text-4xl font-bold tracking-widest uppercase flex flex-col gap-1 leading-none"
                style={{ fontFamily: "'Syncopate', sans-serif" }}
              >
                <span className="text-[#00FF41]">SCI-FI & FANTASY MOVIES</span>
                <span className="text-white">SEPTEMBER</span>
              </div>
              <p
                className="text-[10px] font-bold tracking-widest text-[#00FF41] mt-3 uppercase"
                style={{ fontFamily: "'Syncopate', sans-serif" }}
              >
                GET. SET. LOG.
              </p>
            </div>

            {loading ? (
              <div
                className="text-center py-12 text-xs font-bold tracking-widest text-slate-600 uppercase"
                style={{ fontFamily: "'Syncopate', sans-serif" }}
              >
                📡 Accessing Matrix Core...
              </div>
            ) : (
              <>
                {/* LEADERBOARD VIEW BLOCK */}
                <section className="space-y-8">
                  {/* ISSUE 1 FIX: Clean flex spacing between title & Save JPG button on mobile */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <h2 className="text-xl font-extrabold tracking-tight text-white border-l-4 border-[#00FF41] pl-3">
                      LEADERBOARD
                    </h2>

                    {isAuthenticated && (
                      <button
                        onClick={handleDownloadLeaderboardImage}
                        disabled={isExporting || leaderboard.length === 0}
                        className="text-[10px] font-extrabold tracking-widest uppercase text-[#00FF41] hover:text-emerald-300 bg-[#00FF41]/10 border border-[#00FF41]/30 px-3.5 py-2 rounded-xl transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 self-start sm:self-auto"
                      >
                        <span className="text-sm">📸</span>
                        <span>{isExporting ? 'Generating HD Card...' : 'Save JPG for WhatsApp'}</span>
                      </button>
                    )}
                  </div>

                  {leaderboard.length === 0 ? (
                    <div className="text-sm text-slate-500 bg-slate-950/20 border border-slate-900 p-6 rounded-xl text-center">
                      No movies logged yet for this challenge season. Open the Admin portal to launch!
                    </div>
                  ) : (
                    <div className="bg-slate-950/40 border border-slate-900/60 rounded-2xl divide-y divide-slate-900/40 overflow-hidden">
                      {leaderboard.map((member, idx) => (
                        <div
                          key={member.name}
                          className="p-4 sm:p-5 flex items-center justify-between hover:bg-slate-900/10 transition-colors gap-3"
                        >
                          {/* ISSUE 3 FIX: Dedicated gap between avatar/name group & posters */}
                          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 mr-1 sm:mr-3">
                            <span
                              className={`w-6 h-6 sm:w-7 sm:h-7 rounded flex items-center justify-center font-black text-xs sm:text-sm shrink-0 ${
                                idx === 0 ? 'bg-[#00FF41] text-slate-950' : 'bg-slate-900 text-slate-500'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            
                            {/* 🤖 BOTTTS AVATAR */}
                            <img
                              src={getMemberAvatar(member.name)}
                              alt={member.name}
                              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-900 border border-slate-800 p-0.5 object-cover shrink-0"
                            />

                            <div>
                              <h3 
                                onClick={() => setSelectedUser(member.name)}
                                className="font-extrabold text-slate-200 text-sm sm:text-base hover:underline hover:text-[#00FF41] select-none cursor-pointer leading-snug"
                              >
                                {member.name}
                              </h3>
                              <p className="text-[10px] sm:text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                                {member.count} Film{member.count > 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex -space-x-1.5 sm:-space-x-2 overflow-hidden p-0.5 shrink-0">
                            {member.movies.map((mov, i) => (
                              <MoviePoster
                                key={i}
                                src={mov.poster}
                                title={mov.title}
                                className="w-7 h-10 sm:w-8 sm:h-12 object-cover rounded border border-slate-950"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* 🎬 LOGGED (X MOVIES) SECTION */}
                <section className="space-y-8 pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-900 pb-5">
                    <h2 className="text-xl font-extrabold tracking-tight text-white border-l-4 border-[#00FF41] pl-3">
                      LOGGED ({logs.length} MOVIE{logs.length !== 1 ? 'S' : ''})
                    </h2>

                    {/* ISSUE 2 FIX: Grid container forces side-by-side equal width on mobile */}
                    <div className="grid grid-cols-2 gap-2.5 w-full sm:flex sm:w-auto items-center">
                      {/* ⭐ LIST BY RATING SORT TOGGLE BUTTON */}
                      <button
                        onClick={() => setSortByRating(!sortByRating)}
                        className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                          sortByRating
                            ? 'bg-[#00FF41] text-slate-950 border-[#00FF41]'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        <span>★</span>
                        <span className="truncate">{sortByRating ? 'Sorted by Rating' : 'List by Rating'}</span>
                      </button>

                      {/* 👤 MEMBER FILTER DROPDOWN */}
                      <div className="relative w-full sm:w-48">
                        <select
                          value={selectedMemberFilter}
                          onChange={(e) => setSelectedMemberFilter(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 pr-7 text-xs text-white focus:outline-none focus:border-[#00FF41] font-medium cursor-pointer appearance-none truncate"
                        >
                          <option value="">List by Member</option>
                          {uniqueMembers.map((name) => (
                            <option key={name} value={name} className="bg-slate-900 text-white">
                              {name}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 text-[10px]">
                          ▼
                        </div>
                      </div>
                    </div>
                  </div>

                  {processedLogs.length === 0 ? (
                    <div className="text-sm text-slate-500 bg-slate-950/20 border border-slate-900 p-6 rounded-xl text-center">
                      {selectedMemberFilter ? `No watched entries found for ${selectedMemberFilter}.` : 'No movies logged yet.'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-900/60 space-y-12">
                      {processedLogs.map((log) => (
                        <div
                          key={`${log.name}-${log.movie}-${Math.random()}`}
                          className="flex flex-col space-y-4 pt-10 first:pt-0"
                        >
                          {/* 1. TITLE & GENRE */}
                          <div>
                            <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                              {log.movie}
                            </h3>
                            <p className="text-xs font-semibold text-[#00FF41]/90 tracking-wide mt-1">
                              {log.genre}
                            </p>
                          </div>

                          {/* 2. 🌟 PROMINENT "LOGGED BY" HIGHLIGHT BADGE WITH BOTTTS ROBOT AVATAR */}
                          <div className="flex items-center gap-2 pt-0.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                              Logged by:
                            </span>
                            <button
                              onClick={() => setSelectedUser(log.name)}
                              className="inline-flex items-center gap-2 bg-[#00FF41]/10 border border-[#00FF41]/30 hover:border-[#00FF41]/60 text-[#00FF41] hover:text-emerald-300 text-xs font-extrabold px-3 py-1 rounded-full transition-all shadow-sm group"
                            >
                              <img
                                src={getMemberAvatar(log.name)}
                                alt={log.name}
                                className="w-5 h-5 rounded-full bg-slate-900 border border-[#00FF41]/40 p-0.5 object-cover group-hover:scale-110 transition-transform"
                              />
                              <span className="tracking-wide">{log.name}</span>
                            </button>
                          </div>

                          {/* 3. 📺 OTT / STREAMING PROVIDERS BADGES (ALIGNED & MULTI-LINE PROOF) */}
                          {log.watch_providers && log.watch_providers.length > 0 && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 pt-0.5">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest shrink-0 self-start sm:self-auto pt-1 sm:pt-0">
                                Stream on:
                              </span>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                {log.watch_providers.slice(0, 4).map((provider, idx) => {
                                  let providerObj = provider;

                                  if (typeof provider === 'string') {
                                    try {
                                      providerObj = JSON.parse(provider);
                                    } catch (e) {
                                      providerObj = { name: provider, logo: null };
                                    }
                                  }

                                  const providerName = providerObj?.name || 'Platform';
                                  const providerLogo = providerObj?.logo || null;

                                  return (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center gap-1.5 h-6 bg-slate-900 border border-slate-800/80 text-slate-200 text-[10px] font-bold px-2.5 rounded-lg shadow-sm shrink-0 leading-none select-none"
                                    >
                                      {providerLogo ? (
                                        <img
                                          src={providerLogo}
                                          alt={providerName}
                                          className="w-3.5 h-3.5 rounded object-cover shrink-0"
                                        />
                                      ) : (
                                        <span className="text-[11px]">📺</span>
                                      )}
                                      <span className="truncate max-w-[110px] sm:max-w-none">{providerName}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* 4. MOVIE POSTER */}
                          <div className="w-full max-w-md bg-slate-900 border border-slate-900">
                            <MoviePoster
                              src={log.poster}
                              title={log.movie}
                              className="w-full h-auto object-contain min-h-[300px]"
                            />
                          </div>

                          {/* 5. DETAILS, RATING & REVIEWS */}
                          <div className="space-y-4 max-w-md sm:max-w-xl">
                            <div className="space-y-1 text-sm text-slate-300 font-medium">
                              <p>
                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[11px] mr-1.5">
                                  Director:
                                </span>{' '}
                                {log.director}
                              </p>
                              <p>
                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[11px] mr-1.5">
                                  Stars:
                                </span>{' '}
                                {log.stars}
                              </p>
                              <p>
                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[11px] mr-1.5">
                                  Rating:
                                </span>{' '}
                                <span className="text-[#00FF41] font-bold">
                                  {log.rating}
                                </span>
                              </p>
                              <p>
                                <span className="text-slate-500 font-bold uppercase tracking-wider text-[11px] mr-1.5">
                                  Logged On:
                                </span>{' '}
                                <span className="text-slate-300 font-medium">
                                  {log.date_logged || 'Prior Entry'}
                                </span>
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                {log.review ? 'Review' : 'Plot Summary'}
                              </span>
                              {log.review ? (
                                <p className="text-sm text-slate-200 leading-relaxed bg-slate-950/40 p-4 rounded-xl border border-slate-900/50 italic border-l-2 border-[#00FF41]/60 whitespace-pre-line">
                                  "{log.review}"
                                </p>
                              ) : (
                                <p className="text-sm text-slate-400 leading-relaxed bg-slate-950/40 p-4 rounded-xl border border-slate-900/50 whitespace-pre-line">
                                  {log.plot}
                                </p>
                              )}
                            </div>

                            {/* FOOTER ACTIONS */}
                            <div className="pt-2 flex items-center justify-end gap-4 border-t border-slate-900/60">
                              {isAuthenticated && (
                                <button
                                  onClick={() => handleDeleteLog(log.id, log.movie)}
                                  className="text-[10px] font-black tracking-widest text-rose-500 hover:text-rose-400 uppercase bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg transition-all"
                                >
                                  Delete Row
                                </button>
                              )}
                              <a
                                href={log.imdb}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-bold text-slate-500 hover:text-white flex items-center gap-0.5"
                              >
                                More →
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        )}

        {currentPage === 'login' && (
          <div className="max-w-md mx-auto mt-16 bg-slate-950/40 border border-slate-900 rounded-2xl p-6">
            <h2 className="text-lg font-black text-white tracking-tight">
              Curator Gate
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Please enter security passkey.
            </p>
            <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
              <input
                type="password"
                placeholder="Enter Passkey"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00FF41]"
              />
              {authError && (
                <p className="text-xs text-rose-500 font-semibold mt-1.5">
                  ❌ Incorrect passkey.
                </p>
              )}
              <button
                type="submit"
                className="w-full bg-[#00FF41] hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs uppercase tracking-widest transition-colors"
              >
                Unlock Panel
              </button>
            </form>
          </div>
        )}

        {/* SECURE ADMIN ENTRY PANEL */}
        {currentPage === 'admin' && (
          <div className="space-y-12">
            <div className="max-w-xl mx-auto bg-slate-950 border border-slate-900 rounded-2xl p-6">
              <div className="border-b border-slate-900 pb-3 mb-6 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">
                    Club Curator Panel
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Add watches to update leaderboard rankings.
                  </p>
                </div>
                <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-[#00FF41] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Authenticated
                </span>
              </div>
              <form onSubmit={handleLogMovie} className="space-y-5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    Member Name *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Who watched it? (e.g., Ananya)"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-[#00FF41]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    Movie Title *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Enter film title (e.g., Dune: Part Two)"
                    value={movieTitle}
                    onChange={(e) => setMovieTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-[#00FF41]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    Custom Poster Image URL (Optional - For Missing IMDb Posters)
                  </label>
                  <input
                    type="url"
                    placeholder="Paste direct image link (e.g., https://.../poster.jpg)"
                    value={customPosterUrl}
                    onChange={(e) => setCustomPosterUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-[#00FF41]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    Custom IMDb URL Override (Optional)
                  </label>
                  <input
                    type="url"
                    placeholder="Leave empty to use OMDb auto-matching link"
                    value={imdbLink}
                    onChange={(e) => setImdbLink(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-[#00FF41]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    Review (Optional)
                  </label>
                  <textarea
                    rows="4"
                    placeholder="Type custom member thoughts..."
                    value={memberReview}
                    onChange={(e) => setMemberReview(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-[#00FF41] resize-none"
                  ></textarea>
                </div>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="w-full bg-[#00FF41] hover:bg-emerald-400 text-slate-950 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all disabled:opacity-50"
                >
                  {isPublishing ? 'Querying OTT Info & Publishing...' : 'Publish Watch to Live Board'}
                </button>
              </form>
               
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('movieClubAdminSession');
                  setCurrentPage('public');
                }}
                className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white font-bold py-3 rounded-xl text-xs uppercase tracking-widest transition-all border border-slate-800"
              >
                Exit & Log Out Admin
              </button>
            </div>
          </div>
        )}
      </main>

      {/* 🍿 THE USER DIARY POP-UP MODAL */}
      {selectedUser && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: '#090d16',
            color: '#fff',
            padding: '30px',
            borderRadius: '16px',
            width: '90%', maxWidth: '800px',
            maxHeight: '85vh', overflowY: 'auto',
            position: 'relative',
            border: '1px solid #1e293b'
          }}>
            <button 
              onClick={() => setSelectedUser(null)}
              style={{
                position: 'absolute', top: '15px', right: '20px',
                background: 'none', border: 'none', color: '#9ca3af',
                fontSize: '28px', cursor: 'pointer'
              }}
            >
              &times;
            </button>

            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderBottom: '2px solid #1e293b', paddingBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img
                  src={getMemberAvatar(selectedUser)}
                  alt={selectedUser}
                  style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: '#0f172a', border: '1px solid #374151', padding: '2px' }}
                />
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>
                  🎬 {selectedUser}'s Log
                </h2>
              </div>

              <button
                onClick={handleDownloadMemberImage}
                disabled={isMemberExporting}
                style={{
                  backgroundColor: 'rgba(0, 255, 65, 0.1)',
                  border: '1px solid rgba(0, 255, 65, 0.3)',
                  color: '#00FF41',
                  padding: '6px 14px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '800',
                  cursor: 'pointer',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                }}
              >
                {isMemberExporting ? 'Generating...' : '📸 Download Profile Badge'}
              </button>
            </div>

            {((selectedMemberLogs.length >= 5) || (leaderboard[0] && leaderboard[0].name === selectedUser)) && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                padding: '12px',
                backgroundColor: '#0f172a',
                borderRadius: '12px',
                border: '1px solid #1e293b',
                marginTop: '15px'
              }}>
                {leaderboard[0] && leaderboard[0].name === selectedUser && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(0, 255, 65, 0.15)', padding: '6px 14px', borderRadius: '20px', border: '1px solid #00FF41' }}>
                    <span style={{ fontSize: '14px' }}>👑</span>
                    <span style={{ fontSize: '11px', fontWeight: '900', color: '#00FF41' }}>CHAMPION</span>
                  </div>
                )}

                {selectedMemberLogs.length >= 15 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(0, 255, 65, 0.1)', padding: '6px 12px', borderRadius: '20px', border: '1px solid #00FF41' }}>
                    <span style={{ fontSize: '14px' }}>🥇</span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#00FF41' }}>Gold</span>
                  </div>
                ) : selectedMemberLogs.length >= 10 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(226, 232, 240, 0.1)', padding: '6px 12px', borderRadius: '20px', border: '1px solid #cbd5e1' }}>
                    <span style={{ fontSize: '14px' }}>🥈</span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#e2e8f0' }}>Silver</span>
                  </div>
                ) : selectedMemberLogs.length >= 5 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'rgba(205, 127, 50, 0.1)', padding: '6px 12px', borderRadius: '20px', border: '1px solid #b45309' }}>
                    <span style={{ fontSize: '14px' }}>🥉</span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: '#f59e0b' }}>Bronze</span>
                  </div>
                ) : null}
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '20px', marginTop: '25px'
            }}>
              {selectedMemberLogs.map((log) => (
                <div key={`${log.movie}-${Math.random()}`} style={{ textAlign: 'center', backgroundColor: '#0f172a', padding: '12px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                  <MoviePoster 
                    src={log.poster} 
                    title={log.movie}
                    style={{ width: '100%', borderRadius: '6px', aspectRatio: '2/3', objectFit: 'cover' }} 
                  />
                  <h4 style={{ margin: '10px 0 5px 0', fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {log.movie}
                  </h4>
                  <span style={{ fontSize: '12px', color: '#00FF41', fontWeight: 'bold' }}>
                    {log.rating || '★ —'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 🖼️ OFF-SCREEN LEADERBOARD EXPORT CANVAS (ISSUE 4 FIX: High legibility for mobile WhatsApp) */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <div
          ref={exportCardRef}
          style={{
            width: '1080px',
            backgroundColor: '#040507',
            color: '#ffffff',
            padding: '60px',
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            boxSizing: 'border-box',
          }}
        >
          <div style={{ marginBottom: '32px' }}>
            <div
              style={{
                fontFamily: "'Syncopate', sans-serif",
                fontWeight: '700',
                fontSize: '32px',
                letterSpacing: '3px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span>CUBBON</span>
              <span style={{ color: '#00FF41' }}>MOVIE</span>
              <span>CLUB</span>
            </div>
          </div>

          <div
            style={{
              backgroundColor: '#0a0d14',
              border: '1px solid #1e293b',
              borderRadius: '24px',
              padding: '28px 36px',
              marginBottom: '40px',
              display: 'flex',
              alignItems: 'center',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                fontFamily: "'Syncopate', sans-serif",
                fontWeight: '700',
                fontSize: '34px',
                letterSpacing: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
              }}
            >
              <span style={{ color: '#00FF41' }}>
                SCI-FI & FANTASY MOVIES
              </span>
              <span style={{ color: '#ffffff' }}>
                SEPTEMBER
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '28px' }}>
            <div style={{ width: '8px', height: '36px', backgroundColor: '#00FF41', borderRadius: '4px' }} />
            <div
              style={{
                fontSize: '32px',
                fontWeight: '900',
                letterSpacing: '1px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              LEADERBOARD
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {leaderboard.map((member, idx) => (
              <div
                key={member.name}
                style={{
                  backgroundColor: '#0f172a',
                  border: idx === 0 ? '2px solid rgba(0, 255, 65, 0.7)' : '1px solid #1e293b',
                  borderRadius: '20px',
                  padding: '24px 28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
                  <div style={{ width: '52px', height: '52px', position: 'relative' }}>
                    <svg width="52" height="52" viewBox="0 0 52 52">
                      <rect
                        width="52"
                        height="52"
                        rx="14"
                        fill={idx === 0 ? '#00FF41' : idx === 1 ? '#e2e8f0' : idx === 2 ? '#cd7f32' : '#1e293b'}
                      />
                      <text
                        x="50%"
                        y="50%"
                        dominantBaseline="central"
                        textAnchor="middle"
                        fill={idx === 0 ? '#000000' : idx === 1 ? '#0f172a' : idx === 2 ? '#ffffff' : '#64748b'}
                        fontSize="24"
                        fontWeight="900"
                        fontFamily="sans-serif"
                      >
                        {idx + 1}
                      </text>
                    </svg>
                  </div>

                  <img
                    src={getMemberAvatar(member.name)}
                    alt={member.name}
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      backgroundColor: '#020617',
                      border: '2px solid #334155',
                      padding: '2px',
                      objectFit: 'cover',
                    }}
                  />

                  <div>
                    <div style={{ fontSize: '28px', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center' }}>
                      {member.name}
                      {idx === 0 && <span style={{ marginLeft: '10px', fontSize: '22px' }}>👑</span>}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginTop: '4px' }}>
                      {member.count} Film{member.count > 1 ? 's' : ''} Watched
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {member.movies.slice(0, 5).map((mov, i) => (
                    <MoviePoster
                      key={i}
                      src={mov.poster}
                      title={mov.title}
                      style={{
                        width: '56px',
                        height: '84px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        border: '1px solid #0f172a',
                      }}
                    />
                  ))}
                  {member.movies.length > 5 && (
                    <div
                      style={{
                        width: '56px',
                        height: '84px',
                        backgroundColor: '#1e293b',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        fontWeight: '800',
                        color: '#94a3b8',
                      }}
                    >
                      +{member.movies.length - 5}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 🖼️ OFF-SCREEN PERSONAL MEMBER STATS EXPORT CANVAS (ISSUE 5 FIX: Option C Multi-column Collage Grid) */}
      {selectedUser && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0, width: '1080px' }}>
          <div
            ref={memberExportCardRef}
            style={{
              width: '1080px',
              backgroundColor: '#040507',
              color: '#ffffff',
              padding: '50px 50px 60px 50px',
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              boxSizing: 'border-box',
              display: 'block',
            }}
          >
            {/* BRANDING WITH THEME SUBTITLE */}
            <div style={{ marginBottom: '28px' }}>
              <div
                style={{
                  fontFamily: "'Syncopate', sans-serif",
                  fontWeight: '700',
                  fontSize: '28px',
                  letterSpacing: '3px',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <span>CUBBON</span>
                <span style={{ color: '#00FF41' }}>MOVIE</span>
                <span>CLUB</span>
              </div>
              
              <div
                style={{
                  fontFamily: "'Syncopate', sans-serif",
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#00FF41',
                  letterSpacing: '2px',
                  marginTop: '8px',
                  textTransform: 'uppercase',
                }}
              >
                SCI-FI & FANTASY MOVIES
              </div>
            </div>

            {/* MEMBER PROFILE BANNER */}
            <div
              style={{
                backgroundColor: '#0a0d14',
                border: '1px solid #1e293b',
                borderRadius: '24px',
                padding: '28px 32px',
                marginBottom: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <img
                  src={getMemberAvatar(selectedUser)}
                  alt={selectedUser}
                  style={{
                    width: '68px',
                    height: '68px',
                    borderRadius: '50%',
                    backgroundColor: '#0f172a',
                    border: '2px solid #00FF41',
                    padding: '3px',
                    objectFit: 'cover',
                  }}
                />
                <div>
                  <div style={{ fontSize: '36px', fontWeight: '900', color: '#ffffff' }}>
                    {selectedUser}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#00FF41', marginTop: '4px' }}>
                    {selectedMemberLogs.length} Film{selectedMemberLogs.length > 1 ? 's' : ''} Logged
                  </div>
                </div>
              </div>

              {/* SVG DEAD-CENTERED BADGE PILLS */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {leaderboard[0] && leaderboard[0].name === selectedUser && (
                  <div style={{ width: '140px', height: '44px', position: 'relative' }}>
                    <svg width="140" height="44" viewBox="0 0 140 44">
                      <rect width="140" height="44" rx="22" fill="rgba(0, 255, 65, 0.15)" stroke="#00FF41" strokeWidth="1.5" />
                      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#00FF41" fontSize="13" fontWeight="900" fontFamily="sans-serif">
                        👑 CHAMPION
                      </text>
                    </svg>
                  </div>
                )}
                {selectedMemberLogs.length >= 15 ? (
                  <div style={{ width: '100px', height: '44px', position: 'relative' }}>
                    <svg width="100" height="44" viewBox="0 0 100 44">
                      <rect width="100" height="44" rx="22" fill="rgba(0, 255, 65, 0.15)" stroke="#00FF41" strokeWidth="1.5" />
                      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#00FF41" fontSize="13" fontWeight="900" fontFamily="sans-serif">
                        🥇 GOLD
                      </text>
                    </svg>
                  </div>
                ) : selectedMemberLogs.length >= 10 ? (
                  <div style={{ width: '100px', height: '44px', position: 'relative' }}>
                    <svg width="100" height="44" viewBox="0 0 100 44">
                      <rect width="100" height="44" rx="22" fill="rgba(226, 232, 240, 0.15)" stroke="#cbd5e1" strokeWidth="1.5" />
                      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#e2e8f0" fontSize="13" fontWeight="900" fontFamily="sans-serif">
                        🥈 SILVER
                      </text>
                    </svg>
                  </div>
                ) : selectedMemberLogs.length >= 5 ? (
                  <div style={{ width: '110px', height: '44px', position: 'relative' }}>
                    <svg width="110" height="44" viewBox="0 0 110 44">
                      <rect width="110" height="44" rx="22" fill="rgba(205, 127, 50, 0.15)" stroke="#b45309" strokeWidth="1.5" />
                      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#f59e0b" fontSize="13" fontWeight="900" fontFamily="sans-serif">
                        🥉 BRONZE
                      </text>
                    </svg>
                  </div>
                ) : null}
              </div>
            </div>

            {/* OPTION C COLLAGE GRID: Dynamic miniature poster scaling when 12+ movies logged */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: isHighVolumeMember ? '12px' : '20px',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {selectedMemberLogs.map((log) => (
                <div
                  key={`${log.movie}-${Math.random()}`}
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #1e293b',
                    borderRadius: isHighVolumeMember ? '12px' : '16px',
                    padding: isHighVolumeMember ? '10px' : '14px',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: isHighVolumeMember ? '250px' : '310px',
                    width: isHighVolumeMember ? '170px' : '225px',
                    flexShrink: 0,
                  }}
                >
                  <MoviePoster
                    src={log.poster}
                    title={log.movie}
                    style={{ width: '100%', borderRadius: '8px', aspectRatio: '2/3', objectFit: 'cover' }}
                  />
                  
                  <div
                    style={{
                      marginTop: isHighVolumeMember ? '6px' : '10px',
                      marginBottom: '4px',
                      fontSize: isHighVolumeMember ? '11px' : '13px',
                      fontWeight: '800',
                      color: '#ffffff',
                      lineHeight: '1.2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minHeight: isHighVolumeMember ? '32px' : '42px',
                      padding: '0 2px',
                    }}
                  >
                    {log.movie}
                  </div>

                  <div style={{ fontSize: isHighVolumeMember ? '11px' : '12px', color: '#00FF41', fontWeight: '800' }}>
                    {log.rating || '★ —'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}