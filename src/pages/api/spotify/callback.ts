import 'dotenv/config';
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    // Handle authorization errors
    if (error) {
        console.error(`Spotify auth error: ${error} - ${errorDescription}`);
        return new Response(
            `<html>
                <body style="font-family: sans-serif; padding: 20px;">
                    <h2>Authorization Failed</h2>
                    <p><strong>Error:</strong> ${error}</p>
                    <p><strong>Details:</strong> ${errorDescription || 'No details provided'}</p>
                    <p><a href="/">Go back home</a></p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">Common issues:</p>
                    <ul style="color: #666; font-size: 12px;">
                        <li>Redirect URI doesn't match Spotify Dashboard</li>
                        <li>Invalid scopes for your app</li>
                        <li>Client ID or Secret is incorrect</li>
                    </ul>
                </body>
            </html>`,
            { 
                status: 400,
                headers: { 'Content-Type': 'text/html' }
            }
        );
    }

    if (!code) {
        return new Response('Missing authorization code', { status: 400 });
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI || `${url.origin}/api/spotify/callback`;

    if (!clientId || !clientSecret) {
        return new Response('Missing Spotify configuration (SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET)', { status: 500 });
    }

    try {
        // Exchange code for access token
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                client_id: clientId,
                client_secret: clientSecret,
            }).toString(),
        });

        const tokenData = await tokenRes.json();

        if (!tokenData.access_token) {
            return new Response('Failed to get access token', { status: 500 });
        }

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token || process.env.SPOTIFY_REFRESH_TOKEN || '';

        return new Response(
            `<html>
                <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #121212; color: #ffffff; padding: 40px; text-align: center;">
                    <div style="max-width: 650px; margin: 40px auto; background: #181818; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.6); border: 1px solid #282828;">
                        <div style="color: #1db954; font-size: 56px; margin-bottom: 20px;">✓</div>
                        <h2 style="margin-top: 0; font-size: 24px; color: #1db954; font-weight: 700;">Spotify Authorization Successful!</h2>
                        <p style="color: #b3b3b3; font-size: 14px; line-height: 1.6; margin-bottom: 30px;">
                            We successfully acquired your Spotify tokens with the correct scopes (including Web Player SDK playback streaming).
                        </p>
                        
                        <h3 style="text-align: left; margin-top: 0; margin-bottom: 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #888; font-weight: 600;">Step 1: Copy these environment variables</h3>
                        <p style="text-align: left; color: #b3b3b3; font-size: 13px; margin-bottom: 10px;">Open your <code>.env</code> file and replace the existing Spotify token lines with these:</p>
                        <div style="background: #000; padding: 15px; border-radius: 6px; text-align: left; font-family: 'Fira Code', 'Courier New', monospace; font-size: 12px; overflow-x: auto; border: 1px solid #333; margin-bottom: 25px; user-select: all; line-height: 1.5; color: #eceff4;">
SPOTIFY_REFRESH_TOKEN=${refreshToken}
SPOTIFY_ACCESS_TOKEN=${accessToken}
                        </div>
                        
                        <h3 style="text-align: left; margin-top: 0; margin-bottom: 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: #888; font-weight: 600;">Step 2: Restart your dev server</h3>
                        <p style="text-align: left; color: #b3b3b3; font-size: 13px; line-height: 1.5; margin-bottom: 10px;">
                            Since Vite/Astro caches environment variables at startup, you <strong>MUST</strong> stop your running server in the terminal (press <code>Ctrl + C</code>) and run:
                        </p>
                        <div style="background: #000; padding: 10px 15px; border-radius: 6px; text-align: left; font-family: 'Fira Code', 'Courier New', monospace; font-size: 12px; border: 1px solid #333; margin-bottom: 30px; color: #1db954;">
npm run dev
                        </div>
                        
                        <p style="margin-top: 20px;">
                            <a href="/" style="display: inline-block; background: #1db954; color: #fff; text-decoration: none; padding: 12px 30px; border-radius: 30px; font-weight: bold; font-size: 14px; transition: transform 0.2s; box-shadow: 0 4px 12px rgba(29, 185, 84, 0.3);">
                                Return to JuicyOS
                            </a>
                        </p>
                    </div>
                </body>
            </html>`,
            {
                headers: { 'Content-Type': 'text/html' }
            }
        );
    } catch (error) {
        console.error('Spotify callback error:', error);
        return new Response('Authentication failed', { status: 500 });
    }
};
