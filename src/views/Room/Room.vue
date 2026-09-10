<template>
    <div :class="['room', { 'chat-open': isChatOpen }]">
        <Loading type="room" v-if="!playerOptions"></Loading>

        <UsersList
            :show="!playerState.controlsHidden"
            :roomOwner="roomOwner"
            :isUserOwner="isUserOwner"
            :users="usersList"
            :isPlayerPaused="playerState.paused"
            @onUpdateOwnership="onUpdateOwnership"
        />

        <div class="controls">
            <Button clear icon="close" v-if="isChatOpen" @click="isChatOpen = false"></Button>
            <Button clear icon="chatbubbles-outline" v-else @click="isChatOpen = true">Open Chat</Button>
        </div>

        <Player v-if="playerOptions" :options="playerOptions" @change="syncPlayer()" @ended="onVideoEnded"></Player>

        <NextEpisode v-if="nextEpisode" :episode="nextEpisode" :seconds="nextEpisodeSeconds"
            :disabled="!canControlNextEpisode" @confirm="playNextEpisode" @cancel="cancelNextEpisode">
        </NextEpisode>

        <transition name="fade">
            <Chat v-if="isChatOpen"></Chat>
        </transition>
    </div>
</template>

<script setup>
import { computed, getCurrentInstance, onMounted, onUnmounted, ref, watch } from 'vue';
import router from '@/router';
import store from '@/store';

import Loading from "@/components/Loading.vue";
import Button from "@/components/ui/Button.vue";
import Player from "@/components/player/Player.vue";
import NextEpisode from "@/components/player/NextEpisode.vue";
import Chat from "@/components/Chat.vue";
import UsersList from './UsersList/UsersList.vue';
import StremioService from "@/services/stremio.service";
import AddonService from "@/services/addon.service";
import HlsService from "@/services/hls.service";
import ClientService from "@/services/client.service";
import { onBeforeRouteLeave } from 'vue-router';

const NEXT_EPISODE_COUNTDOWN = 20;

const { proxy } = getCurrentInstance();

const resolvedStreamKey = ref(null);
const playerOptions = ref(null);
const isChatOpen = ref(false);

const nextEpisode = ref(null);
const nextEpisodeSeconds = ref(0);
let nextEpisodeInterval = null;

const clientState = computed(() => store.state.client);
const clientRoomState = computed(() => store.state.client.room);
const playerState = computed(() => store.state.player);
const collectionState = computed(() => store.state.addons.collection);
const installedAddonsState = computed(() => store.state.addons.installed);

const roomOwner = computed(() => clientRoomState.value && clientState.value.room.owner ? clientState.value.room.owner : null);
const usersList = computed(() => clientRoomState.value && clientState.value.room.users ? clientState.value.room.users : []);
const isUserOwner = computed(() => clientState.value && clientState.value.user && clientState.value.user.id ? roomOwner.value === clientState.value.user.id : false);
const installedStreamAddons = computed(() => collectionState.value && collectionState.value.streams.filter(addon => installedAddonsState.value.includes(addon.transportUrl)));
const canControlNextEpisode = computed(() => isUserOwner.value || !playerState.value.autoSync);

const streamKey = (stream) => stream.infoHash != null ? `${stream.infoHash}:${stream.fileIdx ?? ''}` : stream.url;

let cachedSeriesId = null;
let cachedSeriesVideos = null;

const getSeriesVideos = async (seriesId) => {
    if (cachedSeriesId !== seriesId) {
        const series = await StremioService.getMetaSeries(seriesId);
        cachedSeriesId = seriesId;
        cachedSeriesVideos = (series && series.videos) || [];
    }
    return cachedSeriesVideos;
};

const updateNowPlaying = async (meta) => {
    if (!meta) return;

    if (meta.type !== 'series') {
        playerOptions.value = { ...playerOptions.value, nowPlaying: { title: meta.name } };
        return;
    }

    const [seriesId, season, episode] = meta.id.split(':');

    try {
        const videos = await getSeriesVideos(seriesId);
        const video = videos.find((v) => v.id === meta.id);
        playerOptions.value = {
            ...playerOptions.value,
            nowPlaying: {
                title: meta.name,
                subtitle: video ? `S${season}E${episode} · ${video.name}` : `S${season}E${episode}`
            }
        };
    } catch(e) {
        playerOptions.value = { ...playerOptions.value, nowPlaying: { title: meta.name } };
    }
};

