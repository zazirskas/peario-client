import StorageService from '@/services/storage.service';

export default {
    namespaced: true,
    state: {
        ids: []
    },
    getters: {
        isWatched: (state) => (id) => state.ids.includes(id)
    },
    mutations: {
        updateIds(state, ids) {
            state.ids = ids;
        }
    },
    actions: {
        load({ commit }) {
            commit('updateIds', StorageService.get('watched') || []);
        },
        markWatched({ commit, state }, id) {
            if (!id || state.ids.includes(id)) return;

            const ids = [...state.ids, id];
            commit('updateIds', ids);
            StorageService.set('watched', ids);
        }
    }
};
