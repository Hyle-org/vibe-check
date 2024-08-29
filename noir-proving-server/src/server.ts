import express, { Request, Response } from 'express';
import { proveECDSA } from './prover';
import cors from 'cors';

const app = express();

app.use(express.raw({ type: 'application/octet-stream', limit: 'Infinity' }));
app.use(cors());

app.post('/prove-ecdsa', async (req: Request, res: Response) => {
    console.log("Received a prove request")
    try {
        const result = await proveECDSA(req.body);
        res.status(200).send(result);
    } catch (error) {
        console.error(error);
        res.status(500).send('Une erreur est survenue');
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});