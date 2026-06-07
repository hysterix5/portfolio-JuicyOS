import 'dotenv/config';
import type { APIRoute } from 'astro';

export const prerender = false;

// Initialize cache if not present
if (!(globalThis as any).spotifyCache) {
    (globalThis as any).spotifyCache = {
        playlists: null,
        tracks: {},
        expiresAt: 0,
        accessToken: "",
        tokenExpiresAt: 0
    };
}
const cache = (globalThis as any).spotifyCache;

export const GET: APIRoute = async () => {
    // Invalidate cache if env variables have changed
    if (cache.cachedRefreshToken !== process.env.SPOTIFY_REFRESH_TOKEN ||
        cache.cachedEnvAccessToken !== process.env.SPOTIFY_ACCESS_TOKEN) {
        console.log("🔄 Spotify credentials changed in .env! Clearing in-memory token cache...");
        cache.accessToken = "";
        cache.tokenExpiresAt = 0;
        cache.playlists = null;
        cache.tracks = {};
        cache.expiresAt = 0;
        cache.cachedRefreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
        cache.cachedEnvAccessToken = process.env.SPOTIFY_ACCESS_TOKEN;
    }

    const now = Date.now();

    // Check if we have a valid cached token
    if (cache.accessToken && now < cache.tokenExpiresAt) {
        console.log("⚡ Returning cached Spotify access token (expires in", Math.round((cache.tokenExpiresAt - now) / 1000), "s)");
        return new Response(JSON.stringify({
            accessToken: cache.accessToken,
            expiresIn: Math.round((cache.tokenExpiresAt - now) / 1000),
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    const accessTokenEnv = process.env.SPOTIFY_ACCESS_TOKEN;

    // 1. Try direct Access Token (Highest priority for manual Postman testing)
    if (accessTokenEnv) {
        console.log("⚠️ Using direct SPOTIFY_ACCESS_TOKEN from .env");
        cache.accessToken = accessTokenEnv;
        cache.tokenExpiresAt = now + 3600 * 1000; // Cache for 1 hour
        return new Response(JSON.stringify({
            accessToken: accessTokenEnv,
            expiresIn: 3600,
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
            },
        });
    }

    // 2. Try Refresh Token flow (dynamically refreshes user tokens)
    if (refreshToken && clientId && clientSecret) {
        try {
            console.log("⚡ Refreshing Spotify access token via Refresh Token...");
            const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                    grant_type: "refresh_token",
                    refresh_token: refreshToken,
                    client_id: clientId,
                    client_secret: clientSecret,
                }).toString(),
            });

            if (tokenRes.ok) {
                const tokenData = await tokenRes.json();
                cache.accessToken = tokenData.access_token;
                cache.tokenExpiresAt = now + (tokenData.expires_in - 60) * 1000; // 60s buffer
                console.log("✓ Dynamic token refresh successful");
                return new Response(JSON.stringify({
                    accessToken: tokenData.access_token,
                    expiresIn: tokenData.expires_in,
                }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                        "Cache-Control": "private, max-age=1800",
                    },
                });
            } else {
                const errText = await tokenRes.text();
                console.error("❌ Spotify refresh token request failed:", tokenRes.status, errText);
            }
        } catch (error) {
            console.error("❌ Spotify refresh token error:", error);
        }
    }

    // 3. Fallback to Client Credentials flow
    if (clientId && clientSecret) {
        try {
            console.log("⚡ Fetching Spotify access token via Client Credentials...");
            const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
            });

            if (tokenRes.ok) {
                const tokenData = await tokenRes.json();
                cache.accessToken = tokenData.access_token;
                cache.tokenExpiresAt = now + (tokenData.expires_in - 60) * 1000;
                console.log("✓ Client credentials token retrieval successful");
                return new Response(JSON.stringify({
                    accessToken: tokenData.access_token,
                    expiresIn: tokenData.expires_in,
                }), {
                    status: 200,
                    headers: {
                        "Content-Type": "application/json",
                    },
                });
            }
        } catch (error) {
            console.error("❌ Spotify client credentials error:", error);
        }
    }

    return new Response(JSON.stringify({ error: "Missing or invalid Spotify configuration" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
    });
};

