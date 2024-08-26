# Hyle teeML Vibe Check

Forked from Hyle Vibe check frontend [repo](https://github.com/Hyle-org/vibe-check/tree/main/vibe-check-frontend).

# Changes
## Changed zkML to teeML

The demo used to generate zk-proofs for the facial feature classification predictions using [Cairo](https://starkware.co/cairo/). This was necessary to predict if the person is smiling & prove the same using a zk-proof. Althought the computations required for this were server-side done on the Cairo VM it still resulted in long wait time for the users of the demo.

By using [TEE](https://www.marlin.org/ai) for serving classification predictions & their attestations we not only reduced wait time for the users but also give security security for this particular use-case.

# Todo
- [ ] Make production ready. Currently runnable in dev only.

### Development

Create a `.env` file before running the below commands. See `sample.env`.
```bash
npm install
npm run dev
```

### Setup

-   [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
-   [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)