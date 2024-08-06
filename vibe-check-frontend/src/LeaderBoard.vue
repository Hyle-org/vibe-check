<script setup lang="ts">
import { computed } from "vue";
import { getBalances } from "./SmileTokenIndexer";

defineProps<{
    identity?: string
}>()

let score_max: number;

const sortedBalances = computed(() => {
    let temp = getBalances()
        .sort((a, b) => b.amount - a.amount)
        .filter((balance) => balance.name != "faucet");
    score_max = Math.max(...temp.map((elem) => elem.amount));
    return temp
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
        <strong id="address" class="identity" v-if="identity">{{ identity }}</strong>
        <hr />
        <h1 class="leaderboard_title">Leaderboard</h1>
        <hr />
        <ul class="results">
            <li v-for="(balance, index) in sortedBalances" :key="balance.name + '-' + index"
                :class="balance.name === identity ? 'identity' : 'else'"><strong>#{{ index + 1 }}</strong> {{
            balance.name
        }} - {{ balance.amount }} {{ progress_bar(balance.amount, score_max) }}</li>
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
    background-color: white;
    color: #E0482E;
}

ul>li {
    font-family: monospace;
    list-style: none;
    padding: 0.5em;
    font-size: 1.2em;
}

#address {
    font-family: monospace;
    position: fixed;
    bottom: 0;
    right: 0;
    padding: 0.5em;
    margin: 0;
}
</style>
