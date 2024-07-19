<template>
    <a class="social" :href="url">
        <img :src="logo" width="48" height="48"/>
    </a>
</template>
    
<script setup lang="ts">

defineProps<{
    url: string,
    logo: string
}>()

</script>
    
<style lang="css">
.social {
    cursor:pointer;
}
</style> 