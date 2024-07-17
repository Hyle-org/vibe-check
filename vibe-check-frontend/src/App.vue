<script setup lang="ts">
</script>

<template>
    <RouterView />
</template>

<style>
html {
    @apply font-garamond font-normal leading-snug;
}


body {
    @apply bg-primary text-secondary font-garamond;
}

h1,
h2,
h3,
h4,
h5,
h6 {
    @apply font-anton uppercase;
}

p {
    @apply font-garamond text-xl leading-6;
}

h1 {
    @apply text-4xl;
}

a {
    @apply border-b border-secondary cursor-pointer;
}

a:hover {
    @apply text-primary border-primary;
}

button {
    @apply bg-gray-900 font-anton uppercase rounded-full px-4 py-2 text-white;
}

button:hover:not(:disabled) {
    @apply tracking-widest;
}

button:active:not(:disabled) {
    @apply bg-secondary text-primary;
}

button:disabled {
    @apply bg-gray-500 text-opacity-50;
}

i.spinner {
    @apply animate-spin;
    @apply inline-block border-4 border-t-4 border-secondary border-t-primary rounded-full w-4 h-4 mt-1 mx-1;
}
</style>