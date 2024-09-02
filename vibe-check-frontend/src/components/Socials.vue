<template>
    <ul id="socials">
        <li>
            <a class="social" href="/" alt="Hylé">
                <img src="../assets/Hyle_logo.svg" class="h-10 m-auto" />
            </a>
        </li>
        <li class="push">
            <a class="social" href="https://twitter.com/hyle_org" alt="Twitter">
                <img src="../assets/twitter-logo.png" :width="iconSize" :height="iconSize" />
            </a>
        </li>
        <li>
            <a class="social" href="https://github.com/Hyle-org/vibe-check" alt="Github repo">
                <img src="../assets/github-logo.png" :width="iconSize" :height="iconSize" />
            </a>
        </li>
        <li>
            <a class="social" href="https://t.me/hyle_org" alt="Telegram">
                <img src="../assets/telegram-logo.png" :width="iconSize" :height="iconSize" />
            </a>
        </li>

        <li>
            <a class="social" href="https://warpcast.com/hyle-org" alt="Farcaster">
                <img src="../assets/farcaster-logo.png" :width="iconSize" :height="iconSize" />
            </a>
        </li>
    </ul>
</template>

<script setup lang="ts">

const iconSize = 36;
</script>

<style lang="css">
#socials {
    display: flex;
    align-items: center;
}

.push {
    margin-left: auto;
}

#socials>li {}

#socials>li:hover {
    opacity: 0.6;
}
</style>