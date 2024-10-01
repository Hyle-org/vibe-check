export const network = import.meta.env.PROD ? "devnet" : "localhost";

export const getCairoProverUrl = () => {
    return {
        localhost: "http://localhost:3000",
        devnet: "https://vibe.hyle.eu/cairoprover",
    }[network];
};

export const getNoirProverUrl = () => {
    return {
        localhost: "http://localhost:3001",
        devnet: "https://vibe.hyle.eu/noirprover",
    }[network];
};

export const getRpId = () => {
    return {
        localhost: "localhost",
        devnet: "vibe.hyle.eu",
    }[network];
};
