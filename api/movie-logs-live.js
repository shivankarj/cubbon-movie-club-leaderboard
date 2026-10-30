// Live endpoint: looks up metadata, calculates points, and inserts one record into movie_logs_october.

const INDIAN_ALLOWED_PLATFORMS = [
  "hotstar", "jiohotstar", "disney+ hotstar", "jiocinema", "jio cinema",
  "amazon prime video", "prime video", "amazon video", "netflix", "sonyliv",
  "sony liv", "zee5", "mubi", "apple tv+", "apple tv", "lionsgate play",
  "lionsgate", "aha", "sun nxt", "hoichoi", "manoramamax", "chaupal",
  "google play movies", "youtube"
];
const INDIAN_LANGUAGES = [
  "hindi", "tamil", "telugu", "malayalam", "kannada", "bengali",
  "marathi", "punjabi", "gujarati", "odia", "assamese", "urdu"
];
const ENGLISH_SPEAKING_COUNTRIES = [
  "united states", "united states of america", "usa", "u.s.a.",
  "united kingdom", "great britain", "canada", "australia",
  "new zealand", "ireland"
];

const isIndianCinema = (language = "", country = "") => {
  const lang = String(language || "").toLowerCase();
  const nation = String(country || "").toLowerCase();
  return nation.includes("india") || INDIAN_LANGUAGES.some((item) => lang.includes(item));
};

const isForeignCinema = (language = "", country = "", originalLanguage = "") => {
  if (isIndianCinema(language, country)) return false;

  // Normalize country strings and explicitly recognize common US naming variants.
  const nation = String(country || "").toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
  const isEnglishSpeakingCountry = ENGLISH_SPEAKING_COUNTRIES.some((item) => {
    const normalizedItem = item.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();
    return nation === normalizedItem || nation.includes(normalizedItem);
  });
  if (isEnglishSpeakingCountry) return false;

  const original = String(originalLanguage || "").toLowerCase().trim();
  if (original && original !== "en") return true;
  if (nation) return true;

  const languages = String(language || "").toLowerCase().split(",").map((x) => x.trim()).filter(Boolean);
  return languages.length > 0 && !languages[0].includes("english");
};

