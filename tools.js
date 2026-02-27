const fetch = require('node-fetch'); // We might need to install this depending on Node version, but native fetch works in Node 18+

// --- Tool Declarations ---
const toolDeclarations = [
    {
        name: 'get_github_projects',
        description: 'Fetches the latest public repositories for Somesh from GitHub.',
        parameters: {
            type: 'OBJECT',
            properties: {},
        },
    },
    {
        name: 'get_youtube_stats',
        description: 'Fetches videos from Somesh\'s YouTube channel. Can be used to find recent videos, or search for specific ones by name/topic.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: {
                    type: 'STRING',
                    description: 'Optional search query to find specific videos (e.g., "gameplay", "tutorial"). Leave empty to just get the latest videos.'
                },
                order: {
                    type: 'STRING',
                    description: 'How to sort the results. Options: "date" (newest first), "title" (alphabetical), "viewCount" (most viewed), "relevance" (best match for query). Default is "date".'
                }
            },
        },
    }
];

// --- Tool Implementations ---

async function getGithubProjects() {
    try {
        // Make sure we have a User-Agent header, GitHub API requires it
        const response = await fetch('https://api.github.com/users/someshshukla/repos?sort=updated&per_page=5', {
            headers: {
                'User-Agent': 'PortfolioChatbot'
            }
        });
        if (!response.ok) {
            throw new Error(`GitHub API returned status ${response.status}`);
        }
        const data = await response.json();

        // Extract only necessary data to prevent overflowing the AI's context window
        const simplifiedData = data.map(repo => ({
            name: repo.name,
            description: repo.description,
            language: repo.language,
            url: repo.html_url,
            updated_at: repo.updated_at
        }));

        return {
            success: true,
            repositories: simplifiedData
        };
    } catch (error) {
        console.error("GitHub Tool Error:", error);
        return { success: false, error: "Failed to fetch GitHub projects." };
    }
}

// Simple in-memory cache to prevent redundant API calls
const cache = {};
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getYoutubeStats(args = {}) {
    const { query = "", order = "date" } = args;
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
        return { success: false, error: "YOUTUBE_API_KEY is not configured on the server." };
    }

    // Check cache first
    const cacheKey = `yt_${query}_${order}`;
    if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < CACHE_TTL)) {
        console.log(`[Cache Hit] Returning cached YouTube data for "${cacheKey}"`);
        return cache[cacheKey].data;
    }

    try {
        const channelId = 'UCr0rLgE2uIeD2YfH-vFwEwg'; // This is roughly the channel ID format, we might need to find yours specifically
        // Wait, the user linked 'https://www.youtube.com/@shuklazi'. 
        // A better approach if we don't have the exact channel ID is to search for the channel first, 
        // but for now let's construct a general request, or ask the user for their channel ID.
        // Let's use search API to find the channel ID based on the handle, or just search for recent videos from that handle if possible.
        // Actually, fetching from a handle directly requires resolving it or knowing the ID. Needs a channel ID.

        // Let's assume we need to find the channel ID first, but to keep it light, let's just search for videos by the handle
        const searchResponse = await fetch(`https://youtube.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent('@shuklazi')}&type=channel&key=${apiKey}`);

        if (!searchResponse.ok) {
            throw new Error(`YouTube API returned status ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json();

        if (!searchData.items || searchData.items.length === 0) {
            return { success: false, error: "Could not find YouTube channel." };
        }

        const foundChannelId = searchData.items[0].id.channelId;

        // Now get the videos using the parameters
        let videoUrl = `https://youtube.googleapis.com/youtube/v3/search?part=snippet&channelId=${foundChannelId}&maxResults=5&type=video&key=${apiKey}`;

        if (query) {
            videoUrl += `&q=${encodeURIComponent(query)}`;
        }

        const validOrders = ['date', 'rating', 'relevance', 'title', 'viewCount'];
        const sortOrder = validOrders.includes(order) ? order : 'date';
        videoUrl += `&order=${sortOrder}`;

        const videoResponse = await fetch(videoUrl);

        if (!videoResponse.ok) {
            throw new Error(`YouTube API returned status ${videoResponse.status}`);
        }

        const videoData = await videoResponse.json();
        const simplifiedVideos = videoData.items.map(item => ({
            title: item.snippet.title,
            description: item.snippet.description,
            publishedAt: item.snippet.publishedAt,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`
        }));

        const result = {
            success: true,
            latest_videos: simplifiedVideos
        };

        // Save to cache
        cache[cacheKey] = { data: result, timestamp: Date.now() };
        console.log(`[Cache Miss] Cached YouTube data for "${cacheKey}"`);

        return result;

    } catch (error) {
        console.error("YouTube Tool Error:", error);
        return { success: false, error: "Failed to fetch YouTube statistics." };
    }
}

// --- Main Execution Logic ---
async function executeTool(toolCall) {
    const { name, args } = toolCall;

    if (name === 'get_github_projects') {
        return await getGithubProjects();
    } else if (name === 'get_youtube_stats') {
        return await getYoutubeStats(args);
    } else {
        return { error: `Unknown tool: ${name}` };
    }
}

module.exports = {
    toolDeclarations,
    executeTool
};
