import { QueryClient } from '@tanstack/react-query';

// 429-aware retry helper. When the SDK throws a rate-limit error we want to
// back off and retry a couple of times instead of failing the query (which
// would leave the UI looking broken — empty dropdowns, missing stats, etc).
// For non-429 errors we keep the previous behaviour: one retry only.
const isRateLimited = (err) => {
	if (!err) return false;
	if (err.status === 429) return true;
	if (err.response?.status === 429) return true;
	const msg = String(err.message || '').toLowerCase();
	return msg.includes('rate limit') || msg.includes('429');
};

const retryFn = (failureCount, error) => {
	if (isRateLimited(error)) {
		// Up to 3 retries on 429 — gives the per-app limiter time to recover.
		return failureCount < 3;
	}
	// Other errors: same as before (one retry).
	return failureCount < 1;
};

const retryDelay = (attemptIndex, error) => {
	if (isRateLimited(error)) {
		// Exponential backoff with jitter: 800ms → 1.6s → 3.2s (+0–500ms jitter)
		// keeps retries spaced out enough that the limiter actually drains.
		const base = 800 * Math.pow(2, attemptIndex);
		return base + Math.floor(Math.random() * 500);
	}
	return Math.min(1000 * Math.pow(2, attemptIndex), 5000);
};

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: retryFn,
			retryDelay,
			// Treat data as fresh for 30s by default so sibling components
			// remounting in the same tab don't all hammer the same endpoint.
			// Cuts admin-dashboard request bursts dramatically.
			staleTime: 30_000,
			gcTime: 5 * 60_000,
		},
	},
});