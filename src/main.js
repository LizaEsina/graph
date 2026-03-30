import { createApp, watch } from "vue";
import App from "./App.vue";
import "./style.css";

import VNetworkGraph from "v-network-graph";
import "v-network-graph/lib/style.css";
import { hydrateGraphStore, saveGraphStore } from "./services/storePersistence";
import { graphStore } from "./store/graphStore";

const app = createApp(App);

hydrateGraphStore(graphStore);

watch(
  graphStore,
  () => {
    saveGraphStore(graphStore);
  },
  { deep: true }
);

app.use(VNetworkGraph); 

app.mount("#app");
