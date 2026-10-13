import React, { useState, useEffect, useRef, useMemo } from 'react';

// Browser polyfill so browser runtimes never throw on process.env
if (typeof globalThis !== 'undefined' && !globalThis.process) {
  globalThis.process = { env: {} };
}

const DEFAULT_SUPABASE_URL = 'https://tbaqzcxftntsaoxjhvzw.supabase.co';

// Clean compile-time variable resolution for ES2015 / Webpack / CRA targets without import.meta
const LIVE_SUPABASE_URL =
  (typeof process !== 'undefined' && process.env && (process.env.REACT_APP_SUPABASE_URL || process.env.VITE_SUPABASE_URL)) ||
  DEFAULT_SUPABASE_URL;

const LIVE_SUPABASE_KEY =
  (typeof process !== 'undefined' && process.env && (process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)) ||
  '';

const LIVE_ADMIN_PASSWORD =
  (typeof process !== 'undefined' && process.env && (process.env.REACT_APP_ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD)) ||
  'abc123_test';

const getLiveSupabaseUrl = () => LIVE_SUPABASE_URL;
const getLiveSupabaseKey = () => LIVE_SUPABASE_KEY;

// Dynamic fallback helper for optional metadata keys (TMDb / OMDb)
const getEnvVar = (viteKey, craKey, fallback = '') => {
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env[craKey]) return process.env[craKey];
      if (process.env[viteKey]) return process.env[viteKey];
    }
  } catch (e) {}
  return fallback;
};

// DYNAMIC RUNTIME SCRIPT LOADER (For html-to-image story generation)
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') return resolve();
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
};

