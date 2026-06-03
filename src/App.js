import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// React automatically pulls these from your .env file locally, and from Vercel's dashboard online!
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
export default function MovieClubApp() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('public');

  // Security States
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);

  // Form Submission States
  const [memberName, setMemberName] = useState('');
  const [movieTitle, setMovieTitle] = useState('');
  const [imdbLink, setImdbLink] = useState('');
  const [memberReview, setMemberReview] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);

  // FETCH EFFECT: Pull live entries from your cloud spreadsheet on page load
  useEffect(() => {
    fetchLiveLogs();
  }, []);

  async function fetchLiveLogs() {
    try {
      setLoading(true);
      // Simply pull the rows from the cloud spreadsheet
      const { data, error } = await supabase.from('movie_logs').select('*');

      if (error) throw error;

      // Reverse the array using JavaScript so the newest entries
      // float to the top of the feed automatically
      const sortedData = data ? [...data].reverse() : [];
      setLogs(sortedData);
    } catch (err) {
      console.error('Database connection error: ', err.message);
    } finally {
      setLoading(false);
    }
  }

  // Calculate dynamic statistics from the live database rows
  const memberStats = logs.reduce((acc, log) => {
    if (!acc[log.name]) {
      acc[log.name] = { name: log.name, count: 0, movies: [] };
    }
    acc[log.name].count += 1;
    acc[log.name].movies.push({ title: log.movie, poster: log.poster });
    return acc;
  }, {});

  const leaderboard = Object.values(memberStats).sort(
    (a, b) => b.count - a.count
  );

  const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD || 'password';

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    
    // 1. Look for Vercel's variable, or StackBlitz's variable, or use a local fallback string
    const secretPassword = process.env.REACT_APP_ADMIN_PASSWORD || window._env_?.REACT_APP_ADMIN_PASSWORD || 'abc123_test';

    // 2. Compare the user's input directly to the secret password
    if (passwordInput === secretPassword) {
      setAuthError(false);
      setCurrentPage('admin');
    } else {
      setAuthError(true);
    }
  };

  // AUTOMATED COMPLETED PUBLISHING SYSTEM
  const handleLogMovie = async (e) => {
    e.preventDefault();
    if (!memberName || !movieTitle || isPublishing) return;

    try {
      setIsPublishing(true);

      // Default placeholder fields if data isn't matched
      let fetchedGenre = '2025 Selection';
      let fetchedDirector = 'Production Syncing';
      let fetchedStars = 'Cast Populating';
      let fetchedRating = '★ —';
      let fetchedPoster =
        'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=600';
      let fetchedPlot =
        'This film was freshly logged by the club curator. Production metadata will sync shortly.';

      // STEP 1: Ping the OMDb API to fetch official IMDb metadata automatically
      const omdbResponse = await fetch(
        `https://www.omdbapi.com/?t=${encodeURIComponent(
          movieTitle
        )}&apikey=${OMDB_API_KEY}`
      );
      const movieData = await omdbResponse.json();

      if (movieData && movieData.Response === 'True') {
        fetchedGenre = movieData.Genre || fetchedGenre;
        fetchedDirector = movieData.Director || fetchedDirector;
        fetchedStars = movieData.Actors || fetchedStars;
        fetchedRating =
          movieData.imdbRating && movieData.imdbRating !== 'N/A'
            ? `★ ${movieData.imdbRating}`
            : fetchedRating;
        fetchedPoster =
          movieData.Poster && movieData.Poster !== 'N/A'
            ? movieData.Poster
            : fetchedPoster;
        fetchedPlot = movieData.Plot || fetchedPlot;
      }

      // STEP 2: Build the clean production packet
      const newLogEntry = {
        name: memberName.trim(),
        movie: movieTitle.trim(),
        genre: fetchedGenre,
        director: fetchedDirector,
        stars: fetchedStars,
        rating: fetchedRating,
        poster: fetchedPoster,
        // DELETE THE DATE LINE THAT WAS HERE!
        imdb:
          imdbLink.trim() ||
          (movieData.imdbID
            ? `https://www.imdb.com/title/${movieData.imdbID}`
            : '#'),
        plot: fetchedPlot,
        review: memberReview.trim(),
      };

      // STEP 3: Ship the data row directly up to your live Supabase cloud spreadsheet
      const { error } = await supabase.from('movie_logs').insert([newLogEntry]);

      if (error) throw error;

      // STEP 4: Refresh UI states
      setMovieTitle('');
      setMemberName('');
      setImdbLink('');
      setMemberReview('');

      await fetchLiveLogs(); // Force reload the system components instantly
      setCurrentPage('public');
    } catch (err) {
      alert('Error saving log to cloud database: ' + err.message);
    } finally {
      setIsPublishing(false);
    }
  };

  // PASTE THE NEW DELETION FUNCTION DIRECTLY HERE:
  const handleDeleteLog = async (logId, movieTitle) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete "${movieTitle}" from the club logs?`
    );
    if (!confirmDelete) return;

    try {
      const { error } = await supabase
        .from('movie_logs')
        .delete()
        .eq('id', logId);

      if (error) throw error;
      await fetchLiveLogs();
    } catch (err) {
      alert('Error deleting entry: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#040507] text-slate-100 font-sans antialiased">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="true"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Syncopate:wght@700&display=swap"
        rel="stylesheet"
      />

      {/* NAVBAR */}
      <header className="max-w-4xl mx-auto px-4 pt-8 flex items-center justify-between border-b border-slate-900 pb-6">
        <div className="flex items-center gap-5">
          <div
            className="flex flex-col text-sm font-bold tracking-widest leading-tight uppercase select-none"
            style={{ fontFamily: "'Syncopate', sans-serif" }}
          >
            <span className="text-white">CUBBON</span>
            <span className="text-amber-400">MOVIE</span>
            <span className="text-white">CLUB</span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl">
            🎥
          </div>
        </div>
        {currentPage === 'public' ? (
          <button
            onClick={() => {
              setPasswordInput('');
              setAuthError(false);
              setCurrentPage('login');
            }}
            className="text-[10px] font-bold tracking-widest uppercase text-slate-500 hover:text-amber-400 border border-slate-900 bg-slate-900/10 px-3 py-1.5 rounded-xl transition-all"
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
            <div className="text-left py-4 border-b border-slate-900">
              <div
                className="text-2xl md:text-4xl font-bold tracking-widest uppercase text-white flex flex-col gap-1 leading-none"
                style={{ fontFamily: "'Syncopate', sans-serif" }}
              >
                <span>HIDDEN GEMS</span>
                <span className="text-amber-400">2025</span>
              </div>
              <p
                className="text-[10px] font-bold tracking-widest text-amber-500/80 mt-3 uppercase"
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
                📡 Accessing Cloud Core...
              </div>
            ) : (
              <>
                {/* LEADERBOARD VIEW BLOCK */}
                <section className="space-y-4">
                  <h2 className="text-xl font-extrabold tracking-tight text-white border-l-4 border-amber-400 pl-3">
                    Leaderboard
                  </h2>
                  {leaderboard.length === 0 ? (
                    <div className="text-sm text-slate-500 bg-slate-950/20 border border-slate-900 p-6 rounded-xl text-center">
                      No movies logged yet for this challenge season. Open the
                      Admin portal to launch!
                    </div>
                  ) : (
                    <div className="bg-slate-950/40 border border-slate-900/60 rounded-2xl divide-y divide-slate-900/40 overflow-hidden shadow-2xl">
                      {leaderboard.map((member, idx) => (
                        <div
                          key={member.name}
                          className="p-5 flex items-center justify-between hover:bg-slate-900/10 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <span
                              className={`w-7 h-7 rounded flex items-center justify-center font-black text-sm ${
                                idx === 0
                                  ? 'bg-amber-400 text-slate-950'
                                  : 'bg-slate-900 text-slate-500'
                              }`}
                            >
                              {idx + 1}
                            </span>
                            <div>
                              <h3 className="font-extrabold text-slate-200 text-base">
                                {member.name}
                              </h3>
                              <p className="text-[11px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                                {member.count} Film{member.count > 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex -space-x-2 overflow-hidden p-0.5">
                            {member.movies.map((mov, i) => (
                              <img
                                key={i}
                                src={mov.poster}
                                alt=""
                                className="w-8 h-12 object-cover rounded border border-slate-950 shadow-xl"
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* RECENTLY WATCHED FEED CORES */}
                <section className="space-y-8 pt-4">
                  <h2 className="text-md font-bold uppercase tracking-widest text-slate-500">
                    Recently Watched
                  </h2>
                  <div className="divide-y divide-slate-900/60 space-y-12">
                    {logs.map((log) => (
                      <div
                        key={`${log.name}-${log.movie}-${Math.random()}`}
                        className="flex flex-col space-y-5 pt-10 first:pt-0"
                      >
                        <div>
                          <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                            {log.movie}
                          </h3>
                          <p className="text-xs font-semibold text-amber-400/90 tracking-wide mt-1">
                            {log.genre}
                          </p>
                        </div>
                        <div className="w-full max-w-md h-80 sm:h-[450px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-900 shadow-2xl">
                          <img
                            src={log.poster}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
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
                              <span className="text-amber-400 font-bold">
                                {log.rating}
                              </span>
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              {log.review ? 'Review' : 'Plot Summary'}
                            </span>
                            {log.review ? (
                              <p className="text-sm text-slate-200 leading-relaxed bg-slate-950/40 p-4 rounded-xl border border-slate-900/50 italic border-l-2 border-amber-400/40">
                                "{log.review}"
                              </p>
                            ) : (
                              <p className="text-sm text-slate-400 leading-relaxed bg-slate-950/40 p-4 rounded-xl border border-slate-900/50">
                                {log.plot}
                              </p>
                            )}
                          </div>

                          {/* BUTTON FRAME BAR RIGHT HERE */}
                          <div className="pt-2 flex items-center justify-between">
                            <span className="text-[11px] text-slate-400 font-bold tracking-wide">
                              Watched by{' '}
                              <span className="text-white font-extrabold">
                                {log.name}
                              </span>
                            </span>

                            {/* REPLACE YOUR UNCONDITIONAL BUTTON WITH THIS EXACT LOCKED BLOCK */}
                            {passwordInput === 'cubboncinema' && (
                              <button
                                onClick={() =>
                                  handleDeleteLog(log.id, log.movie)
                                }
                                className="text-[10px] font-black tracking-widest text-rose-500 hover:text-rose-400 uppercase bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-lg transition-all ml-4"
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
                </section>
              </>
            )}
          </div>
        )}

        {/* SECURITY PROMPT VIEW */}
        {currentPage === 'login' && (
          <div className="max-w-md mx-auto mt-16 bg-slate-950/40 border border-slate-900 rounded-2xl p-6 shadow-2xl">
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
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-400"
              />
              {authError && (
                <p className="text-xs text-rose-500 font-semibold mt-1.5">
                  ❌ Incorrect passkey.
                </p>
              )}
              <button
                type="submit"
                className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold py-2.5 rounded-xl text-xs uppercase tracking-widest transition-colors"
              >
                Unlock Panel
              </button>
            </form>
          </div>
        )}

        {/* SECURE ADMIN ENTRY PANEL */}
        {currentPage === 'admin' && (
          <div className="space-y-12">
            <div className="max-w-xl mx-auto bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow-2xl">
              <div className="border-b border-slate-900 pb-3 mb-6 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight">
                    Club Curator Panel
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Add watches to update leaderboard rankings.
                  </p>
                </div>
                <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    Movie Title *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Enter film title (e.g., Mickey 17)"
                    value={movieTitle}
                    onChange={(e) => setMovieTitle(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
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
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    Review (Optional)
                  </label>
                  <textarea
                    rows="4"
                    placeholder="Type custom member thoughts... (Leave completely blank to use the official plot summary fallback description)"
                    value={memberReview}
                    onChange={(e) => setMemberReview(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-400 resize-none"
                  ></textarea>
                </div>
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="w-full bg-amber-400 hover:bg-amber-500 text-slate-950 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all shadow-lg disabled:opacity-50"
                >
                  {isPublishing
                    ? 'Publishing Link Core...'
                    : 'Publish Watch to Live Board'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
// Vercel deployment sync v2
