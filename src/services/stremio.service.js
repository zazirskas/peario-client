import axios from "axios";
import { CINEMETA_URL, OPENSUBTITLES_URL, STREMIO_API_URL, STREMIO_STREAMING_SERVER } from "@/common/config";

const StremioService = {

    async isServerOpen() {
        try {
            await axios.get(`${STREMIO_STREAMING_SERVER}/stats.json`);
            return Promise.resolve(true);
        } catch(e) {
            return Promise.resolve(false);
        }
    },

    async getMetaSeries(imdbId) {
        const { data } = await axios.get(`${CINEMETA_URL}/meta/series/${imdbId}.json`);
        return data.meta;
    },

    async getMetaMovie(imdbId) {
        const { data } = await axios.get(`${CINEMETA_URL}/meta/movie/${imdbId}.json`);
        return data.meta;
    },

    async searchMovies(title) {
        const { data } = await axios.get(`${CINEMETA_URL}/catalog/movie/top/search=${title}.json`);
        return data.metas;
    },

    async searchSeries(title) {
        const { data } = await axios.get(`${CINEMETA_URL}/catalog/series/top/search=${title}.json`);
        return data.metas;
    },

    async getAddons() {
        const { data } = await axios.get(`${STREMIO_API_URL}/addonscollection.json`);
        return data;
    },

    async createTorrentStream(stream) {
        let { infoHash, fileIdx = null } = stream;
        const { data } = await axios.get(`${STREMIO_STREAMING_SERVER}/${infoHash}/create`);
        const { files } = data;
        if (!fileIdx) fileIdx = files.indexOf(files.sort((a, b) => a.length - b.length).reverse()[0]);
        return `${STREMIO_STREAMING_SERVER}/${infoHash}/${fileIdx}`;
    },

    async getStats(streamUrl) {
        const { data } = await axios.get(`${streamUrl}/stats.json`);
        console.log(data);
        
        return data;
    },

    async getSubtitles({ type, id, url }) {
        try {
            const { hash } = await getOpenSubInfo(url);
            return queryOpenSubtitles({
                type,
                id,
                videoHash: hash,
            });
        } catch(_) {
            return [];
        }
    },

    getNextEpisode(videos, season, episode) {
        const seasons = [...new Set(videos.map((video) => video.season))].sort((a, b) => {
            if (a === 0) return 1;
            if (b === 0) return -1;
            return a - b;
        });

        const episodesOf = (s) => videos.filter((video) => video.season === s).sort((a, b) => a.episode - b.episode);

        const currentSeasonEpisodes = episodesOf(season);
        const currentIndex = currentSeasonEpisodes.findIndex((video) => video.episode === episode);
        if (currentIndex !== -1 && currentIndex + 1 < currentSeasonEpisodes.length)
            return currentSeasonEpisodes[currentIndex + 1];

        const nextSeason = seasons[seasons.indexOf(season) + 1];
        if (nextSeason === undefined) return null;

        return episodesOf(nextSeason)[0] || null;
    }

};

async function getOpenSubInfo(streamUrl) {
    const { data } = await axios.get(`${STREMIO_STREAMING_SERVER}/opensubHash?videoUrl=${streamUrl}`);
    const { result } = data;
    return result;
}

async function queryOpenSubtitles({ type, id, videoHash }) {
    const { data } = await axios.get(`${OPENSUBTITLES_URL}/subtitles/${type}/${id}/videoHash=${videoHash}.json`);
    const { subtitles } = data;
    return subtitles;
}

export default StremioService;