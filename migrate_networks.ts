import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

async function migrate() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not found in .env');
        return;
    }

    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db('ParaYield_Lab');

        console.log('--- Starting Migration ---');

        // 1. Bifrost Migration
        const bifrostColl = db.collection('bifrost_snapshots');
        const bifrostResult = await bifrostColl.updateMany(
            { network: 'polkadot' },
            { $set: { network: 'bifrost' } }
        );
        console.log(`Bifrost: Updated ${bifrostResult.modifiedCount} snapshots from 'polkadot' to 'bifrost'.`);

        // 2. Hydration Migration
        const hydrationColl = db.collection('hydration_snapshots');
        const hydrationResult = await hydrationColl.updateMany(
            { network: 'polkadot' },
            { $set: { network: 'hydration' } }
        );
        console.log(`Hydration: Updated ${hydrationResult.modifiedCount} snapshots from 'polkadot' to 'hydration'.`);

        console.log('--- Migration Complete ---');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.close();
    }
}

migrate();
