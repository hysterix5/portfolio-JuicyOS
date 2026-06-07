import 'dotenv/config';
import type { APIRoute } from 'astro';

export const prerender = false;



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



export const GET: APIRoute = async ({ params }) => {
    // Invalidate cache if env variables have changed
    if (cache.cachedRefreshToken !== process.env.SPOTIFY_REFRESH_TOKEN ||
        cache.cachedEnvAccessToken !== process.env.SPOTIFY_ACCESS_TOKEN) {
        console.log("🔄 [API] Spotify credentials changed in .env! Clearing in-memory token/playlist cache...");
        cache.accessToken = "";
        cache.tokenExpiresAt = 0;
        cache.playlists = null;
        cache.tracks = {};
        cache.expiresAt = 0;
        cache.cachedRefreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
        cache.cachedEnvAccessToken = process.env.SPOTIFY_ACCESS_TOKEN;
    }

    const playlistId = params.id;
    const now = Date.now();

    // Check if tracks are in the cache
    if (playlistId && cache.tracks[playlistId]) {
        console.log("⚡ Loaded tracks for playlist from API cache:", playlistId);
        const cachedPlaylist = cache.tracks[playlistId];
        return new Response(
            JSON.stringify({
                name: cachedPlaylist.name,
                image: cachedPlaylist.image,
                tracks: cachedPlaylist.tracks,
            }),
            {
                status: 200,
                headers: { "Content-Type": "application/json" },
            },
        );
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
    const envAccessToken = process.env.SPOTIFY_ACCESS_TOKEN;

    let accessToken = "";

    // Get access token (check cache first)
    if (cache.accessToken && now < cache.tokenExpiresAt) {
        accessToken = cache.accessToken;
    } else {
        // 1. Try direct SPOTIFY_ACCESS_TOKEN (Highest priority for manual Postman testing)
        if (envAccessToken) {
            console.log("⚠️ [API] Using direct SPOTIFY_ACCESS_TOKEN from .env");
            accessToken = envAccessToken;
            cache.accessToken = envAccessToken;
            cache.tokenExpiresAt = now + 3600 * 1000; // Cache 1 hour
        }
        // 2. Try Refresh Token
        else if (refreshToken && clientId && clientSecret) {
            try {
                console.log("⚡ [API] Refreshing Spotify access token via Refresh Token...");
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
                    accessToken = tokenData.access_token;
                    cache.accessToken = tokenData.access_token;
                    cache.tokenExpiresAt = now + (tokenData.expires_in - 60) * 1000;
                    console.log("✓ [API] Dynamic token refresh successful");
                }
            } catch (err) {
                console.error("❌ [API] Token refresh error:", err);
            }
        }

        // 3. Try Client Credentials fallback
        if (!accessToken && clientId && clientSecret) {
            try {
                console.log("⚡ [API] Fetching Spotify token via Client Credentials...");
                const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
                });
                if (tokenRes.ok) {
                    const tokenData = await tokenRes.json();
                    accessToken = tokenData.access_token;
                    cache.accessToken = tokenData.access_token;
                    cache.tokenExpiresAt = now + (tokenData.expires_in - 60) * 1000;
                    console.log("✓ [API] Client credentials token successful");
                }
            } catch (err) {
                console.error("❌ [API] Client credentials error:", err);
            }
        }
    }

    if (!accessToken) {
        console.error("❌ [API] No Spotify access token available.");
        return new Response(JSON.stringify({ error: "No Spotify access token available" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const headers = { Authorization: `Bearer ${accessToken}` };

        // Fetch playlist details and tracks
        const playlistRes = await fetch(
            `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,images,tracks.items(track(id,name,artists,album,duration_ms,preview_url))`,
            { headers },
        );

        if (!playlistRes.ok) {
            console.error(`❌ [API] Spotify playlist fetch failed with status: ${playlistRes.status} ${playlistRes.statusText}`);
            return new Response(JSON.stringify({ error: `Spotify API failed to fetch playlist: ${playlistRes.statusText}` }), {
                status: playlistRes.status,
                headers: { "Content-Type": "application/json" },
            });
        }

        const playlistData = await playlistRes.json();

        const tracks = (playlistData.tracks?.items || [])
            .map((item: any) => {
                const track = (item.track && typeof item.track === 'object') ? item.track : item.item;
                return {
                    id: track?.id || "",
                    name: track?.name || "Unknown",
                    artists:
                        track?.artists
                            ?.map((a: any) => a.name)
                            .join(", ") || "Unknown",
                    album: track?.album?.name || "Unknown",
                    albumArt: track?.album?.images?.[0]?.url || "",
                    duration: track?.duration_ms || 0,
                    previewUrl: track?.preview_url,
                };
            })
            .filter((t: any) => t.id);

        const responseData = {
            name: playlistData.name,
            image: playlistData.images?.[0]?.url || "",
            tracks,
        };

        if (playlistId) {
            cache.tracks[playlistId] = responseData;
        }

        return new Response(JSON.stringify(responseData), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Spotify API error in route:", error);
        return new Response(JSON.stringify({ error: "Internal server error fetching tracks" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};
