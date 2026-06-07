import 'dotenv/config';
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${url.origin}/api/spotify/callback`;

    if (!clientId) {
        return new Response('Missing SPOTIFY_CLIENT_ID in env', { status: 500 });
    }

    // Request permissions for user metadata, playlists, streaming playback, and user playback control
    const scope = 'user-read-private user-read-email playlist-read-private playlist-read-collaborative streaming user-modify-playback-state user-read-playback-state';

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        scope: scope,
        redirect_uri: redirectUri,
        show_dialog: 'true',
    });

    const authorizeUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

    return new Response(null, {
        status: 302,
        headers: {
            Location: authorizeUrl,
        },
    });
};
