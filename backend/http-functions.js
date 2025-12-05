// backend/http-functions.js
import { ok, badRequest, serverError } from 'wix-http-functions';
import wixData from 'wix-data';

const COLLECTION = 'Decision_Game_Scores';

const baseHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

// Allowed modes, now including 'infinite'
const ALLOWED_MODES = ['short', 'long', 'infinite'];

/**
 * POST /_functions/decisionGame/saveScore
 * Body (text/plain or JSON): {
 *   initials: "ALI",
 *   mode: "short" | "long" | "infinite",
 *   correct: number,
 *   totalQuestions: number,
 *   totalTimeMs: number,
 *   avgTimeMs: number
 * }
 */
export async function post_decisionGame_saveScore(request) {
  let options = { headers: baseHeaders };

  try {
    const contentType = request.headers['content-type'] || request.headers['Content-Type'] || '';
    let body;

    if (contentType.includes('application/json')) {
      body = await request.body.json();
    } else {
      const text = await request.body.text();
      body = JSON.parse(text);
    }

    const { initials, mode, correct, totalQuestions, totalTimeMs, avgTimeMs } = body || {};

    if (!mode || !ALLOWED_MODES.includes(mode)) {
      options.body = JSON.stringify({ error: 'Invalid or missing mode' });
      return badRequest(options);
    }

    if (!initials || typeof initials !== 'string') {
      options.body = JSON.stringify({ error: 'Initials are required' });
      return badRequest(options);
    }

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

    await wixData.insert(COLLECTION, item);

    options.body = JSON.stringify({ success: true });
    return ok(options);

  } catch (err) {
    options.body = JSON.stringify({ error: 'Server error', details: String(err) });
    return serverError(options);
  }
}

/**
 * GET /_functions/decisionGame/leaderboard?mode=short|long|infinite
 *
 * short/long  sort:
 *   1) fewest mistakes
 *   2) lowest totalTimeMs
 *   3) lowest avgTimeMs
 *
 * infinite sort:
 *   1) highest correct
 *   2) lowest avgTimeMs
 *   3) lowest totalTimeMs
 */
export async function get_decisionGame_leaderboard(request) {
  let options = { headers: baseHeaders };

  try {
    const queryParams = request.query || {};
    const mode = queryParams.mode;

    if (!mode || !ALLOWED_MODES.includes(mode)) {
      options.body = JSON.stringify({ error: 'mode query param must be "short", "long", or "infinite"' });
      return badRequest(options);
    }

    const result = await wixData
      .query(COLLECTION)
      .eq('mode', mode)
      .limit(1000)
      .find();

    const items = result.items || [];

    if (mode === 'infinite') {
      // Infinite: #correct desc, avgTime asc, totalTime asc
      items.sort((a, b) => {
        if (a.correct !== b.correct) return b.correct - a.correct;

        if (a.avgTimeMs !== b.avgTimeMs) return a.avgTimeMs - b.avgTimeMs;

        return a.totalTimeMs - b.totalTimeMs;
      });
    } else {
      // short/long: mistakes asc, totalTime asc, avgTime asc
      items.sort((a, b) => {
        const mistakesA = a.mistakes ?? (a.totalQuestions - a.correct);
        const mistakesB = b.mistakes ?? (b.totalQuestions - b.correct);

        if (mistakesA !== mistakesB) return mistakesA - mistakesB;

        if (a.totalTimeMs !== b.totalTimeMs) return a.totalTimeMs - b.totalTimeMs;

        return a.avgTimeMs - b.avgTimeMs;
      });
    }

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
