// backend/http-functions.js
import { ok, badRequest, serverError } from 'wix-http-functions';
import wixData from 'wix-data';

// Collection ID must match exactly what you created in Wix Data
const COLLECTION = 'Decision_Game_Scores';

// Re-used headers (JSON + CORS so your GitHub-hosted game can read the response)
const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

/**
 * POST /_functions/decisionGame/saveScore
 * Body (text/plain or JSON): {
 *   initials: "ALI",
 *   mode: "short" | "long",
 *   correct: number,
 *   totalQuestions: number,
 *   totalTimeMs: number,
 *   avgTimeMs: number
 * }
 */
export async function post_decisionGame_saveScore(request) {
  let options = { headers: baseHeaders };

  try {
    // Accept both JSON and plain text JSON
    const contentType = request.headers['content-type'] || request.headers['Content-Type'] || '';
    let body;

    if (contentType.includes('application/json')) {
      body = await request.body.json();
    } else {
      const text = await request.body.text();
      body = JSON.parse(text);
    }

    const { initials, mode, correct, totalQuestions, totalTimeMs, avgTimeMs } = body || {};

    if (!mode || (mode !== 'short' && mode !== 'long')) {
      options.body = JSON.stringify({ error: 'Invalid or missing mode' });
      return badRequest(options);
    }

    if (!initials || typeof initials !== 'string') {
      options.body = JSON.stringify({ error: 'Initials are required' });
      return badRequest(options);
    }

    // Basic validation
    if (
      typeof correct !== 'number' ||
      typeof totalQuestions !== 'number' ||
      typeof totalTimeMs !== 'number' ||
      typeof avgTimeMs !== 'number'
    ) {
      options.body = JSON.stringify({ error: 'Score fields must be numbers' });
      return badRequest(options);
    }

    const mistakes = totalQuestions - correct;

    const item = {
      initials: initials.toUpperCase().slice(0, 3),
      mode,
      correct,
      totalQuestions,
      totalTimeMs,
      avgTimeMs,
      mistakes,
      createdAt: new Date()
    };

    // Store one row per run for now
    await wixData.insert(COLLECTION, item);

    options.body = JSON.stringify({ success: true });
    return ok(options);

  } catch (err) {
    options.body = JSON.stringify({ error: 'Server error', details: String(err) });
    return serverError(options);
  }
}

/**
 * GET /_functions/decisionGame/leaderboard?mode=short|long
 * Returns top 100 rows, sorted by:
 *   1) fewest mistakes
 *   2) lowest totalTimeMs
 *   3) lowest avgTimeMs
 */
export async function get_decisionGame_leaderboard(request) {
  let options = { headers: baseHeaders };

  try {
    const queryParams = request.query || {};
    const mode = queryParams.mode;

    if (!mode || (mode !== 'short' && mode !== 'long')) {
      options.body = JSON.stringify({ error: 'mode query param must be "short" or "long"' });
      return badRequest(options);
    }

    // Pull a chunk and sort in code
    const result = await wixData
      .query(COLLECTION)
      .eq('mode', mode)
      .limit(1000) // safety upper bound
      .find();

    const items = result.items || [];

    // Sort by your criteria
    items.sort((a, b) => {
      const mistakesA = a.mistakes ?? (a.totalQuestions - a.correct);
      const mistakesB = b.mistakes ?? (b.totalQuestions - b.correct);

      if (mistakesA !== mistakesB) return mistakesA - mistakesB;

      if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;

      return a.avgTimeMs - b.avgTimeMs;
    });

    const top100 = items.slice(0, 100).map((item, index) => ({
      rank: index + 1,
      initials: item.initials,
      mode: item.mode,
      correct: item.correct,
      totalQuestions: item.totalQuestions,
      totalTimeMs: item.totalTimeMs,
      avgTimeMs: item.avgTimeMs,
      mistakes: item.mistakes
    }));

    options.body = JSON.stringify({ mode, results: top100 });
    return ok(options);

  } catch (err) {
    options.body = JSON.stringify({ error: 'Server error', details: String(err) });
    return serverError(options);
  }
}
