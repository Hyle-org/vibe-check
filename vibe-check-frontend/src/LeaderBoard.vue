<script setup lang="ts">
import { computed } from "vue";
import Logo from "./assets/Hyle_logo.svg";
import { SmileTokenBalances } from "./SmileTokenIndexer";
import { getWebAuthnIdentity } from "./webauthn";

const identity = getWebAuthnIdentity();

const sortedBalances = computed(() => {
    return Object.entries(SmileTokenBalances.value)
        .sort((a, b) => b[1] - a[1]);
});

const progress_bar = (score: number, max: number, nb_bars = 15) => {
    const current_percent = score / max * nb_bars;
    let res = "";
	for (let n = 1; n < nb_bars + 1; n++) {
        if (current_percent < n) {
            res += "░"; // alt-176 
        }
        else {
            res += "▓"; // alt-178
        }
	}

    return res;
}


</script>

<template>
    <div class="container m-auto">
        <h1 class="text-center my-4">Vibe Check</h1>
        <h3 class="text-center my-4"><img :src="Logo" alt="Hylé logo" class="h-10 m-auto"></img></h3>
        <strong id="address" class="identity">{{ identity }}</strong>
        <hr />
        <h1 class="leaderboard_title">Leaderboard</h1>
        <hr />
        <ul class="results">
            <li v-for="(balance, index) in sortedBalances" :key="balance[0]" :class="balance[0] === identity ? 'identity' : 'else'"><strong>#{{ index + 1 }}</strong> {{ balance[0] }} - {{ balance[1] }} {{ progress_bar(balance[1], 200) }}</li>
        </ul>
    </div>
</template>

<style>

.leaderboard_title {
    text-align: center;
    margin: 0.5em;
}

.results {
    margin: auto;
    text-align: center;
    margin-top: 1em;
}

.identity {
    background-color:white;
    color: #E0482E;
}

ul > li {
    font-family: monospace;
    list-style: none;
    padding: 0.5em;
    font-size: 1.2em;
}

#address {
    font-family: monospace;
    position: absolute;
    top: 0;
    right: 0;
    padding: 0.5em;
    margin: 0;
  }
</style>