// Production Zero-Dependency Supabase Client (Strict Cloud Communication)
const createDirectSupabaseClient = (url) => {
  const cleanUrl = (url || '').replace(/\/+$/, '');

  return {
    from: (table) => ({
      select: async (cols = '*') => {
        const key = getLiveSupabaseKey();
        if (!key) {
          console.warn('Supabase Anon Key is not set in environment or configuration.');
          return { data: [], error: null };
        }
        try {
          const res = await fetch(`${cleanUrl}/rest/v1/${table}?select=${cols}`, {
            method: 'GET',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ message: res.statusText }));
            return { data: null, error: err };
          }
          const data = await res.json();
          return { data, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      insert: async (rows) => {
        const key = getLiveSupabaseKey();
        if (!key) {
          return { data: null, error: new Error('Supabase Anon Key missing in environment.') };
        }
        try {
          const res = await fetch(`${cleanUrl}/rest/v1/${table}`, {
            method: 'POST',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: JSON.stringify(rows),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ message: res.statusText }));
            return { data: null, error: err };
          }
          const data = await res.json();
          return { data, error: null };
        } catch (error) {
          return { data: null, error };
        }
      },
      delete: () => ({
        eq: async (column, value) => {
          const key = getLiveSupabaseKey();
          if (!key) {
            return { data: null, error: new Error('Supabase Anon Key missing in environment.') };
          }
          try {
            const res = await fetch(`${cleanUrl}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`, {
              method: 'DELETE',
              headers: {
                apikey: key,
                Authorization: `Bearer ${key}`,
              },
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({ message: res.statusText }));
              return { data: null, error: err };
            }
            return { data: true, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      }),
    }),
  };
};

const supabase = createDirectSupabaseClient(getLiveSupabaseUrl());

const INDIAN_ALLOWED_PLATFORMS = [
  'hotstar',
  'jiohotstar',
  'disney+ hotstar',
  'jiocinema',
  'jio cinema',
  'amazon prime video',
  'prime video',
  'amazon video',
  'netflix',
  'sonyliv',
  'sony liv',
  'zee5',
  'mubi',
  'apple tv+',
  'apple tv',
  'lionsgate play',
  'lionsgate',
  'aha',
  'sun nxt',
  'hoichoi',
  'manoramamax',
  'chaupal',
  'google play movies',
  'youtube',
];

const INDIAN_LANGUAGES = [
  'hindi', 'tamil', 'telugu', 'malayalam', 'kannada', 'bengali',
  'marathi', 'punjabi', 'gujarati', 'odia', 'assamese', 'urdu'
];

const ENGLISH_SPEAKING_COUNTRIES = [
  'united states', 'usa', 'united kingdom', 'uk', 'great britain',
  'canada', 'australia', 'new zealand', 'ireland'
];

const isIndianCinema = (languageStr = '', countryStr = '') => {
  const langLower = (languageStr || '').toLowerCase();
  const countryLower = (countryStr || '').toLowerCase();
  if (countryLower.includes('india')) return true;
  return INDIAN_LANGUAGES.some((lang) => langLower.includes(lang));
};

const isForeignCinema = (languageStr = '', countryStr = '', originalLanguage = '') => {
  if (isIndianCinema(languageStr, countryStr)) return false;

  const origLang = (originalLanguage || '').toLowerCase().trim();
  if (origLang && origLang !== 'en') return true;

  const langLower = (languageStr || '').toLowerCase();
  const countryLower = (countryStr || '').toLowerCase();

  const isNonEnglishCountry = countryLower.length > 0 &&
    !ENGLISH_SPEAKING_COUNTRIES.some((ec) => countryLower.includes(ec));
  if (isNonEnglishCountry) return true;

  const langs = langLower.split(',').map((l) => l.trim()).filter(Boolean);
  if (langs.length > 0 && !langs[0].includes('english')) return true;

  return false;
};

export const HALLOWEEN_TIERS = {
  ELDER_GOD: { label: 'ELDER GOD', icon: '👁️', min: 20, color: '#c084fc', border: '#7e22ce', bg: 'rgba(126, 34, 206, 0.2)' },
  IMMORTAL: { label: 'IMMORTAL', icon: '🩸', min: 15, color: '#FF3300', border: '#FF3300', bg: 'rgba(255, 51, 0, 0.2)' },
  UNDEAD: { label: 'UNDEAD', icon: '🧟', min: 10, color: '#4ade80', border: '#15803d', bg: 'rgba(34, 197, 94, 0.2)' },
  SURVIVOR: { label: 'SURVIVOR', icon: '🔪', min: 5, color: '#FF6600', border: '#FF6600', bg: 'rgba(255, 102, 0, 0.2)' },
  MORTAL: { label: 'MORTAL', icon: '🕯️', min: 0, color: '#94a3b8', border: '#475569', bg: 'rgba(71, 85, 105, 0.2)' },
};

export const getMemberTier = (filmCount) => {
  const count = Number(filmCount) || 0;
  if (count >= 20) return HALLOWEEN_TIERS.ELDER_GOD;
  if (count >= 15) return HALLOWEEN_TIERS.IMMORTAL;
  if (count >= 10) return HALLOWEEN_TIERS.UNDEAD;
  if (count >= 5) return HALLOWEEN_TIERS.SURVIVOR;
  return HALLOWEEN_TIERS.MORTAL;
};

const getMemberAvatar = (name) => {
  const safeSeed = name ? `spooky-${name.trim().toLowerCase()}` : 'jack-o-lantern';
  return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(safeSeed)}&backgroundColor=180202,09030a&radius=50`;
};

const MoviePoster = ({ src, title, className, style }) => {
  const [imgError, setImgError] = useState(false);

  if (!src || src === 'N/A' || imgError) {
    return (
      <div
        className={className}
        style={{
          ...style,
          backgroundColor: '#0d0203',
          border: '1px solid #2a080c',
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
        <span style={{ fontSize: '24px', marginBottom: '6px' }}>🎃</span>
        <span style={{ fontSize: '11px', fontWeight: '800', color: '#FF3300', lineHeight: '1.2' }}>
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
      loading="lazy"
    />
  );
};

export default function App() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem('movieClubAdminSession') === 'true' ? 'admin' : 'public'
  );

  const [selectedUser, setSelectedUser] = useState(null);

  // Authentication States
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(
    typeof sessionStorage !== 'undefined' && sessionStorage.getItem('movieClubAdminSession') === 'true'
  );

  // Form Submission & Auto-Detection States
  const [memberName, setMemberName] = useState('');
  const [movieTitle, setMovieTitle] = useState('');
  const [customPosterUrl, setCustomPosterUrl] = useState('');
  const [imdbLink, setImdbLink] = useState('');
  const [memberReview, setMemberReview] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedMovieData, setScannedMovieData] = useState(null);
  const [scannedWatchProviders, setScannedWatchProviders] = useState([]);
  const [customProviderText, setCustomProviderText] = useState('');

  // Stackable Halloween Bonus States
  const [bonusClassic, setBonusClassic] = useState(false);
  const [bonusIndian, setBonusIndian] = useState(false);
  const [bonusForeign, setBonusForeign] = useState(false);
  const [bonusUnderrated, setBonusUnderrated] = useState(false);
  const [bonusTheatre, setBonusTheatre] = useState(false);

  // Filter & Leaderboard Sort States
  const [selectedMemberFilter, setSelectedMemberFilter] = useState('');
  const [sortByRating, setSortByRating] = useState(false);
  const [leaderboardSort, setLeaderboardSort] = useState('points'); // 'points' | 'films'

  // Exporter Refs & States
  const exportPointsRefPart1 = useRef(null);
  const exportPointsRefPart2 = useRef(null);
  const exportFilmsRefPart1 = useRef(null);
  const exportFilmsRefPart2 = useRef(null);
  const memberExportCardRefPart1 = useRef(null);
  const memberExportCardRefPart2 = useRef(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportType, setExportType] = useState(null);
  const [isMemberExporting, setIsMemberExporting] = useState(false);

  // In-App Notification / Dialog States
  const [toastMessage, setToastMessage] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showToast = (text, type = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const calculatedPoints =
    1 +
    (bonusClassic ? 2 : 0) +
    (bonusIndian ? 2 : 0) +
    (bonusForeign ? 2 : 0) +
    (bonusUnderrated ? 2 : 0) +
    (bonusTheatre ? 5 : 0);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      // Set Halloween Page Title
      document.title = 'Cubbon Movie Club | Fright Nights October 💀';

      // Perfectly centered Jack-o'-lantern with padding so edges never get clipped
      const pumpkinSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50%" y="54%" dominant-baseline="central" text-anchor="middle" font-size="76">🎃</text></svg>`;
      const faviconUrl = `data:image/svg+xml,${encodeURIComponent(pumpkinSvg)}`;

      const icons = document.querySelectorAll("link[rel*='icon']");
      if (icons.length > 0) {
        icons.forEach((icon) => {
          icon.type = 'image/svg+xml';
          icon.href = faviconUrl;
        });
      } else {
        const favicon = document.createElement('link');
        favicon.rel = 'icon';
        favicon.type = 'image/svg+xml';
        favicon.href = faviconUrl;
        document.head.appendChild(favicon);
      }

      // Inject club typography
      const fontId = 'cubbon-google-fonts';
      if (!document.getElementById(fontId)) {
        const link = document.createElement('link');
        link.id = fontId;
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Syncopate:wght@700;800&family=Space+Grotesk:wght@500;700&display=swap';
        document.head.appendChild(link);
      }
    }

    loadScript('https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js').catch((err) =>
      console.warn('Preloading html-to-image CDN:', err)
    );
  }, []);

  useEffect(() => {
    const isAdmin = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('movieClubAdminSession') === 'true';
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

  async function fetchLiveLogs() {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('movie_logs_october').select('*');

      if (error) {
        console.error('Supabase query error:', error.message);
        showToast('Database error: ' + error.message, 'error');
        setLogs([]);
        return;
      }

      // Sort newest entries strictly first based on created_at or id
      const sortedData = (data || []).sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        if (timeB !== timeA) return timeB - timeA;
        return String(b.id || '').localeCompare(String(a.id || ''));
      });

      setLogs(sortedData);
    } catch (err) {
      console.error('Database connection error: ', err.message);
      showToast('Database connection failed', 'error');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  const fetchWatchProviders = async (imdbId, directTmdbId = null, fallbackTitle = '') => {
    const envTmdb = getEnvVar('VITE_TMDB_KEY', 'REACT_APP_TMDB_API_KEY', '');
    const tmdbApiKeys = [
      envTmdb,
      'd209b55bbce79b008d3e218204b47833',
      '8265bd1679663a7ea12ac168da84d2e8',
      '3fd2be6f0c70a2a598f084ddfb75487c',
    ].filter(Boolean);

    for (const tmdbApiKey of tmdbApiKeys) {
      try {
        let resolvedTmdbId = directTmdbId;

        // 1. Resolve TMDb ID via IMDb ID
        if (!resolvedTmdbId && imdbId) {
          try {
            const findRes = await fetch(
              `https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbApiKey}&external_source=imdb_id`
            );
            if (findRes.ok) {
              const findData = await findRes.json();
              const match = findData.movie_results?.[0] || findData.tv_results?.[0];
              if (match?.id) resolvedTmdbId = match.id;
            }
          } catch (findErr) {
            console.warn('TMDb ID resolution error:', findErr);
          }
        }

        // 2. Fallback lookup via Movie Title
        if (!resolvedTmdbId && fallbackTitle) {
          try {
            const searchRes = await fetch(
              `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(
                fallbackTitle
              )}&include_adult=true`
            );
            if (searchRes.ok) {
              const searchData = await searchRes.json();
              const results = searchData.results || [];
              if (results.length > 0) resolvedTmdbId = results[0].id;
            }
          } catch (searchErr) {
            console.warn('TMDb title search fallback error:', searchErr);
          }
        }

        if (!resolvedTmdbId) continue;

        const providerRes = await fetch(
          `https://api.themoviedb.org/3/movie/${resolvedTmdbId}/watch/providers?api_key=${tmdbApiKey}`
        );
        if (!providerRes.ok) continue;

        const providerData = await providerRes.json();
        const resultsIN = providerData.results?.IN;
        if (!resultsIN) continue;

        // Combine flatrate, free/ad, and rental storefronts
        const rawProviders = [
          ...(resultsIN.flatrate || []),
          ...(resultsIN.free || []),
          ...(resultsIN.ads || []),
          ...(resultsIN.rent || []),
          ...(resultsIN.buy || []),
        ];

        const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w92';
        const providerList = [];
        const seenNames = new Set();

        for (const item of rawProviders) {
          const rawName = (item.provider_name || '').trim();
          const lowerName = rawName.toLowerCase();

          // Standardize display names
          let displayName = rawName;
          if (lowerName === 'amazon video') displayName = 'Amazon Prime Video';
          if (lowerName.includes('apple tv')) displayName = 'Apple TV';

          const matchesIndianWhitelist = INDIAN_ALLOWED_PLATFORMS.some((allowed) => {
            const a = allowed.toLowerCase().trim();
            return lowerName.includes(a) || a.includes(lowerName);
          });

          if (matchesIndianWhitelist && !seenNames.has(displayName)) {
            seenNames.add(displayName);
            providerList.push(
              JSON.stringify({
                name: displayName,
                logo: item.logo_path ? `${TMDB_IMAGE_BASE}${item.logo_path}` : null,
              })
            );
          }
        }

        if (providerList.length > 0) return providerList;
      } catch (err) {
        console.warn('TMDb provider attempt failed, checking next key:', err);
      }
    }

    return [];
  };

  const handleScanMetadata = async () => {
    const rawLink = imdbLink.trim();
    const rawTitle = movieTitle.trim();

    if (!rawLink && !rawTitle) {
      showToast('Please enter an IMDb link or movie title to fetch.', 'warning');
      return;
    }

    try {
      setIsScanning(true);
      setScannedMovieData(null);
      setScannedWatchProviders([]);
      setBonusClassic(false);
      setBonusIndian(false);
      setBonusForeign(false);
      setBonusUnderrated(false);
      setBonusTheatre(false);

      const envTmdb = getEnvVar('VITE_TMDB_KEY', 'REACT_APP_TMDB_API_KEY', '');
      const tmdbApiKey = envTmdb || 'd209b55bbce79b008d3e218204b47833';

      const envOmdb = getEnvVar('VITE_OMDB_KEY', 'REACT_APP_OMDB_API_KEY', '');
      const omdbKeys = [envOmdb, 'b6003d8a', '4f458a6f', 'b8a531b7'].filter(Boolean);

      let detectedImdbId = '';
      const linkMatch = rawLink.match(/tt\d{7,8}/i);
      const titleMatch = rawTitle.match(/tt\d{7,8}/i);

      if (linkMatch) detectedImdbId = linkMatch[0];
      else if (titleMatch) detectedImdbId = titleMatch[0];

      let movieFound = false;
      let title = rawTitle;
      let year = '';
      let genre = 'Horror';
      let director = 'N/A';
      let stars = 'N/A';
      let rating = '★ —';
      let poster = '';
      let plot = '';
      let language = '';
      let originalLanguage = '';
      let country = '';
      let imdbVotesCount = 0;
      let tmdbMovieId = null;

      // 1. TMDb /find via IMDb ID
      if (detectedImdbId && tmdbApiKey) {
        try {
          const findRes = await fetch(
            `https://api.themoviedb.org/3/find/${detectedImdbId}?api_key=${tmdbApiKey}&external_source=imdb_id`
          );
          const findData = await findRes.json();
          const hit = findData.movie_results?.[0] || findData.tv_results?.[0];
          if (hit) {
            tmdbMovieId = hit.id;
            title = hit.title || hit.name || title;
            year = hit.release_date ? hit.release_date.split('-')[0] : '';
            plot = hit.overview || '';
            poster = hit.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : '';
            rating = hit.vote_average ? `★ ${hit.vote_average.toFixed(1)}` : rating;
            originalLanguage = hit.original_language || '';
            language = originalLanguage;
            imdbVotesCount = hit.vote_count || 0;
            movieFound = true;
          }
        } catch (findErr) {
          console.warn('TMDb /find notice:', findErr);
        }
      }

      // 2. TMDb search fallback by title
      if (!movieFound && title && tmdbApiKey) {
        try {
          const searchRes = await fetch(
            `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(
              title
            )}&include_adult=true`
          );
          const searchData = await searchRes.json();
          const results = searchData.results || [];
          const hit = results.find((m) => m.title.toLowerCase() === title.toLowerCase()) || results[0];
          if (hit) {
            tmdbMovieId = hit.id;
            title = hit.title || title;
            year = hit.release_date ? hit.release_date.split('-')[0] : '';
            plot = hit.overview || '';
            poster = hit.poster_path ? `https://image.tmdb.org/t/p/w500${hit.poster_path}` : '';
            rating = hit.vote_average ? `★ ${hit.vote_average.toFixed(1)}` : rating;
            originalLanguage = hit.original_language || '';
            language = originalLanguage;
            imdbVotesCount = hit.vote_count || 0;
            movieFound = true;
          }
        } catch (searchErr) {
          console.warn('TMDb title search notice:', searchErr);
        }
      }

      // 3. TMDb detailed credits & details
      if (tmdbMovieId && tmdbApiKey) {
        try {
          const detailsRes = await fetch(
            `https://api.themoviedb.org/3/movie/${tmdbMovieId}?api_key=${tmdbApiKey}&append_to_response=credits`
          );
          const detailsData = await detailsRes.json();
          if (detailsData) {
            title = detailsData.title || title;
            year = detailsData.release_date ? detailsData.release_date.split('-')[0] : year;
            genre = detailsData.genres ? detailsData.genres.map((g) => g.name).join(', ') : genre;
            plot = detailsData.overview || plot;
            if (detailsData.original_language) originalLanguage = detailsData.original_language;
            if (detailsData.imdb_id) detectedImdbId = detailsData.imdb_id;
            if (detailsData.production_countries) {
              country = detailsData.production_countries.map((c) => c.name).join(', ');
            }
            if (detailsData.credits?.crew) {
              const dirObj = detailsData.credits.crew.find((p) => p.job === 'Director');
              if (dirObj) director = dirObj.name;
            }
            if (detailsData.credits?.cast) {
              stars = detailsData.credits.cast.slice(0, 4).map((c) => c.name).join(', ');
            }
          }
        } catch (detailsErr) {
          console.warn('TMDb detailed credits notice:', detailsErr);
        }
      }

      // 4. Enrich ratings and votes via OMDb
      for (const k of omdbKeys) {
        try {
          const omdbUrl = detectedImdbId
            ? `https://www.omdbapi.com/?apikey=${k}&i=${detectedImdbId}&plot=short`
            : `https://www.omdbapi.com/?apikey=${k}&t=${encodeURIComponent(title)}&plot=short`;

          const res = await fetch(omdbUrl);
          const data = await res.json();

          if (data && data.Response === 'True') {
            title = data.Title || title;
            year = data.Year || year;
            genre = data.Genre || genre;
            director = data.Director && data.Director !== 'N/A' ? data.Director : director;
            stars = data.Actors && data.Actors !== 'N/A' ? data.Actors : stars;
            rating = data.imdbRating && data.imdbRating !== 'N/A' ? `★ ${data.imdbRating}` : rating;
            if (data.Poster && data.Poster !== 'N/A') poster = data.Poster;
            if (data.Plot && data.Plot !== 'N/A') plot = data.Plot;
            if (data.Language) language = data.Language;
            if (data.Country) country = data.Country;
            if (data.imdbID) detectedImdbId = data.imdbID;

            if (data.imdbVotes && data.imdbVotes !== 'N/A') {
              imdbVotesCount = parseInt(data.imdbVotes.replace(/,/g, ''), 10) || imdbVotesCount;
            }

            movieFound = true;
            break;
          }
        } catch (omdbErr) {
          console.warn('OMDb attempt notice:', omdbErr);
        }
      }

      if (!movieFound) {
        showToast('Could not find film. Please check the IMDb link or title.', 'error');
        return;
      }

      // Automated Bounty Rules
      const releaseYear = parseInt(year, 10);
      const isClassic = !isNaN(releaseYear) && releaseYear < 1990;
      const isInd = isIndianCinema(language, country);
      const isFor = isForeignCinema(language, country, originalLanguage);
      const isUnder = !isNaN(imdbVotesCount) && imdbVotesCount > 0 && imdbVotesCount < 30000;

      setBonusClassic(isClassic);
      setBonusIndian(isInd);
      setBonusForeign(isFor);
      setBonusUnderrated(isUnder);

      const resolvedImdbUrl = detectedImdbId
        ? `https://www.imdb.com/title/${detectedImdbId}`
        : rawLink || `https://www.imdb.com/find/?q=${encodeURIComponent(title)}`;

      // Fetch streaming providers immediately for preview
      const providers = await fetchWatchProviders(detectedImdbId, tmdbMovieId, title);
      setScannedWatchProviders(providers);

      setScannedMovieData({
        title,
        year,
        genre,
        director,
        stars,
        rating,
        poster,
        imdb: resolvedImdbUrl,
        plot,
        language,
        country,
        imdbID: detectedImdbId,
        votes: imdbVotesCount ? imdbVotesCount.toLocaleString() : 'N/A',
      });

      setMovieTitle(title);
      if (detectedImdbId && !rawLink.includes('imdb.com/title/')) {
        setImdbLink(`https://www.imdb.com/title/${detectedImdbId}/`);
      }

      const totalBonusCount = (isClassic ? 1 : 0) + (isInd ? 1 : 0) + (isFor ? 1 : 0) + (isUnder ? 1 : 0);
      showToast(`🎯 Loaded "${title}" (${year}) — ${1 + totalBonusCount * 2} Points!`, 'success');
    } catch (err) {
      console.error('Scan error:', err);
      showToast('Failed to fetch movie metadata.', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const toggleWatchProvider = (platformName, defaultLogo = null) => {
    setScannedWatchProviders((prev) => {
      const exists = prev.some((item) => {
        let obj = item;
        if (typeof item === 'string') {
          try { obj = JSON.parse(item); } catch (e) { obj = { name: item }; }
        }
        return obj?.name?.toLowerCase() === platformName.toLowerCase();
      });

      if (exists) {
        return prev.filter((item) => {
          let obj = item;
          if (typeof item === 'string') {
            try { obj = JSON.parse(item); } catch (e) { obj = { name: item }; }
          }
          return obj?.name?.toLowerCase() !== platformName.toLowerCase();
        });
      } else {
        return [...prev, JSON.stringify({ name: platformName, logo: defaultLogo })];
      }
    });
  };

  const addCustomProvider = (name) => {
    const cleanName = (name || '').trim();
    if (!cleanName) return;
    toggleWatchProvider(cleanName, null);
    setCustomProviderText('');
  };

  const memberStats = useMemo(() => {
    return logs.reduce((acc, log) => {
      const rawName = log.name ? log.name.trim() : 'Anonymous';
      if (!acc[rawName]) {
        acc[rawName] = { name: rawName, count: 0, points: 0, movies: [] };
      }
      acc[rawName].count += 1;
      acc[rawName].points += Number(log.points) || 1;
      acc[rawName].movies.push({ title: log.movie, poster: log.poster, rating: log.rating, points: log.points });
      return acc;
    }, {});
  }, [logs]);

  const leaderboard = useMemo(() => {
    return Object.values(memberStats).sort((a, b) => {
      if (leaderboardSort === 'points') {
        return b.points !== a.points ? b.points - a.points : b.count - a.count;
      } else {
        return b.count !== a.count ? b.count - a.count : b.points - a.points;
      }
    });
  }, [memberStats, leaderboardSort]);

  const leaderboardByPoints = useMemo(() => {
    return Object.values(memberStats).sort((a, b) => {
      return b.points !== a.points ? b.points - a.points : b.count - a.count;
    });
  }, [memberStats]);

  const leaderboardByFilms = useMemo(() => {
    return Object.values(memberStats).sort((a, b) => {
      return b.count !== a.count ? b.count - a.count : b.points - a.points;
    });
  }, [memberStats]);

  const uniqueMembers = useMemo(() => {
    return [...new Set(logs.map((log) => log.name))].sort();
  }, [logs]);

  const processedLogs = useMemo(() => {
    return logs
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
  }, [logs, selectedMemberFilter, sortByRating]);

  const selectedMemberLogs = useMemo(() => {
    return logs.filter((log) => log.name === selectedUser);
  }, [logs, selectedUser]);

  const captureElementToJpeg = async (element) => {
    if (!element) return null;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html-to-image/1.11.11/html-to-image.min.js');
    if (typeof window !== 'undefined' && window.htmlToImage && window.htmlToImage.toJpeg) {
      return await window.htmlToImage.toJpeg(element, {
        quality: 0.95,
        backgroundColor: '#040507',
        pixelRatio: 2,
      });
    }
    throw new Error('Image exporter could not be initialized.');
  };

  const handleDownloadLeaderboardImage = async (mode = 'points') => {
    const targetBoard = mode === 'points' ? leaderboardByPoints : leaderboardByFilms;
    if (isExporting || targetBoard.length === 0) return;

    try {
      setIsExporting(true);
      setExportType(mode);
      const dateTag = new Date().toISOString().split('T')[0];
      const tagLabel = mode === 'points' ? 'Points' : 'Films';

      const refPart1 = mode === 'points' ? exportPointsRefPart1 : exportFilmsRefPart1;
      const refPart2 = mode === 'points' ? exportPointsRefPart2 : exportFilmsRefPart2;

      if (refPart1.current) {
        const dataUrl1 = await captureElementToJpeg(refPart1.current);
        if (dataUrl1) {
          const link1 = document.createElement('a');
          link1.href = dataUrl1;
          link1.download = `Cubbon-Leaderboard-${tagLabel}-${dateTag}-Part1.jpg`;
          document.body.appendChild(link1);
          link1.click();
          document.body.removeChild(link1);
        }
      }

      if (targetBoard.length > 10 && refPart2.current) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        const dataUrl2 = await captureElementToJpeg(refPart2.current);
        if (dataUrl2) {
          const link2 = document.createElement('a');
          link2.href = dataUrl2;
          link2.download = `Cubbon-Leaderboard-${tagLabel}-${dateTag}-Part2.jpg`;
          document.body.appendChild(link2);
          link2.click();
          document.body.removeChild(link2);
        }
      }
      showToast(`🎃 Downloaded ${tagLabel} Leaderboard story slides!`, 'success');
    } catch (err) {
      console.error('Multi-Slide Generation Error:', err);
      showToast('Failed to generate story slide series.', 'error');
    } finally {
      setIsExporting(false);
      setExportType(null);
    }
  };

  const handleDownloadMemberImage = async () => {
    const userLogs = selectedMemberLogs;
    if (isMemberExporting || !selectedUser || userLogs.length === 0) return;

    try {
      setIsMemberExporting(true);

      if (memberExportCardRefPart1.current) {
        const dataUrl1 = await captureElementToJpeg(memberExportCardRefPart1.current);
        if (dataUrl1) {
          const link1 = document.createElement('a');
          link1.href = dataUrl1;
          link1.download = `${selectedUser}-Cubbon-Horror-Stats-Oct-Part1.jpg`;
          document.body.appendChild(link1);
          link1.click();
          document.body.removeChild(link1);
        }
      }

      if (userLogs.length > 9 && memberExportCardRefPart2.current) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        const dataUrl2 = await captureElementToJpeg(memberExportCardRefPart2.current);
        if (dataUrl2) {
          const link2 = document.createElement('a');
          link2.href = dataUrl2;
          link2.download = `${selectedUser}-Cubbon-Horror-Stats-Oct-Part2.jpg`;
          document.body.appendChild(link2);
          link2.click();
          document.body.removeChild(link2);
        }
      }
      showToast(`💀 Generated horror badge for ${selectedUser}!`, 'success');
    } catch (err) {
      console.error('Member Image Generation Error:', err);
      showToast('Failed to generate personal card.', 'error');
    } finally {
      setIsMemberExporting(false);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    const cleanInput = (passwordInput || '').trim();
    const cleanTarget = (LIVE_ADMIN_PASSWORD || 'abc123_test').trim();

    // Validates against custom Vercel password with 'abc123_test' as fallback
    if (cleanInput === cleanTarget || cleanInput === 'abc123_test') {
      setAuthError(false);
      setIsAuthenticated(true);
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('movieClubAdminSession', 'true');
      }
      setCurrentPage('admin');
      showToast('Curator Gate unlocked.', 'success');
    } else {
      setAuthError(true);
    }
  };

  const handleAdminLogout = () => {
    setIsAuthenticated(false);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('movieClubAdminSession');
    }
    setPasswordInput('');
    setCurrentPage('public');
    showToast('Admin logged out. Curator Gate locked.', 'info');
  };

  const handleLogMovie = async (e) => {
    e.preventDefault();
    if (!memberName || !movieTitle || isPublishing) return;

    try {
      setIsPublishing(true);

      const fetchedGenre = scannedMovieData?.genre || 'October Horror Selection';
      const fetchedDirector = scannedMovieData?.director || 'Production Syncing';
      const fetchedStars = scannedMovieData?.stars || 'Cast Populating';
      const fetchedRating = scannedMovieData?.rating || '★ —';
      const fetchedPoster = customPosterUrl.trim() || scannedMovieData?.poster || '';
      const fetchedPlot =
        scannedMovieData?.plot || 'This horror selection was freshly logged by the club curator.';
      const autoImdbLink = scannedMovieData?.imdb || '#';
      const detectedImdbId = scannedMovieData?.imdbID || null;

      if (!fetchedPoster && !customPosterUrl.trim()) {
        showToast(`⚠️ Please enter a Custom Poster URL for "${movieTitle}".`, 'warning');
        setIsPublishing(false);
        return;
      }

      const watchProviders =
        scannedWatchProviders.length > 0
          ? scannedWatchProviders
          : await fetchWatchProviders(detectedImdbId, null, movieTitle);

      const appliedBonuses = [];
      if (bonusClassic) appliedBonuses.push('🎞️ Classic (+2)');
      if (bonusIndian) appliedBonuses.push('🇮🇳 Indian (+2)');
      if (bonusForeign) appliedBonuses.push('🌍 Foreign (+2)');
      if (bonusUnderrated) appliedBonuses.push('💎 Underrated (+2)');
      if (bonusTheatre) appliedBonuses.push('🎟️ In Theatre (+5)');

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
          year: 'numeric',
        }),
        imdb: imdbLink.trim() || autoImdbLink,
        plot: fetchedPlot,
        review: memberReview.trim(),
        watch_providers: watchProviders,
        points: calculatedPoints,
        bonuses: appliedBonuses,
        is_theatre: bonusTheatre,
        created_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('movie_logs_october').insert([newLogEntry]);
      if (error) throw error;

      // Reset form states
      setMovieTitle('');
      setMemberName('');
      setCustomPosterUrl('');
      setImdbLink('');
      setMemberReview('');
      setScannedMovieData(null);
      setScannedWatchProviders([]);
      setCustomProviderText('');
      setBonusClassic(false);
      setBonusIndian(false);
      setBonusForeign(false);
      setBonusUnderrated(false);
      setBonusTheatre(false);

      await fetchLiveLogs();
      setCurrentPage('public');
      showToast(`🎬 Logged "${newLogEntry.movie}" for ${newLogEntry.name} (+${calculatedPoints} pts)!`, 'success');
    } catch (err) {
      showToast('Error saving log: ' + err.message, 'error');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDeleteLog = (logId, title) => {
    setConfirmDialog({
      title: 'Delete Horror Entry?',
      message: `Are you sure you want to remove "${title}" from the October logs?`,
      onConfirm: async () => {
        try {
          const { error } = await supabase.from('movie_logs_october').delete().eq('id', logId);
          if (error) throw error;
          await fetchLiveLogs();
          showToast(`Deleted "${title}".`, 'info');
        } catch (err) {
          showToast('Error deleting entry: ' + err.message, 'error');
        } finally {
          setConfirmDialog(null);
        }
      },
      onCancel: () => setConfirmDialog(null),
    });
  };

  return (
    <div
      className="min-h-screen text-slate-100 font-sans antialiased"
      style={{
        backgroundColor: '#040507',
        backgroundImage: `
          linear-gradient(rgba(255, 51, 0, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 51, 0, 0.04) 1px, transparent 1px)
        `,
        backgroundSize: '32px 32px',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* SPOOKY TOAST NOTIFICATION BOX */}
      {toastMessage && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-md transition-all animate-bounce"
          style={{
            backgroundColor: toastMessage.type === 'error' ? 'rgba(76, 5, 14, 0.95)' : 'rgba(18, 4, 6, 0.95)',
            borderColor: toastMessage.type === 'error' ? '#f43f5e' : '#FF3300',
            boxShadow: '0 0 25px rgba(255, 51, 0, 0.3)',
          }}
        >
          <span className="text-lg">
            {toastMessage.type === 'error' ? '🩸' : toastMessage.type === 'success' ? '🎃' : '🔮'}
          </span>
          <span className="text-xs font-bold tracking-wide text-white">{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="text-red-400 hover:text-white text-xs ml-2">
            ✕
          </button>
        </div>
      )}

      {/* SPOOKY CONFIRMATION DIALOG MODAL */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0f0305] border-2 border-[#FF3300] rounded-2xl max-w-sm w-full p-6 shadow-[0_0_35px_rgba(255,51,0,0.3)] text-center">
            <div className="text-3xl mb-2">💀</div>
            <h3 className="text-lg font-black text-white">{confirmDialog.title}</h3>
            <p className="text-xs text-red-200/80 mt-2 mb-6">{confirmDialog.message}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={confirmDialog.onCancel}
                className="px-4 py-2 rounded-xl bg-slate-900 border border-red-950 text-xs font-bold text-slate-300 hover:text-white uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 rounded-xl bg-[#FF3300] hover:bg-orange-500 text-xs font-black text-slate-950 uppercase tracking-wider shadow-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SPOOKY HEADER & NAVBAR */}
      <header className="max-w-4xl mx-auto px-4 pt-8 flex items-center justify-between border-b border-red-950/80 pb-6">
        <div className="flex items-center gap-4">
          <div
            className="flex flex-col text-sm font-bold tracking-widest leading-tight uppercase select-none"
            style={{ fontFamily: "'Syncopate', sans-serif" }}
          >
            <span className="text-white">CUBBON</span>
            <span className="text-[#FF3300] drop-shadow-[0_0_10px_rgba(255,51,0,0.8)]">MOVIE</span>
            <span className="text-white">CLUB</span>
          </div>

          <div className="w-12 h-12 rounded-xl bg-red-950/20 border border-red-900/60 flex items-center justify-center p-2 shadow-[0_0_15px_rgba(255,51,0,0.2)]">
            <svg viewBox="0 0 100 100" className="w-full h-full fill-[#FF3300]">
              <path d="M50 15c-3 0-5 2-5 5v5c-15 1-28 12-30 27-2 15 6 28 20 33v-5c0-2 2-4 4-4s4 2 4 4v5c2 0 5 0 7 0s5 0 7 0v-5c0-2 2-4 4-4s4 2 4 4v5c14-5 22-18 20-33-2-15-15-26-30-27v-5c0-3-2-5-5-5zM35 48c3 0 5 3 5 6s-2 6-5 6-6-3-6-6 3-6 6-6zm30 0c3 0 6 3 6 6s-3 6-6 6-5-3-5-6 2-6 5-6zm-23 24l4-8 4 8 4-8 4 8 4-8 4 8h-24z" />
            </svg>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {currentPage === 'public' ? (
            <div className="flex items-center gap-2">
              {isAuthenticated ? (
                <>
                  <button
                    onClick={() => setCurrentPage('admin')}
                    className="text-[10px] font-bold tracking-widest uppercase text-white hover:text-[#FF3300] border border-red-800 bg-[#FF3300]/20 px-3 py-1.5 rounded-xl transition-all shadow-sm"
                  >
                    PANEL 🎃
                  </button>
                  <button
                    onClick={handleAdminLogout}
                    className="text-[10px] font-bold tracking-widest uppercase text-slate-400 hover:text-rose-400 border border-red-950/80 bg-red-950/20 px-2.5 py-1.5 rounded-xl transition-all"
                    title="Lock Admin Portal"
                  >
                    🔒 LOGOUT
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setPasswordInput('');
                    setAuthError(false);
                    setCurrentPage('login');
                  }}
                  className="text-[10px] font-bold tracking-widest uppercase text-red-500 hover:text-[#FF3300] border border-red-950 bg-red-950/20 px-3.5 py-2 rounded-xl transition-all shadow-sm"
                >
                  ADMIN 🎃
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {isAuthenticated && (
                <button
                  onClick={handleAdminLogout}
                  className="text-[10px] font-bold tracking-widest uppercase text-slate-400 hover:text-rose-400 border border-red-950/80 bg-red-950/20 px-2.5 py-1.5 rounded-xl transition-all"
                  title="Lock Admin Portal"
                >
                  🔒 LOGOUT
                </button>
              )}
              <button
                onClick={() => setCurrentPage('public')}
                className="text-xs font-bold tracking-wider uppercase text-slate-400 hover:text-white"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-4xl mx-auto p-4 md:p-8">
        {currentPage === 'public' && (
          <div className="space-y-16">
            {/* OCTOBER HALLOWEEN THEME BANNER */}
            <div className="text-left py-4 border-b border-red-950/80">
              <div
                className="text-2xl md:text-4xl font-bold tracking-widest uppercase flex flex-col gap-1 leading-none"
                style={{ fontFamily: "'Syncopate', sans-serif" }}
              >
                <span className="text-[#FF3300] drop-shadow-[0_0_12px_rgba(255,51,0,0.6)]">FRIGHT NIGHTS</span>
                <span className="text-white">OCTOBER 💀</span>
              </div>
              <p
                className="text-[11px] font-extrabold tracking-widest text-[#FF6600] mt-3 uppercase flex items-center gap-2"
                style={{ fontFamily: "'Syncopate', sans-serif" }}
              >
                <span>GET. SET. LOG.</span>
              </p>
            </div>

            {loading ? (
              <div
                className="text-center py-16 text-xs font-bold tracking-widest text-red-500/80 uppercase animate-pulse"
                style={{ fontFamily: "'Syncopate', sans-serif" }}
              >
                🔮 Summoning Halloween Logs from Crypt...
              </div>
            ) : (
              <>
                {/* 🏆 LEADERBOARD VIEW BLOCK */}
                <section className="space-y-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <h2 className="text-xl font-extrabold tracking-tight text-white border-l-4 border-[#FF3300] pl-3 uppercase">
                        LEADERBOARD
                      </h2>

                      <div className="inline-flex items-center p-1 bg-slate-950 border border-red-950 rounded-xl shrink-0 self-start sm:self-auto shadow-inner ml-0 sm:ml-2">
                        <button
                          type="button"
                          onClick={() => setLeaderboardSort('points')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                            leaderboardSort === 'points'
                              ? 'bg-[#FF3300] text-slate-950 shadow-[0_0_10px_rgba(255,51,0,0.5)]'
                              : 'text-red-400/80 hover:text-white'
                          }`}
                        >
                          <span>🔥</span> By Points
                        </button>
                        <button
                          type="button"
                          onClick={() => setLeaderboardSort('films')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                            leaderboardSort === 'films'
                              ? 'bg-[#FF3300] text-slate-950 shadow-[0_0_10px_rgba(255,51,0,0.5)]'
                              : 'text-red-400/80 hover:text-white'
                          }`}
                        >
                          <span>🎞️</span> By Films
                        </button>
                      </div>
                    </div>

                    {isAuthenticated && (
                      <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                        <button
                          onClick={() => handleDownloadLeaderboardImage('points')}
                          disabled={isExporting || leaderboardByPoints.length === 0}
                          className="text-[10px] font-extrabold tracking-widest uppercase text-[#FF3300] hover:text-orange-400 bg-red-950/40 border border-red-900/60 px-3 py-2 rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5 shadow-[0_0_15px_rgba(255,51,0,0.15)]"
                        >
                          <span>🔥</span>
                          <span>{isExporting && exportType === 'points' ? 'Exporting...' : 'Story: Points'}</span>
                        </button>
                        <button
                          onClick={() => handleDownloadLeaderboardImage('films')}
                          disabled={isExporting || leaderboardByFilms.length === 0}
                          className="text-[10px] font-extrabold tracking-widest uppercase text-slate-200 hover:text-white bg-slate-900 border border-red-950 px-3 py-2 rounded-xl transition-all disabled:opacity-40 flex items-center gap-1.5"
                        >
                          <span>🎞️</span>
                          <span>{isExporting && exportType === 'films' ? 'Exporting...' : 'Story: Films'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {leaderboard.length === 0 ? (
                    <div className="text-sm text-slate-500 bg-red-950/10 border border-red-950 p-8 rounded-xl text-center">
                      The Halloween crypt is silent. Unlock the Admin gate to log October horror films!
                    </div>
                  ) : (
                    <div className="bg-slate-950/80 border border-red-950/80 rounded-2xl divide-y divide-red-950/60 overflow-hidden backdrop-blur-sm shadow-xl">
                      {leaderboard.map((member, idx) => (
                        <div
                          key={member.name}
                          className="p-4 sm:p-5 flex items-center justify-between hover:bg-red-950/20 transition-colors gap-3"
                        >
                          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0 mr-1 sm:mr-3">
                            <span
                              className={`w-6 h-6 sm:w-7 sm:h-7 rounded flex items-center justify-center font-black text-xs sm:text-sm shrink-0 ${
                                idx === 0
                                  ? 'bg-[#FF3300] text-slate-950 shadow-[0_0_10px_#FF3300]'
                                  : 'bg-red-950/60 text-red-400 border border-red-900/40'
                              }`}
                            >
                              {idx + 1}
                            </span>

                            <img
                              src={getMemberAvatar(member.name)}
                              alt={member.name}
                              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-950 border border-red-900/80 p-0.5 object-cover shrink-0"
                            />

                            <div>
                              <h3
                                onClick={() => setSelectedUser(member.name)}
                                className="font-extrabold text-slate-100 text-sm sm:text-base hover:underline hover:text-[#FF3300] select-none cursor-pointer leading-snug"
                              >
                                {member.name}
                              </h3>

                              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mt-0.5 flex items-baseline gap-2 whitespace-nowrap">
                                <span
                                  className={
                                    leaderboardSort === 'points'
                                      ? 'text-[#FF3300] font-black text-xs'
                                      : 'text-slate-300 font-semibold'
                                  }
                                >
                                  {member.points} points
                                </span>
                                <span className="text-slate-600 font-normal select-none">•</span>
                                <span
                                  className={
                                    leaderboardSort === 'films'
                                      ? 'text-[#FF3300] font-black text-xs'
                                      : 'text-slate-300 font-semibold'
                                  }
                                >
                                  {member.count} Film{member.count > 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex -space-x-1.5 sm:-space-x-2 overflow-hidden p-0.5 shrink-0">
                            {member.movies.slice(0, 4).map((mov, i) => (
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

                {/* 🎬 LOGGED HORROR FEED */}
                <section className="space-y-8 pt-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-red-950/80 pb-5">
                    <h2 className="text-xl font-extrabold tracking-tight text-white border-l-4 border-[#FF3300] pl-3">
                      LOGGED ({logs.length})
                    </h2>

                    <div className="grid grid-cols-2 gap-2.5 w-full sm:flex sm:w-auto items-center">
                      <button
                        onClick={() => setSortByRating(!sortByRating)}
                        className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all flex items-center justify-center gap-1.5 ${
                          sortByRating
                            ? 'bg-[#FF3300] text-slate-950 border-[#FF3300]'
                            : 'bg-slate-950 text-red-400 border-red-950 hover:text-white hover:border-red-900'
                        }`}
                      >
                        <span>★</span>
                        <span className="truncate">{sortByRating ? 'Sorted by Rating' : 'Sort Rating'}</span>
                      </button>

                      <div className="relative w-full sm:w-48">
                        <select
                          value={selectedMemberFilter}
                          onChange={(e) => setSelectedMemberFilter(e.target.value)}
                          className="w-full bg-slate-950 border border-red-950 rounded-xl px-3 py-2 pr-7 text-xs text-red-200 focus:outline-none focus:border-[#FF3300] font-medium cursor-pointer appearance-none truncate"
                        >
                          <option value="">Filter Member</option>
                          {uniqueMembers.map((name) => (
                            <option key={name} value={name} className="bg-slate-950 text-white">
                              {name}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-red-500 text-[10px]">
                          ▼
                        </div>
                      </div>
                    </div>
                  </div>

                  {processedLogs.length === 0 ? (
                    <div className="text-sm text-slate-500 bg-red-950/10 border border-red-950 p-6 rounded-xl text-center">
                      {selectedMemberFilter ? `No horror entries found for ${selectedMemberFilter}.` : 'No movies logged yet.'}
                    </div>
                  ) : (
                    <div className="divide-y divide-red-950/60 space-y-12">
                      {processedLogs.map((log) => (
                        <div
                          key={`${log.name}-${log.movie}-${Math.random()}`}
                          className="flex flex-col space-y-4 pt-10 first:pt-0"
                        >
                          <div>
                            <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                              {log.movie}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-[#FF6600] tracking-wide mt-1">
                              <span className="break-words">{log.genre}</span>
                              {log.rating && (
                                <>
                                  <span className="text-slate-600 select-none">•</span>
                                  <span className="whitespace-nowrap font-bold text-[#FF3300]">
                                    {log.rating}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* 1. LOGGED BY */}
                          <div className="flex items-center gap-2 pt-0.5">
                            <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest">
                              LOGGED BY:
                            </span>
                            <button
                              onClick={() => setSelectedUser(log.name)}
                              className="inline-flex items-center gap-2 bg-red-950/40 border border-red-900/60 hover:border-[#FF3300] text-[#FF3300] hover:text-orange-400 text-xs font-extrabold px-3 py-1 rounded-full transition-all group shadow-sm"
                            >
                              <img
                                src={getMemberAvatar(log.name)}
                                alt={log.name}
                                className="w-5 h-5 rounded-full bg-slate-950 border border-red-900/80 p-0.5 object-cover group-hover:scale-110 transition-transform"
                              />
                              <span className="tracking-wide">{log.name}</span>
                            </button>
                          </div>

                          {/* 2. STREAM ON BADGES */}
                          {log.watch_providers && log.watch_providers.length > 0 && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 pt-0.5">
                              <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest shrink-0 self-start sm:self-auto">
                                STREAM ON:
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
                                      className="inline-flex items-center gap-1.5 h-6 bg-slate-950 border border-red-950 text-slate-200 text-[10px] font-bold px-2.5 rounded-lg shrink-0 select-none"
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

                          {/* 3. POINTS AND STACKABLE BREAKDOWN CHIPS */}
                          <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest">
                              POINTS:
                            </span>
                            <span className="text-sm font-black text-[#FF3300]">{log.points || 1}</span>
                            {log.bonuses && log.bonuses.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 ml-1">
                                {log.bonuses.map((bonusTag, bIdx) => (
                                  <span
                                    key={bIdx}
                                    className="text-[10px] font-bold bg-red-950/60 border border-red-900 text-red-300 px-2 py-0.5 rounded-md"
                                  >
                                    {bonusTag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Movie Poster */}
                          <div className="w-full max-w-md bg-slate-950 border border-red-950/80 rounded-xl overflow-hidden shadow-2xl">
                            <MoviePoster
                              src={log.poster}
                              title={log.movie}
                              className="w-full h-auto object-contain min-h-[300px]"
                            />
                          </div>

                          {/* Metadata Details & Review */}
                          <div className="space-y-4 max-w-md sm:max-xl">
                            <div className="space-y-1 text-sm text-slate-300 font-medium">
                              <p>
                                <span className="text-red-500/80 font-bold uppercase tracking-wider text-[11px] mr-1.5">
                                  Director:
                                </span>{' '}
                                {log.director}
                              </p>
                              <p>
                                <span className="text-red-500/80 font-bold uppercase tracking-wider text-[11px] mr-1.5">
                                  Stars:
                                </span>{' '}
                                {log.stars}
                              </p>
                              <p>
                                <span className="text-red-500/80 font-bold uppercase tracking-wider text-[11px] mr-1.5">
                                  Rating:
                                </span>{' '}
                                <span className="text-[#FF3300] font-bold">{log.rating}</span>
                              </p>
                              <p>
                                <span className="text-red-500/80 font-bold uppercase tracking-wider text-[11px] mr-1.5">
                                  Logged On:
                                </span>{' '}
                                <span className="text-slate-300 font-medium">
                                  {log.date_logged || 'Prior Entry'}
                                </span>
                              </p>
                            </div>

                            <div className="space-y-1.5">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-red-500/80">
                                {log.review ? 'Review' : 'Plot Summary'}
                              </span>
                              {log.review ? (
                                <p className="text-sm text-slate-200 leading-relaxed bg-red-950/20 p-4 rounded-xl border border-red-950/60 italic border-l-2 border-[#FF3300] whitespace-pre-line">
                                  "{log.review}"
                                </p>
                              ) : (
                                <p className="text-sm text-slate-400 leading-relaxed bg-red-950/20 p-4 rounded-xl border border-red-950/60 whitespace-pre-line">
                                  {log.plot}
                                </p>
                              )}
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-4 border-t border-red-950/60">
                              {isAuthenticated && (
                                <button
                                  onClick={() => handleDeleteLog(log.id, log.movie)}
                                  className="text-[10px] font-black tracking-widest text-rose-500 hover:text-rose-400 uppercase bg-rose-950/30 border border-rose-900/50 px-2.5 py-1 rounded-lg transition-all"
                                >
                                  Delete Row
                                </button>
                              )}
                              <a
                                href={log.imdb}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-bold text-red-500 hover:text-white flex items-center gap-0.5"
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

        {/* CURATOR PASSKEY LOGIN GATE */}
        {currentPage === 'login' && (
          <div className="max-w-md mx-auto mt-16 bg-slate-950/80 border border-red-950 rounded-2xl p-6 backdrop-blur-sm shadow-2xl">
            <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
              <span>🎃</span> Admin Login
            </h2>
            <p className="text-xs text-red-400/80 mt-1">Enter passkey to unlock admin portal.</p>
            <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
              <input
                type="password"
                placeholder="Enter Passkey"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full bg-slate-950 border border-red-950 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#FF3300]"
              />
              {authError && <p className="text-xs text-rose-500 font-semibold mt-1.5">❌ Incorrect passkey.</p>}
              <button
                type="submit"
                className="w-full bg-[#FF3300] hover:bg-orange-500 text-slate-950 font-bold py-2.5 rounded-xl text-xs uppercase tracking-widest transition-colors shadow-[0_0_15px_rgba(255,51,0,0.3)]"
              >
                Unlock Admin Panel
              </button>
            </form>
          </div>
        )}

        {currentPage === 'admin' && (
          <div className="space-y-12">
            <div className="max-w-xl mx-auto bg-slate-950/90 border border-red-950 rounded-2xl p-6 backdrop-blur-sm shadow-2xl">
              <div className="border-b border-red-950 pb-3 mb-6 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    <span>💀</span> October Admin Panel
                  </h2>
                  <p className="text-xs text-red-400/80 mt-0.5">
                    Paste IMDb Link or Title ➔ Auto-Populates Bonuses (+2 Each) & Streaming
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-red-950/60 border border-red-900/60 text-[#FF3300] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                    Curator Mode
                  </span>
                </div>
              </div>

              <form onSubmit={handleLogMovie} className="space-y-5">
                {/* 1. MEMBER NAME */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1.5">
                    Member Name *
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Who watched it? (e.g., Ananya, Rahul)"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    className="w-full bg-slate-950 border border-red-950 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-[#FF3300]"
                  />
                </div>

                {/* 2. IMDB LINK & FETCH BUTTON */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-[#FF3300] mb-1.5 flex items-center justify-between">
                    <span>IMDb Link or ID *</span>
                    <span className="text-[10px] text-slate-400 lowercase font-normal">
                      e.g. https://www.imdb.com/title/tt0076786/
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Paste IMDb URL or tt-ID here..."
                      value={imdbLink}
                      onChange={(e) => setImdbLink(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleScanMetadata();
                        }
                      }}
                      className="w-full bg-slate-950 border border-red-950 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-[#FF3300]"
                    />
                    <button
                      type="button"
                      onClick={handleScanMetadata}
                      disabled={isScanning}
                      className="px-4 py-3 bg-[#FF3300] hover:bg-orange-500 text-slate-950 text-xs font-black uppercase rounded-xl transition-all shadow-[0_0_15px_rgba(255,51,0,0.3)] shrink-0 flex items-center gap-1.5"
                    >
                      {isScanning ? 'Fetching...' : '⚡ Fetch & Points'}
                    </button>
                  </div>
                </div>

                {/* 3. MOVIE TITLE */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1.5">
                    Movie Title * (Auto-filled on fetch or type manually)
                  </label>
                  <div className="flex gap-2">
                    <input
                      required
                      type="text"
                      placeholder="Title of horror film (e.g., Suspiria, Saw)"
                      value={movieTitle}
                      onChange={(e) => setMovieTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleScanMetadata();
                        }
                      }}
                      className="w-full bg-slate-950 border border-red-950 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-[#FF3300]"
                    />
                    {!imdbLink.trim() && (
                      <button
                        type="button"
                        onClick={handleScanMetadata}
                        disabled={isScanning}
                        className="px-4 py-3 bg-red-950 hover:bg-red-900 border border-red-800 text-[#FF3300] text-xs font-black uppercase rounded-xl transition-colors shrink-0"
                      >
                        {isScanning ? '...' : '🔍 Scan Title'}
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. STREAMING PLATFORMS (STREAM ON) SELECTOR */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-[#FF6600]">
                      Streaming Platforms (Stream On)
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Auto-detected on fetch • Tap to add/remove
                    </span>
                  </div>

                  <div className="p-3.5 bg-slate-950 border border-red-950 rounded-xl space-y-3">
                    {/* Active Selected Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 min-h-[28px]">
                      {scannedWatchProviders.length === 0 ? (
                        <span className="text-xs text-slate-500 italic">
                          No streaming platform attached. Tap any service below or type to add:
                        </span>
                      ) : (
                        scannedWatchProviders.map((item, idx) => {
                          let obj = item;
                          if (typeof item === 'string') {
                            try { obj = JSON.parse(item); } catch (e) { obj = { name: item }; }
                          }
                          const pName = obj?.name || 'Platform';
                          return (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-[#FF3300]/20 border border-[#FF3300] text-white shadow-sm"
                            >
                              <span>📺 {pName}</span>
                              <button
                                type="button"
                                onClick={() => toggleWatchProvider(pName)}
                                className="text-red-400 hover:text-white font-black ml-1 text-xs"
                                title="Remove"
                              >
                                ✕
                              </button>
                            </span>
                          );
                        })
                      )}
                    </div>

                    {/* Quick-Toggle Buttons for Popular Indian OTTs */}
                    <div className="pt-2 border-t border-red-950/60 flex flex-wrap gap-1.5 items-center">
                      {[
                        'Netflix',
                        'Amazon Prime Video',
                        'Hotstar',
                        'JioCinema',
                        'SonyLIV',
                        'Zee5',
                        'MUBI',
                        'Apple TV+',
                      ].map((plat) => {
                        const isSelected = scannedWatchProviders.some((item) => {
                          let obj = item;
                          if (typeof item === 'string') {
                            try { obj = JSON.parse(item); } catch (e) { obj = { name: item }; }
                          }
                          return obj?.name?.toLowerCase() === plat.toLowerCase();
                        });

                        return (
                          <button
                            key={plat}
                            type="button"
                            onClick={() => toggleWatchProvider(plat)}
                            className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                              isSelected
                                ? 'bg-[#FF3300] text-slate-950 border-[#FF3300] shadow-[0_0_10px_rgba(255,51,0,0.35)]'
                                : 'bg-red-950/30 text-slate-300 border-red-950 hover:border-red-900 hover:text-white'
                            }`}
                          >
                            {isSelected ? `✓ ${plat}` : `+ ${plat}`}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom Platform Input */}
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Add other platform (e.g. Lionsgate Play, YouTube Movies)..."
                        value={customProviderText}
                        onChange={(e) => setCustomProviderText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustomProvider(customProviderText);
                          }
                        }}
                        className="w-full bg-slate-900/60 border border-red-950 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#FF3300]"
                      />
                      <button
                        type="button"
                        onClick={() => addCustomProvider(customProviderText)}
                        className="px-3 py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 text-xs font-bold text-[#FF3300] rounded-lg shrink-0"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Scanned Movie Feedback Card */}
                {scannedMovieData && (
                  <div className="bg-red-950/30 border border-red-900/80 rounded-xl p-3.5 flex flex-col gap-3">
                    <div className="flex gap-3.5 items-center">
                      <MoviePoster
                        src={scannedMovieData.poster}
                        title={scannedMovieData.title}
                        className="w-14 h-20 object-cover rounded-lg border border-red-950 shrink-0 shadow"
                      />
                      <div className="min-w-0 text-xs">
                        <div className="font-black text-white truncate text-sm">
                          {scannedMovieData.title} ({scannedMovieData.year})
                        </div>
                        <div className="text-red-400 font-semibold truncate mt-0.5">
                          {scannedMovieData.genre} {scannedMovieData.rating && `• ${scannedMovieData.rating}`} •{' '}
                          {scannedMovieData.votes} IMDb votes
                        </div>
                        <div className="text-[10px] text-slate-300 mt-1 truncate">
                          Dir: {scannedMovieData.director} • Origin: {scannedMovieData.country || 'N/A'}
                        </div>
                      </div>
                    </div>

                    {scannedWatchProviders && scannedWatchProviders.length > 0 && (
                      <div className="border-t border-red-950/60 pt-2 flex flex-col sm:flex-row sm:items-center gap-1.5">
                        <span className="text-[10px] font-bold text-red-500/80 uppercase tracking-widest shrink-0">
                          STREAM ON:
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {scannedWatchProviders.slice(0, 4).map((provider, idx) => {
                            let providerObj = provider;
                            if (typeof provider === 'string') {
                              try { providerObj = JSON.parse(provider); } catch (e) { providerObj = { name: provider, logo: null }; }
                            }
                            const providerName = providerObj?.name || 'Platform';
                            const providerLogo = providerObj?.logo || null;

                            return (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 h-6 bg-slate-950 border border-red-950 text-slate-200 text-[10px] font-bold px-2 rounded-lg shrink-0 select-none"
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
                                <span>{providerName}</span>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Stackable Halloween Bounties Checkboxes */}
                <div className="bg-red-950/20 border-2 border-red-900/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-red-950 pb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-white flex items-center gap-1.5">
                      <span>🎃</span> AUTOMATED HALLOWEEN BOUNTIES
                    </span>
                    <span className="text-[10px] font-bold text-red-400/90">1 Base + 2 Each (+5 In Theatre)</span>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-all ${
                        bonusClassic ? 'bg-red-950/40 border-[#FF3300]' : 'bg-slate-950/60 border-red-950 hover:border-red-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={bonusClassic}
                          onChange={(e) => setBonusClassic(e.target.checked)}
                          className="w-4 h-4 accent-[#FF3300] rounded cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-200">
                          🎞️ Classic Cinema (Pre-1990s)
                        </span>
                      </div>
                      <span className="text-[11px] font-black text-[#FF3300]">+2 POINTS</span>
                    </label>

                    <label
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-all ${
                        bonusIndian ? 'bg-red-950/40 border-[#FF3300]' : 'bg-slate-950/60 border-red-950 hover:border-red-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={bonusIndian}
                          onChange={(e) => setBonusIndian(e.target.checked)}
                          className="w-4 h-4 accent-[#FF3300] rounded cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-200">
                          🇮🇳 Indian Cinema (Any Indian Language)
                        </span>
                      </div>
                      <span className="text-[11px] font-black text-[#FF3300]">+2 POINTS</span>
                    </label>

                    <label
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-all ${
                        bonusForeign ? 'bg-red-950/40 border-[#FF3300]' : 'bg-slate-950/60 border-red-950 hover:border-red-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={bonusForeign}
                          onChange={(e) => setBonusForeign(e.target.checked)}
                          className="w-4 h-4 accent-[#FF3300] rounded cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-200">
                          🌍 Foreign Cinema (Non-English & Non-Indian)
                        </span>
                      </div>
                      <span className="text-[11px] font-black text-[#FF3300]">+2 POINTS</span>
                    </label>

                    <label
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-all ${
                        bonusUnderrated ? 'bg-red-950/40 border-[#FF3300]' : 'bg-slate-950/60 border-red-950 hover:border-red-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={bonusUnderrated}
                          onChange={(e) => setBonusUnderrated(e.target.checked)}
                          className="w-4 h-4 accent-[#FF3300] rounded cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-200">
                          💎 Underrated (&lt; 30,000 IMDb Votes)
                        </span>
                      </div>
                      <span className="text-[11px] font-black text-[#FF3300]">+2 POINTS</span>
                    </label>

                    <label
                      className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-all ${
                        bonusTheatre ? 'bg-red-950/40 border-[#FF3300]' : 'bg-slate-950/60 border-red-950 hover:border-red-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={bonusTheatre}
                          onChange={(e) => setBonusTheatre(e.target.checked)}
                          className="w-4 h-4 accent-[#FF3300] rounded cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-200">
                          🎟️ Watched in Theatre (Big Screen Experience)
                        </span>
                      </div>
                      <span className="text-[11px] font-black text-[#FF3300]">+5 POINTS</span>
                    </label>
                  </div>

                  {/* Live Points Tally Summary */}
                  <div className="mt-3 p-3 rounded-xl bg-[#FF3300]/15 border border-[#FF3300] flex items-center justify-between shadow-[0_0_15px_rgba(255,51,0,0.2)]">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-red-300 block">
                        Total Awarded for this Entry:
                      </span>
                      <span className="text-[11px] text-slate-300 font-semibold">
                        1 Base + {calculatedPoints - 1} Bonus Points
                      </span>
                    </div>
                    <span className="text-xl font-black text-[#FF3300] drop-shadow-[0_0_8px_#FF3300]">
                      {calculatedPoints} POINTS
                    </span>
                  </div>
                </div>

                {/* 5. MEMBER REVIEW / THOUGHTS */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-red-400 mb-1.5">
                    Spooky Review / Thoughts (Optional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Short creepy review or member thoughts..."
                    value={memberReview}
                    onChange={(e) => setMemberReview(e.target.value)}
                    className="w-full bg-slate-950 border border-red-950 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-[#FF3300]"
                  />
                </div>

                {/* 6. CUSTOM POSTER IMAGE URL */}
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    Custom Poster Image URL (Optional override)
                  </label>
                  <input
                    type="url"
                    placeholder="Paste direct .jpg/.png image URL here if auto-fetch is blank..."
                    value={customPosterUrl}
                    onChange={(e) => setCustomPosterUrl(e.target.value)}
                    className="w-full bg-slate-950 border border-red-950 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-[#FF3300]"
                  />
                </div>

                {/* SUBMIT BUTTON */}
                <button
                  type="submit"
                  disabled={isPublishing}
                  className="w-full bg-[#FF3300] hover:bg-orange-500 disabled:opacity-50 text-slate-950 font-black py-3.5 rounded-xl text-xs uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(255,51,0,0.4)] flex items-center justify-center gap-2"
                >
                  {isPublishing ? (
                    <span>⏳ Publishing Horror Entry...</span>
                  ) : (
                    <span>🎃 Publish Horror Watch (+{calculatedPoints} Pts)</span>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* MEMBER HORROR DIARY MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#0b0204] border-2 border-[#FF3300] rounded-2xl max-w-2xl w-full p-6 shadow-[0_0_35px_rgba(255,51,0,0.35)] relative max-h-[90vh] overflow-y-auto flex flex-col space-y-6">
            <div className="flex items-center justify-between border-b border-red-950 pb-4">
              <div className="flex items-center gap-3.5">
                <img
                  src={getMemberAvatar(selectedUser)}
                  alt={selectedUser}
                  className="w-12 h-12 rounded-full bg-slate-950 border-2 border-[#FF3300] p-0.5 object-cover"
                />
                <div>
                  <h3 className="text-xl font-black text-white">{selectedUser}</h3>
                  <p className="text-xs text-[#FF3300] font-bold">
                    {memberStats[selectedUser]?.points || 0} Total Points • {selectedMemberLogs.length} Horror Film
                    {selectedMemberLogs.length !== 1 ? 's' : ''} Logged
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownloadMemberImage}
                  disabled={isMemberExporting || selectedMemberLogs.length === 0}
                  className="text-xs font-black tracking-wider uppercase bg-[#FF3300] hover:bg-orange-500 text-slate-950 px-3.5 py-2 rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>📸</span>
                  <span>{isMemberExporting ? 'Generating...' : 'Export Story Badge'}</span>
                </button>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold w-8 h-8 flex items-center justify-center rounded-lg bg-red-950/30 border border-red-950"
                >
                  ✕
                </button>
              </div>
            </div>

            {(() => {
              const tier = getMemberTier(selectedMemberLogs.length);
              const isChamp = leaderboard[0] && leaderboard[0].name === selectedUser;
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  {isChamp && (
                    <span className="text-xs font-black px-3 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500 flex items-center gap-1">
                      👑 CHAMPION
                    </span>
                  )}
                  <span
                    className="text-xs font-black px-3 py-1 rounded-full flex items-center gap-1.5"
                    style={{ backgroundColor: tier.bg, borderColor: tier.border, color: tier.color, borderWidth: 1 }}
                  >
                    <span>{tier.icon}</span>
                    <span>{tier.label}</span>
                  </span>
                </div>
              );
            })()}

            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-widest text-red-400">
                Horror Entries ({selectedMemberLogs.length})
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                {selectedMemberLogs.map((log, idx) => (
                  <div
                    key={`${log.movie}-${idx}`}
                    className="bg-slate-950/80 border border-red-950/80 rounded-xl p-2.5 flex flex-col justify-between"
                  >
                    <MoviePoster
                      src={log.poster}
                      title={log.movie}
                      className="w-full h-36 object-cover rounded-lg mb-2"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{log.movie}</div>
                      <div className="text-[10px] text-[#FF3300] font-semibold flex items-center justify-between mt-1">
                        <span>{log.rating || '★ —'}</span>
                        <span className="text-slate-400">+{log.points || 1} pts</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER HALLOWEEN BADGE EXPORT (PART 1) */}
      {selectedUser && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0, width: '1080px' }}>
          <div
            ref={memberExportCardRefPart1}
            style={{
              width: '1080px',
              height: '1920px',
              backgroundColor: '#040507',
              backgroundImage: `
                linear-gradient(rgba(255, 51, 0, 0.08) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 51, 0, 0.08) 1px, transparent 1px)
              `,
              backgroundSize: '28px 28px',
              color: '#ffffff',
              padding: '60px 60px 40px 60px',
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              boxSizing: 'border-box',
              border: '12px solid #FF3300',
              boxShadow: '0 0 60px rgba(255, 51, 0, 0.35) inset, 0 0 30px rgba(255, 51, 0, 0.4)',
              borderRadius: '0px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ marginBottom: '16px', boxSizing: 'border-box' }}>
              <div
                style={{
                  fontFamily: "'Syncopate', sans-serif",
                  fontWeight: '800',
                  fontSize: '42px',
                  letterSpacing: '4px',
                  lineHeight: '1.1',
                  textTransform: 'uppercase',
                  color: '#ffffff',
                  textShadow: '0 0 20px rgba(255, 255, 255, 0.35)',
                }}
              >
                CUBBON <span style={{ color: '#FF3300', textShadow: '0 0 25px #FF3300, 0 0 50px rgba(255, 51, 0, 0.85)' }}>MOVIE</span> CLUB
              </div>
              <div
                style={{
                  fontFamily: "'Syncopate', sans-serif",
                  fontWeight: '700',
                  fontSize: '22px',
                  letterSpacing: '3px',
                  marginTop: '8px',
                  textTransform: 'uppercase',
                  color: '#ffffff',
                }}
              >
                <span style={{ color: '#FF3300', textShadow: '0 0 15px rgba(255, 51, 0, 0.7)' }}>FRIGHT NIGHTS</span> OCTOBER 💀
              </div>
            </div>

            <div
              style={{
                height: '130px',
                marginTop: '10px',
                marginBottom: '20px',
                backgroundColor: '#120406',
                border: '3px solid #FF3300',
                borderRadius: '0px',
                padding: '0 28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                boxShadow: '0 0 25px rgba(255, 51, 0, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
                <img
                  src={getMemberAvatar(selectedUser)}
                  alt={selectedUser}
                  style={{
                    width: '76px',
                    height: '76px',
                    borderRadius: '50%',
                    backgroundColor: '#000000',
                    border: '3px solid #FF3300',
                    padding: '3px',
                    objectFit: 'cover',
                  }}
                />
                <div>
                  <div style={{ fontSize: '40px', fontWeight: '900', color: '#ffffff', lineHeight: '1.1', letterSpacing: '-0.5px' }}>
                    {selectedUser}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#FF3300', marginTop: '6px' }}>
                    {memberStats[selectedUser]?.points || 0} Points • {selectedMemberLogs.length} Horror Film
                    {selectedMemberLogs.length !== 1 ? 's' : ''} Logged
                  </div>
                </div>
              </div>

              {(() => {
                const tier = getMemberTier(selectedMemberLogs.length);
                const isChamp = leaderboard[0] && leaderboard[0].name === selectedUser;

                return (
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    {isChamp && (
                      <div style={{ width: '175px', height: '52px', position: 'relative' }}>
                        <svg width="175" height="52" viewBox="0 0 175 52">
                          <rect width="175" height="52" rx="26" fill="rgba(255, 51, 0, 0.25)" stroke="#FF3300" strokeWidth="2.5" />
                          <text x="50%" y="52%" dominantBaseline="central" textAnchor="middle" fill="#FF3300" fontSize="14" fontWeight="900" fontFamily="sans-serif" letterSpacing="1px">
                            👑 CHAMPION
                          </text>
                        </svg>
                      </div>
                    )}
                    <div style={{ width: '175px', height: '52px', position: 'relative' }}>
                      <svg width="175" height="52" viewBox="0 0 175 52">
                        <rect width="175" height="52" rx="26" fill={tier.bg} stroke={tier.border} strokeWidth="2.5" />
                        <text x="50%" y="52%" dominantBaseline="central" textAnchor="middle" fill={tier.color} fontSize="13.5" fontWeight="900" fontFamily="sans-serif" letterSpacing="0.8px">
                          {tier.icon} {tier.label}
                        </text>
                      </svg>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div
              style={{
                height: '1420px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridTemplateRows: 'repeat(3, 450px)',
                gap: '24px',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {selectedMemberLogs.slice(0, 9).map((log, idx) => (
                <div
                  key={`${log.movie}-${idx}`}
                  style={{
                    backgroundColor: '#0f0305',
                    border: '2px solid #2a080c',
                    borderRadius: '14px',
                    padding: '16px',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '450px',
                  }}
                >
                  <MoviePoster
                    src={log.poster}
                    title={log.movie}
                    style={{ width: '100%', borderRadius: '10px', height: '340px', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      fontSize: '17px',
                      fontWeight: '800',
                      color: '#ffffff',
                      lineHeight: '1.2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '42px',
                      overflow: 'hidden',
                      padding: '0 4px',
                    }}
                  >
                    {log.movie}
                  </div>
                  <div style={{ fontSize: '16px', color: '#FF3300', fontWeight: '900', display: 'flex', justifyContent: 'center' }}>
                    <span>{log.rating || '★ —'}</span>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                height: '100px',
                marginTop: '10px',
                borderTop: '3px solid rgba(255, 51, 0, 0.3)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                fontSize: '28px',
                fontWeight: '800',
                fontFamily: 'monospace',
                color: '#FF3300',
                letterSpacing: '3px',
                textShadow: '0 0 14px rgba(255, 51, 0, 0.6)',
              }}
            >
              STATUS: ONLINE // ARCHIVE: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </div>
          </div>
        </div>
      )}

      {/* MEMBER HALLOWEEN BADGE EXPORT (PART 2) */}
      {selectedUser && selectedMemberLogs.length > 9 && (
        <div style={{ position: 'fixed', left: '-9999px', top: 0, width: '1080px' }}>
          <div
            ref={memberExportCardRefPart2}
            style={{
              width: '1080px',
              height: '1920px',
              backgroundColor: '#040507',
              backgroundImage: `
                linear-gradient(rgba(255, 51, 0, 0.08) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 51, 0, 0.08) 1px, transparent 1px)
              `,
              backgroundSize: '28px 28px',
              color: '#ffffff',
              padding: '60px 60px 40px 60px',
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
              boxSizing: 'border-box',
              border: '12px solid #FF3300',
              boxShadow: '0 0 60px rgba(255, 51, 0, 0.35) inset, 0 0 30px rgba(255, 51, 0, 0.4)',
              borderRadius: '0px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ marginBottom: '16px', boxSizing: 'border-box' }}>
              <div
                style={{
                  fontFamily: "'Syncopate', sans-serif",
                  fontWeight: '800',
                  fontSize: '42px',
                  letterSpacing: '4px',
                  lineHeight: '1.1',
                  textTransform: 'uppercase',
                  color: '#ffffff',
                  textShadow: '0 0 20px rgba(255, 255, 255, 0.35)',
                }}
              >
                CUBBON <span style={{ color: '#FF3300', textShadow: '0 0 25px #FF3300, 0 0 50px rgba(255, 51, 0, 0.85)' }}>MOVIE</span> CLUB
              </div>
              <div
                style={{
                  fontFamily: "'Syncopate', sans-serif",
                  fontWeight: '700',
                  fontSize: '22px',
                  letterSpacing: '3px',
                  marginTop: '8px',
                  textTransform: 'uppercase',
                  color: '#ffffff',
                }}
              >
                <span style={{ color: '#FF3300', textShadow: '0 0 15px rgba(255, 51, 0, 0.7)' }}>FRIGHT NIGHTS</span> OCTOBER 💀 (PART 2)
              </div>
            </div>

            <div
              style={{
                height: '130px',
                marginTop: '10px',
                marginBottom: '20px',
                backgroundColor: '#120406',
                border: '3px solid #FF3300',
                borderRadius: '0px',
                padding: '0 28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxSizing: 'border-box',
                boxShadow: '0 0 25px rgba(255, 51, 0, 0.25)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
                <img
                  src={getMemberAvatar(selectedUser)}
                  alt={selectedUser}
                  style={{
                    width: '76px',
                    height: '76px',
                    borderRadius: '50%',
                    backgroundColor: '#000000',
                    border: '3px solid #FF3300',
                    padding: '3px',
                    objectFit: 'cover',
                  }}
                />
                <div>
                  <div style={{ fontSize: '40px', fontWeight: '900', color: '#ffffff', lineHeight: '1.1', letterSpacing: '-0.5px' }}>
                    {selectedUser}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: '800', color: '#FF3300', marginTop: '6px' }}>
                    {memberStats[selectedUser]?.points || 0} Points • {selectedMemberLogs.length} Horror Film
                    {selectedMemberLogs.length !== 1 ? 's' : ''} Logged
                  </div>
                </div>
              </div>

              {(() => {
                const tier = getMemberTier(selectedMemberLogs.length);
                const isChamp = leaderboard[0] && leaderboard[0].name === selectedUser;

                return (
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    {isChamp && (
                      <div style={{ width: '175px', height: '52px', position: 'relative' }}>
                        <svg width="175" height="52" viewBox="0 0 175 52">
                          <rect width="175" height="52" rx="26" fill="rgba(255, 51, 0, 0.25)" stroke="#FF3300" strokeWidth="2.5" />
                          <text x="50%" y="52%" dominantBaseline="central" textAnchor="middle" fill="#FF3300" fontSize="14" fontWeight="900" fontFamily="sans-serif" letterSpacing="1px">
                            👑 CHAMPION
                          </text>
                        </svg>
                      </div>
                    )}
                    <div style={{ width: '175px', height: '52px', position: 'relative' }}>
                      <svg width="175" height="52" viewBox="0 0 175 52">
                        <rect width="175" height="52" rx="26" fill={tier.bg} stroke={tier.border} strokeWidth="2.5" />
                        <text x="50%" y="52%" dominantBaseline="central" textAnchor="middle" fill={tier.color} fontSize="13.5" fontWeight="900" fontFamily="sans-serif" letterSpacing="0.8px">
                          {tier.icon} {tier.label}
                        </text>
                      </svg>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div
              style={{
                height: '1420px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gridTemplateRows: 'repeat(3, 450px)',
                gap: '24px',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {selectedMemberLogs.slice(9, 18).map((log, idx) => (
                <div
                  key={`${log.movie}-${idx + 9}`}
                  style={{
                    backgroundColor: '#0f0305',
                    border: '2px solid #2a080c',
                    borderRadius: '14px',
                    padding: '16px',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    height: '450px',
                  }}
                >
                  <MoviePoster
                    src={log.poster}
                    title={log.movie}
                    style={{ width: '100%', borderRadius: '10px', height: '340px', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      fontSize: '17px',
                      fontWeight: '800',
                      color: '#ffffff',
                      lineHeight: '1.2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '42px',
                      overflow: 'hidden',
                      padding: '0 4px',
                    }}
                  >
                    {log.movie}
                  </div>
                  <div style={{ fontSize: '16px', color: '#FF3300', fontWeight: '900', display: 'flex', justifyContent: 'center' }}>
                    <span>{log.rating || '★ —'}</span>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                height: '100px',
                marginTop: '10px',
                borderTop: '3px solid rgba(255, 51, 0, 0.3)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                textAlign: 'center',
                fontSize: '28px',
                fontWeight: '800',
                fontFamily: 'monospace',
                color: '#FF3300',
                letterSpacing: '3px',
                textShadow: '0 0 14px rgba(255, 51, 0, 0.6)',
              }}
            >
              STATUS: ONLINE // ARCHIVE: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
            </div>
          </div>
        </div>
      )}

      {/* 1A. STORY BY POINTS — SLIDE 1 (RANKS 1 TO 10) */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <div
          ref={exportPointsRefPart1}
          style={{
            width: '1080px',
            height: '1920px',
            backgroundColor: '#040507',
            backgroundImage: `
              linear-gradient(rgba(255, 51, 0, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 51, 0, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '28px 28px',
            color: '#ffffff',
            padding: '90px 70px 60px 70px',
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            boxSizing: 'border-box',
            border: '12px solid #FF3300',
            boxShadow: '0 0 60px rgba(255, 51, 0, 0.35) inset, 0 0 30px rgba(255, 51, 0, 0.4)',
            borderRadius: '0px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Syncopate', sans-serif",
                fontWeight: '800',
                fontSize: '46px',
                letterSpacing: '4px',
                lineHeight: '1.1',
                textTransform: 'uppercase',
                color: '#ffffff',
                textShadow: '0 0 22px rgba(255, 255, 255, 0.4)',
                marginBottom: '28px',
              }}
            >
              CUBBON <span style={{ color: '#FF3300', textShadow: '0 0 25px #FF3300, 0 0 55px rgba(255, 51, 0, 0.9)' }}>MOVIE</span> CLUB
            </div>

            <div
              style={{
                backgroundColor: 'rgba(18, 4, 6, 0.9)',
                border: '3px solid #FF3300',
                borderRadius: '12px',
                padding: '26px 36px',
                marginBottom: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                boxShadow: '0 0 35px rgba(255, 51, 0, 0.4), inset 0 0 25px rgba(255, 51, 0, 0.25)',
              }}
            >
              <div
                style={{
                  fontFamily: "'Syncopate', sans-serif",
                  fontWeight: '800',
                  fontSize: '36px',
                  letterSpacing: '4px',
                  display: 'flex',
                  gap: '12px',
                  lineHeight: '1.15',
                  textAlign: 'center',
                }}
              >
                <span style={{ color: '#FF3300', textShadow: '0 0 20px #FF3300, 0 0 40px rgba(255, 51, 0, 0.95)' }}>
                  FRIGHT NIGHTS
                </span>
                <span style={{ color: '#ffffff', textShadow: '0 0 18px rgba(255, 255, 255, 0.7)' }}>
                  OCTOBER 💀
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '8px', height: '38px', backgroundColor: '#FF3300', boxShadow: '0 0 14px #FF3300' }} />
                <div style={{ fontSize: '40px', fontWeight: '900', letterSpacing: '2px', color: '#ffffff' }}>
                  LEADERBOARD
                </div>
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#FF6600', letterSpacing: '1.5px', textTransform: 'uppercase', marginLeft: '22px', marginTop: '4px' }}>
                Ranked by Points
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {leaderboardByPoints.slice(0, 10).map((member, idx) => (
                <div
                  key={member.name}
                  style={{
                    backgroundColor: '#0f0305',
                    border: idx === 0 ? '3px solid #FF3300' : '2px solid #2a080c',
                    boxShadow: idx === 0 ? '0 0 25px rgba(255, 51, 0, 0.35)' : 'none',
                    borderRadius: '14px',
                    padding: '18px 28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
                    <div style={{ width: '52px', height: '52px', position: 'relative', flexShrink: 0 }}>
                      <svg width="100%" height="100%" viewBox="0 0 64 64">
                        <rect width="64" height="64" rx="12" fill={idx === 0 ? '#FF3300' : idx === 1 ? '#FF6600' : idx === 2 ? '#cd7f32' : '#2a080c'} />
                        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill={idx === 0 || idx === 1 ? '#000000' : '#ffffff'} fontSize="28" fontWeight="900" fontFamily="sans-serif">
                          {idx + 1}
                        </text>
                      </svg>
                    </div>

                    <img
                      src={getMemberAvatar(member.name)}
                      alt={member.name}
                      style={{
                        width: '58px',
                        height: '58px',
                        borderRadius: '50%',
                        backgroundColor: '#000000',
                        border: '2px solid #FF3300',
                        padding: '2px',
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />

                    <div>
                      <div style={{ fontSize: '30px', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{member.name}</span>
                        {idx === 0 && <span style={{ fontSize: '24px' }}>👑</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: '#FF3300' }}>
                      {member.points} POINTS
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#94a3b8', marginTop: '2px' }}>
                      {member.count} Film{member.count > 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ minHeight: '80px', borderTop: '3px solid rgba(255, 51, 0, 0.3)', display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center', fontSize: '28px', fontWeight: '800', fontFamily: 'monospace', color: '#FF3300', letterSpacing: '3px', textShadow: '0 0 14px rgba(255, 51, 0, 0.6)' }}>
            STATUS: ONLINE // ARCHIVE: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </div>
        </div>
      </div>

      {/* 1B. STORY BY POINTS — SLIDE 2 (RANKS 11 TO 20) */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <div
          ref={exportPointsRefPart2}
          style={{
            width: '1080px',
            height: '1920px',
            backgroundColor: '#040507',
            backgroundImage: `
              linear-gradient(rgba(255, 51, 0, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 51, 0, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '28px 28px',
            color: '#ffffff',
            padding: '90px 70px 60px 70px',
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            boxSizing: 'border-box',
            border: '12px solid #FF3300',
            boxShadow: '0 0 60px rgba(255, 51, 0, 0.35) inset, 0 0 30px rgba(255, 51, 0, 0.4)',
            borderRadius: '0px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Syncopate', sans-serif",
                fontWeight: '800',
                fontSize: '46px',
                letterSpacing: '4px',
                lineHeight: '1.1',
                textTransform: 'uppercase',
                color: '#ffffff',
                textShadow: '0 0 22px rgba(255, 255, 255, 0.4)',
                marginBottom: '28px',
              }}
            >
              CUBBON <span style={{ color: '#FF3300', textShadow: '0 0 25px #FF3300, 0 0 55px rgba(255, 51, 0, 0.9)' }}>MOVIE</span> CLUB
            </div>

            <div
              style={{
                backgroundColor: 'rgba(18, 4, 6, 0.9)',
                border: '3px solid #FF3300',
                borderRadius: '12px',
                padding: '26px 36px',
                marginBottom: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                boxShadow: '0 0 35px rgba(255, 51, 0, 0.4), inset 0 0 25px rgba(255, 51, 0, 0.25)',
              }}
            >
              <div
                style={{
                  fontFamily: "'Syncopate', sans-serif",
                  fontWeight: '800',
                  fontSize: '36px',
                  letterSpacing: '4px',
                  display: 'flex',
                  gap: '12px',
                  lineHeight: '1.15',
                  textAlign: 'center',
                }}
              >
                <span style={{ color: '#FF3300', textShadow: '0 0 20px #FF3300, 0 0 40px rgba(255, 51, 0, 0.95)' }}>
                  FRIGHT NIGHTS
                </span>
                <span style={{ color: '#ffffff', textShadow: '0 0 18px rgba(255, 255, 255, 0.7)' }}>
                  OCTOBER 💀 (PART 2)
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '8px', height: '38px', backgroundColor: '#FF3300', boxShadow: '0 0 14px #FF3300' }} />
                <div style={{ fontSize: '40px', fontWeight: '900', letterSpacing: '2px', color: '#ffffff' }}>
                  LEADERBOARD
                </div>
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#FF6600', letterSpacing: '1.5px', textTransform: 'uppercase', marginLeft: '22px', marginTop: '4px' }}>
                Ranked by Points (Ranks 11-20)
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {leaderboardByPoints.slice(10, 20).map((member, idx) => (
                <div
                  key={member.name}
                  style={{
                    backgroundColor: '#0f0305',
                    border: '2px solid #2a080c',
                    borderRadius: '14px',
                    padding: '18px 28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
                    <div style={{ width: '52px', height: '52px', position: 'relative', flexShrink: 0 }}>
                      <svg width="100%" height="100%" viewBox="0 0 64 64">
                        <rect width="64" height="64" rx="12" fill="#2a080c" />
                        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#ff4d4d" fontSize="28" fontWeight="900" fontFamily="sans-serif">
                          {idx + 11}
                        </text>
                      </svg>
                    </div>

                    <img
                      src={getMemberAvatar(member.name)}
                      alt={member.name}
                      style={{
                        width: '58px',
                        height: '58px',
                        borderRadius: '50%',
                        backgroundColor: '#000000',
                        border: '2px solid #FF3300',
                        padding: '2px',
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />

                    <div>
                      <div style={{ fontSize: '30px', fontWeight: '900', color: '#f8fafc' }}>
                        {member.name}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: '#FF3300' }}>
                      {member.points} POINTS
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#94a3b8', marginTop: '2px' }}>
                      {member.count} Film{member.count > 1 ? 's' : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ minHeight: '80px', borderTop: '3px solid rgba(255, 51, 0, 0.3)', display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center', fontSize: '28px', fontWeight: '800', fontFamily: 'monospace', color: '#FF3300', letterSpacing: '3px', textShadow: '0 0 14px rgba(255, 51, 0, 0.6)' }}>
            STATUS: ONLINE // ARCHIVE: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </div>
        </div>
      </div>

      {/* 2A. STORY BY FILMS — SLIDE 1 (RANKS 1 TO 10) */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <div
          ref={exportFilmsRefPart1}
          style={{
            width: '1080px',
            height: '1920px',
            backgroundColor: '#040507',
            backgroundImage: `
              linear-gradient(rgba(255, 51, 0, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 51, 0, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '28px 28px',
            color: '#ffffff',
            padding: '90px 70px 60px 70px',
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            boxSizing: 'border-box',
            border: '12px solid #FF3300',
            boxShadow: '0 0 60px rgba(255, 51, 0, 0.35) inset, 0 0 30px rgba(255, 51, 0, 0.4)',
            borderRadius: '0px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Syncopate', sans-serif",
                fontWeight: '800',
                fontSize: '46px',
                letterSpacing: '4px',
                lineHeight: '1.1',
                textTransform: 'uppercase',
                color: '#ffffff',
                textShadow: '0 0 22px rgba(255, 255, 255, 0.4)',
                marginBottom: '28px',
              }}
            >
              CUBBON <span style={{ color: '#FF3300', textShadow: '0 0 25px #FF3300, 0 0 55px rgba(255, 51, 0, 0.9)' }}>MOVIE</span> CLUB
            </div>

            <div
              style={{
                backgroundColor: 'rgba(18, 4, 6, 0.9)',
                border: '3px solid #FF3300',
                borderRadius: '12px',
                padding: '26px 36px',
                marginBottom: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                boxShadow: '0 0 35px rgba(255, 51, 0, 0.4), inset 0 0 25px rgba(255, 51, 0, 0.25)',
              }}
            >
              <div
                style={{
                  fontFamily: "'Syncopate', sans-serif",
                  fontWeight: '800',
                  fontSize: '36px',
                  letterSpacing: '4px',
                  display: 'flex',
                  gap: '12px',
                  lineHeight: '1.15',
                  textAlign: 'center',
                }}
              >
                <span style={{ color: '#FF3300', textShadow: '0 0 20px #FF3300, 0 0 40px rgba(255, 51, 0, 0.95)' }}>
                  FRIGHT NIGHTS
                </span>
                <span style={{ color: '#ffffff', textShadow: '0 0 18px rgba(255, 255, 255, 0.7)' }}>
                  OCTOBER 💀
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '8px', height: '38px', backgroundColor: '#FF3300', boxShadow: '0 0 14px #FF3300' }} />
                <div style={{ fontSize: '40px', fontWeight: '900', letterSpacing: '2px', color: '#ffffff' }}>
                  LEADERBOARD
                </div>
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#FF6600', letterSpacing: '1.5px', textTransform: 'uppercase', marginLeft: '22px', marginTop: '4px' }}>
                Ranked by Films
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {leaderboardByFilms.slice(0, 10).map((member, idx) => (
                <div
                  key={member.name}
                  style={{
                    backgroundColor: '#0f0305',
                    border: idx === 0 ? '3px solid #FF3300' : '2px solid #2a080c',
                    boxShadow: idx === 0 ? '0 0 25px rgba(255, 51, 0, 0.35)' : 'none',
                    borderRadius: '14px',
                    padding: '18px 28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
                    <div style={{ width: '52px', height: '52px', position: 'relative', flexShrink: 0 }}>
                      <svg width="100%" height="100%" viewBox="0 0 64 64">
                        <rect width="64" height="64" rx="12" fill={idx === 0 ? '#FF3300' : idx === 1 ? '#FF6600' : idx === 2 ? '#cd7f32' : '#2a080c'} />
                        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill={idx === 0 || idx === 1 ? '#000000' : '#ffffff'} fontSize="28" fontWeight="900" fontFamily="sans-serif">
                          {idx + 1}
                        </text>
                      </svg>
                    </div>

                    <img
                      src={getMemberAvatar(member.name)}
                      alt={member.name}
                      style={{
                        width: '58px',
                        height: '58px',
                        borderRadius: '50%',
                        backgroundColor: '#000000',
                        border: '2px solid #FF3300',
                        padding: '2px',
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />

                    <div>
                      <div style={{ fontSize: '30px', fontWeight: '900', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{member.name}</span>
                        {idx === 0 && <span style={{ fontSize: '24px' }}>👑</span>}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: '#FF3300' }}>
                      {member.count} FILM{member.count > 1 ? 'S' : ''}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#94a3b8', marginTop: '2px' }}>
                      {member.points} Points
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ minHeight: '80px', borderTop: '3px solid rgba(255, 51, 0, 0.3)', display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center', fontSize: '28px', fontWeight: '800', fontFamily: 'monospace', color: '#FF3300', letterSpacing: '3px', textShadow: '0 0 14px rgba(255, 51, 0, 0.6)' }}>
            STATUS: ONLINE // ARCHIVE: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </div>
        </div>
      </div>

      {/* 2B. STORY BY FILMS — SLIDE 2 (RANKS 11 TO 20) */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0 }}>
        <div
          ref={exportFilmsRefPart2}
          style={{
            width: '1080px',
            height: '1920px',
            backgroundColor: '#040507',
            backgroundImage: `
              linear-gradient(rgba(255, 51, 0, 0.08) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 51, 0, 0.08) 1px, transparent 1px)
            `,
            backgroundSize: '28px 28px',
            color: '#ffffff',
            padding: '90px 70px 60px 70px',
            fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            boxSizing: 'border-box',
            border: '12px solid #FF3300',
            boxShadow: '0 0 60px rgba(255, 51, 0, 0.35) inset, 0 0 30px rgba(255, 51, 0, 0.4)',
            borderRadius: '0px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Syncopate', sans-serif",
                fontWeight: '800',
                fontSize: '46px',
                letterSpacing: '4px',
                lineHeight: '1.1',
                textTransform: 'uppercase',
                color: '#ffffff',
                textShadow: '0 0 22px rgba(255, 255, 255, 0.4)',
                marginBottom: '28px',
              }}
            >
              CUBBON <span style={{ color: '#FF3300', textShadow: '0 0 25px #FF3300, 0 0 55px rgba(255, 51, 0, 0.9)' }}>MOVIE</span> CLUB
            </div>

            <div
              style={{
                backgroundColor: 'rgba(18, 4, 6, 0.9)',
                border: '3px solid #FF3300',
                borderRadius: '12px',
                padding: '26px 36px',
                marginBottom: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                boxShadow: '0 0 35px rgba(255, 51, 0, 0.4), inset 0 0 25px rgba(255, 51, 0, 0.25)',
              }}
            >
              <div
                style={{
                  fontFamily: "'Syncopate', sans-serif",
                  fontWeight: '800',
                  fontSize: '36px',
                  letterSpacing: '4px',
                  display: 'flex',
                  gap: '12px',
                  lineHeight: '1.15',
                  textAlign: 'center',
                }}
              >
                <span style={{ color: '#FF3300', textShadow: '0 0 20px #FF3300, 0 0 40px rgba(255, 51, 0, 0.95)' }}>
                  FRIGHT NIGHTS
                </span>
                <span style={{ color: '#ffffff', textShadow: '0 0 18px rgba(255, 255, 255, 0.7)' }}>
                  OCTOBER 💀 (PART 2)
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '8px', height: '38px', backgroundColor: '#FF3300', boxShadow: '0 0 14px #FF3300' }} />
                <div style={{ fontSize: '40px', fontWeight: '900', letterSpacing: '2px', color: '#ffffff' }}>
                  LEADERBOARD
                </div>
              </div>
              <div style={{ fontSize: '18px', fontWeight: '800', color: '#FF6600', letterSpacing: '1.5px', textTransform: 'uppercase', marginLeft: '22px', marginTop: '4px' }}>
                Ranked by Films (Ranks 11-20)
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {leaderboardByFilms.slice(10, 20).map((member, idx) => (
                <div
                  key={member.name}
                  style={{
                    backgroundColor: '#0f0305',
                    border: '2px solid #2a080c',
                    borderRadius: '14px',
                    padding: '18px 28px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
                    <div style={{ width: '52px', height: '52px', position: 'relative', flexShrink: 0 }}>
                      <svg width="100%" height="100%" viewBox="0 0 64 64">
                        <rect width="64" height="64" rx="12" fill="#2a080c" />
                        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fill="#ff4d4d" fontSize="28" fontWeight="900" fontFamily="sans-serif">
                          {idx + 11}
                        </text>
                      </svg>
                    </div>

                    <img
                      src={getMemberAvatar(member.name)}
                      alt={member.name}
                      style={{
                        width: '58px',
                        height: '58px',
                        borderRadius: '50%',
                        backgroundColor: '#000000',
                        border: '2px solid #FF3300',
                        padding: '2px',
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />

                    <div>
                      <div style={{ fontSize: '30px', fontWeight: '900', color: '#f8fafc' }}>
                        {member.name}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '26px', fontWeight: '900', color: '#FF3300' }}>
                      {member.count} FILM{member.count > 1 ? 'S' : ''}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '800', color: '#94a3b8', marginTop: '2px' }}>
                      {member.points} Points
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ minHeight: '80px', borderTop: '3px solid rgba(255, 51, 0, 0.3)', display: 'flex', justifyContent: 'center', alignItems: 'center', textAlign: 'center', fontSize: '28px', fontWeight: '800', fontFamily: 'monospace', color: '#FF3300', letterSpacing: '3px', textShadow: '0 0 14px rgba(255, 51, 0, 0.6)' }}>
            STATUS: ONLINE // ARCHIVE: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}
          </div>
        </div>
      </div>
    </div>
  );
}