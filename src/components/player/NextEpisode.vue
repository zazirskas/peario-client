<template>
    <div class="next-episode">
        <div class="info">
            <div class="label">{{ $t('components.player.nextEpisode.title') }}</div>
            <div class="name">{{ episode.name }}</div>
        </div>

        <div class="actions" :class="{ disabled }">
            <AButton clear icon="close-outline" @click="$emit('cancel')">
                {{ $t('components.player.nextEpisode.cancel') }}
            </AButton>
            <AButton icon="play-outline" @click="$emit('confirm')">
                {{ $t('components.player.nextEpisode.play') }} · {{ seconds }}s
            </AButton>
        </div>
    </div>
</template>

<script>
import AButton from "@/components/ui/Button.vue";

export default {
    name: 'NextEpisode',
    components: {
        AButton
    },
    props: {
        episode: Object,
        seconds: Number,
        disabled: Boolean
    },
    emits: ['confirm', 'cancel']
}
</script>

<style lang="scss" scoped>
.next-episode {
    z-index: 98;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 15px;
    text-align: center;
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 0 10px;
    background-color: rgba(0, 0, 0, 0.8);

    .info {
        display: flex;
        flex-direction: column;
        gap: 5px;
        color: $text-color;

        .label {
            text-transform: uppercase;
            font-family: 'Montserrat-Bold';
            opacity: 0.7;
            font-size: 14px;
        }

        .name {
            font-family: 'Montserrat-SemiBold';
            font-size: 24px;
        }
    }

    .actions {
        display: flex;
        gap: 15px;

        &.disabled {
            user-select: none;
            opacity: 0.3;
            pointer-events: none;
        }
    }
}
</style>