const syncRoom = async () => {
    const { stream, meta, player, owner } = clientState.value.room;

    playerOptions.value = {
        ...playerOptions.value,
        meta,
        isOwner: clientState.value.user.id === owner,
    };

    const key = streamKey(stream);
    if (resolvedStreamKey.value !== key) {
        const isTorrentStream = stream.infoHash != null;

        const videoUrl = isTorrentStream ? await StremioService.createTorrentStream(stream) : stream.url;
        playerOptions.value = {
            ...playerOptions.value,
            src: videoUrl,
            hls: null,
        };

        if (isTorrentStream) {
            const playlistUrl = await HlsService.createPlaylist(videoUrl);
            playerOptions.value = {
                ...playerOptions.value,
                hls: playlistUrl,
            };
        }

        resolvedStreamKey.value = key;
    }

    if (playerState.value.autoSync && playerState.value.video && !playerState.value.locked) {
        const { paused, buffering, time } = player;

        const unsync = time - playerState.value.video.currentTime;
        if (unsync > 1 || unsync < -1) {
            playerState.value.video.currentTime = time;
        }

        paused ? playerState.value.video.pause() : playerState.value.video.play();
        store.commit('player/updatePaused', playerState.value.video.paused);
        playerState.value.buffering = buffering;
    }
};

const syncPlayer = () => {
    if (playerState.value.autoSync) {
        const { currentTime } = playerState.value.video;
        ClientService.send('player.sync', {
            paused: playerState.value.paused,
            buffering: playerState.value.buffering,
            time: currentTime,
        });
    }
};

const onUpdateOwnership = (userId) => {
    ClientService.send('room.updateOwnership', { userId });
};

const cancelNextEpisode = () => {
    clearInterval(nextEpisodeInterval);
    nextEpisodeInterval = null;
    nextEpisode.value = null;
};

const onVideoEnded = async () => {
    const meta = playerOptions.value && playerOptions.value.meta;
    if (!meta) return;

    store.dispatch('watched/markWatched', meta.id);

    if (meta.type !== 'series') return;

    const [seriesId, season, episode] = meta.id.split(':');

    try {
        const videos = await getSeriesVideos(seriesId);
        const next = StremioService.getNextEpisode(videos, parseInt(season), parseInt(episode));
        if (!next) return;

        nextEpisode.value = next;
        nextEpisodeSeconds.value = NEXT_EPISODE_COUNTDOWN;

        nextEpisodeInterval = setInterval(() => {
            nextEpisodeSeconds.value -= 1;

            if (nextEpisodeSeconds.value <= 0) {
                nextEpisodeSeconds.value = 0;
                clearInterval(nextEpisodeInterval);
                nextEpisodeInterval = null;

                if (canControlNextEpisode.value) playNextEpisode();
            }
        }, 1000);
    } catch(e) {
        console.error('Failed to fetch the next episode');
    }
};

const playNextEpisode = async () => {
    if (!nextEpisode.value || !canControlNextEpisode.value) return;

    const episode = nextEpisode.value;
    const meta = { ...playerOptions.value.meta, id: episode.id };

    cancelNextEpisode();

    const streams = await AddonService.getStreams(installedStreamAddons.value, meta.type, episode.id);
    const stream = streams[0];
    if (!stream) return proxy.$toast.error(proxy.$t('toasts.noNextEpisodeStream'));

    ClientService.send('room.update', { meta, stream });
};

watch(clientRoomState, () => {
    syncRoom();
});

watch(resolvedStreamKey, () => {
    cancelNextEpisode();
});

watch(() => playerOptions.value && playerOptions.value.meta && playerOptions.value.meta.id, () => {
    updateNowPlaying(playerOptions.value && playerOptions.value.meta);
}, { immediate: true });

let syncPlayerInterval = null;

onMounted(() => {
    const { id } = router.currentRoute.value.params;
    ClientService.send('room.join', { id });
    
    syncPlayerInterval = setInterval(() => {
        if (playerState.value.video && !playerState.value.paused) {
            syncPlayer();
        }
    }, 1000);
});

onUnmounted(() => {
    clearInterval(syncPlayerInterval);
    syncPlayerInterval = null;
    clearInterval(nextEpisodeInterval);
    nextEpisodeInterval = null;
});

onBeforeRouteLeave(() => {
    store.commit('client/updateError', null);
});
</script>

<style lang="scss" scoped>
.room {
    display: flex;
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    user-select: none;

    &.chat-open {
        .users-list {
            display: none;
        }
    }

    .controls {
        z-index: 97;
        position: absolute;
        top: 0.75rem;
        right: 1rem;
    }
}

@media only screen and (min-width: 768px) and (min-height: 768px) {
    .room {
        &.chat-open {
            .users-list {
                display: inherit;
            }
        }
    }
}
</style>