const json = (res, status, body) => res.status(status).json(body);
const tmdb = async (path, apiKey) => {
  const url = new URL("https://api.themoviedb.org/3" + path);
  url.searchParams.set("api_key", apiKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Movie metadata provider returned " + response.status);
  return response.json();
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Use POST with memberName, imdbUrl, and review." });
  }

  const expectedKey = process.env.MOVIE_LOG_API_KEY_TEST;
  const auth = req.headers.authorization || "";
  const expectedBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const bypass = req.headers["x-vercel-protection-bypass"] || "";
  const authorizedByApiKey = Boolean(expectedKey && auth === "Bearer " + expectedKey);
  const authorizedByVercelBypass = Boolean(expectedBypass && bypass === expectedBypass);
  if (!authorizedByApiKey && !authorizedByVercelBypass) {
    return json(res, 401, { error: "Unauthorized." });
  }

  const { memberName, imdbUrl, review, theatreWatch } = req.body || {};
  const isTheatreWatch = theatreWatch === true || String(theatreWatch || "").trim().toUpperCase() === "YES";
  const name = typeof memberName === "string" ? memberName.trim() : "";
  const imdb = typeof imdbUrl === "string" ? imdbUrl.trim() : "";
  const cleanReview = typeof review === "string" ? review.trim() : "";
  const match = imdb.match(/tt\d{7,8}/i);

  if (!name || name.length > 80) return json(res, 400, { error: "memberName is required and must be 80 characters or fewer." });
  if (!match) return json(res, 400, { error: "imdbUrl must contain a valid IMDb title ID, such as tt0073747." });
  if (cleanReview.length > 5000) return json(res, 400, { error: "Review must be 5,000 characters or fewer." });
  if (!process.env.TMDB_API_KEY_TEST) return json(res, 500, { error: "Server is missing TMDB_API_KEY_TEST configuration." });

  const imdbId = match[0];
  const canonicalImdb = "https://www.imdb.com/title/" + imdbId + "/";

  try {
    // Metadata and scoring are calculated before the database insert.

    const tmdbKey = process.env.TMDB_API_KEY_TEST;
    const omdbApiKey = process.env.OMDB_API_KEY || process.env.REACT_APP_OMDB_API_KEY;
    const findData = await tmdb("/find/" + imdbId + "?external_source=imdb_id", tmdbKey);
    const hit = findData.movie_results && findData.movie_results[0];
    if (!hit) return json(res, 404, { code: "TMDB_MOVIE_NOT_FOUND", error: "TMDb could not match this IMDb ID to a movie.", imdbId, checkedBy: "TMDb /find endpoint", hint: "Verify that the IMDb ID belongs to the intended movie. This is a metadata lookup failure, not a database-save failure; this endpoint is preview-only." });

    let title = hit.title || "";
    let year = hit.release_date ? hit.release_date.slice(0, 4) : "";
    let genre = "Horror";
    let director = "N/A";
    let stars = "N/A";
    let rating = hit.vote_average ? "★ " + Number(hit.vote_average).toFixed(1) : "★ —";
    let poster = hit.poster_path ? "https://image.tmdb.org/t/p/w500" + hit.poster_path : "";
    let plot = hit.overview || "";
    let originalLanguage = hit.original_language || "";
    let language = originalLanguage;
    let country = "";
    // Underrated bonus must use IMDb vote counts from OMDb only. TMDb vote_count is not interchangeable.
    let voteCount = 0;
    const tmdbId = hit.id;

    const details = await tmdb("/movie/" + tmdbId + "?append_to_response=credits", tmdbKey);
    title = details.title || title;
    year = details.release_date ? details.release_date.slice(0, 4) : year;
    genre = Array.isArray(details.genres) ? details.genres.map((g) => g.name).join(", ") : genre;
    plot = details.overview || plot;
    originalLanguage = details.original_language || originalLanguage;
    if (Array.isArray(details.production_countries)) country = details.production_countries.map((c) => c.name).join(", ");
    const directorCredit = details.credits && details.credits.crew && details.credits.crew.find((p) => p.job === "Director");
    if (directorCredit) director = directorCredit.name;
    if (details.credits && Array.isArray(details.credits.cast) && details.credits.cast.length) {
      stars = details.credits.cast.slice(0, 4).map((c) => c.name).join(", ");
    }

    if (omdbApiKey) {
      try {
        const omdbUrl = new URL("https://www.omdbapi.com/");
        omdbUrl.searchParams.set("apikey", omdbApiKey);
        omdbUrl.searchParams.set("i", imdbId);
        omdbUrl.searchParams.set("plot", "short");
        const omdbRes = await fetch(omdbUrl);
        if (omdbRes.ok) {
          const data = await omdbRes.json();
          if (data.Response === "True") {
            title = data.Title || title;
            year = data.Year || year;
            genre = data.Genre || genre;
            director = data.Director && data.Director !== "N/A" ? data.Director : director;
            stars = data.Actors && data.Actors !== "N/A" ? data.Actors : stars;
            rating = data.imdbRating && data.imdbRating !== "N/A" ? "★ " + data.imdbRating : rating;
            poster = data.Poster && data.Poster !== "N/A" ? data.Poster : poster;
            plot = data.Plot && data.Plot !== "N/A" ? data.Plot : plot;
            language = data.Language || language;
            country = data.Country || country;
            if (data.imdbVotes && data.imdbVotes !== "N/A") voteCount = parseInt(data.imdbVotes.replace(/,/g, ""), 10) || voteCount;
          }
        }
      } catch (error) {
        // OMDb is optional; keep the TMDb metadata if it is unavailable.
      }
    }

    const isClassic = Number(year) > 0 && Number(year) < 1990;
    const isIndian = isIndianCinema(language, country);
    const isForeign = isForeignCinema(language, country, originalLanguage);
    const isUnderrated = voteCount > 0 && voteCount < 30000;
    const bonuses = [];
    if (isClassic) bonuses.push("🎞️ Classic (+2)");
    if (isIndian) bonuses.push("🇮🇳 Indian (+2)");
    if (isForeign) bonuses.push("🌍 Foreign (+2)");
    if (isUnderrated) bonuses.push("💎 Underrated (+2)");
    if (isTheatreWatch) bonuses.push("🎟️ In Theatre (+5)");
    const points = 1 + (isClassic ? 2 : 0) + (isIndian ? 2 : 0) + (isForeign ? 2 : 0) + (isUnderrated ? 2 : 0) + (isTheatreWatch ? 5 : 0);

    let watchProviders = [];
    try {
      const providerData = await tmdb("/movie/" + tmdbId + "/watch/providers", tmdbKey);
      const india = providerData.results && providerData.results.IN;
      if (india) {
        const raw = [
          ...(india.flatrate || []), ...(india.free || []), ...(india.ads || []),
          ...(india.rent || []), ...(india.buy || [])
        ];
        const seen = new Set();
        watchProviders = raw.reduce((list, item) => {
          const rawName = String(item.provider_name || "").trim();
          const lower = rawName.toLowerCase();
          if (!INDIAN_ALLOWED_PLATFORMS.some((allowed) => lower.includes(allowed) || allowed.includes(lower))) return list;
          let displayName = rawName;
          if (lower === "amazon video") displayName = "Amazon Prime Video";
          if (lower.includes("apple tv")) displayName = "Apple TV";
          if (seen.has(displayName)) return list;
          seen.add(displayName);
          list.push(JSON.stringify({ name: displayName, logo: item.logo_path ? "https://image.tmdb.org/t/p/w92" + item.logo_path : null }));
          return list;
        }, []);
      }
    } catch (error) {
      // Streaming availability is optional.
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseSecretKey) {
      return json(res, 500, { error: "Server is missing SUPABASE_URL or SUPABASE_SECRET_KEY configuration." });
    }

    const dateLogged = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Kolkata"
    });

    const newLogEntry = {
      name,
      movie: title,
      genre,
      director,
      stars,
      rating,
      poster,
      date_logged: dateLogged,
      imdb: canonicalImdb,
      plot,
      review: cleanReview,
      watch_providers: watchProviders,
      points,
      bonuses,
      is_theatre: isTheatreWatch
    };

    const cleanSupabaseUrl = supabaseUrl.endsWith("/") ? supabaseUrl.slice(0, -1) : supabaseUrl;
    const insertResponse = await fetch(cleanSupabaseUrl + "/rest/v1/movie_logs_october", {
      method: "POST",
      headers: {
        "apikey": supabaseSecretKey,
        "Authorization": "Bearer " + supabaseSecretKey,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(newLogEntry)
    });

    const insertText = await insertResponse.text();
    let insertedRows = [];
    try {
      insertedRows = insertText ? JSON.parse(insertText) : [];
    } catch (parseError) {
      insertedRows = [];
    }

    if (!insertResponse.ok) {
      console.error("Supabase insert failed:", insertResponse.status, insertText.slice(0, 1000));
      return json(res, 502, {
        error: "Supabase could not save this movie log.",
        databaseStatus: insertResponse.status,
        details: (() => {
          try {
            const parsed = JSON.parse(insertText);
            return parsed.message || parsed.error || parsed.details || "Database rejected the insert.";
          } catch (parseError) {
            return "Database returned an unreadable error response.";
          }
        })(),
        saved: false
      });
    }

    const inserted = Array.isArray(insertedRows) ? insertedRows[0] : null;
    return json(res, 200, {
      dryRun: false,
      saved: true,
      table: "movie_logs_october",
      id: inserted && inserted.id ? inserted.id : null,
      movie: title,
      year,
      genre,
      director,
      stars,
      rating,
      poster,
      plot,
      imdb: canonicalImdb,
      memberName: name,
      review: cleanReview,
      theatreWatch: isTheatreWatch,
      points,
      bonuses,
      watchProviders
    });
  } catch (error) {
    console.error("movie-log API error:", error);
    return json(res, 500, { error: "Could not publish the movie log. Check server configuration and provider access." });
  }
};
