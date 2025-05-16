import { ApiPromise, HttpProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { KeyringPair$Json } from '@polkadot/keyring/types';
import { waitReady } from '@polkadot/wasm-crypto';

import fs from 'fs';

import * as dotenv from 'dotenv';
dotenv.config();

export const delay = (ms: number) =>
	new Promise(resolve => setTimeout(resolve, ms));

export function listFilesInDirectory(directoryPath: string) {
	try {
		let files = fs.readdirSync(directoryPath);
		const data = files.map(file => {
			return {
				path: `${directoryPath}/${file}`,
			};
		});
		return data;
	} catch (err) {
		console.error('Error listing files in directory:', err);
	}
}

export async function getSigner() {
	try {
		const files = listFilesInDirectory('./src/keys');
		const keyStr = fs.readFileSync(files[0].path, 'utf8');
		// const keyStr = fs.readFileSync('./keys/bridge-manager.json', 'utf8');
		const keyring = new Keyring({ type: 'sr25519' });
		const Key = JSON.parse(keyStr) as KeyringPair$Json;
		const system = keyring.createFromJson(Key);
		system.unlock(process.env.DUBHEOS_BRIDGE_MANAGER_PASSWORD);

		return system;
	} catch (err) {
		console.error('Error reading JSON file:', err);
		process.exit();
	}
}

// Add Dubhe transfer handling function
export async function transferDubhe(targetAddress: string, amount: number) {
	try {
		const bridgeManager = await getSigner();

		// Connect to Dubhe node
		// const wsProvider = new WsProvider('ws://43.154.98.251:9944');
		const httpProvider = new HttpProvider(process.env.DUBHEOS_HTTP_RPC);
		const api = await ApiPromise.create({
			provider: httpProvider,
			noInitWarn: true,
		});

		const nonce = await api.rpc.system.accountNextIndex(
			bridgeManager.address
		);

		// Create and send transaction
		const transfer = api.tx.balances.transferKeepAlive(
			targetAddress,
			amount
		);

		// Sign and send transaction
		const hash = await transfer.signAndSend(bridgeManager, { nonce });

		// console.log('Transfer initiated with hash:', hash.toString());
		return hash.toString();
	} catch (error) {
		console.error('Failed to process Polkadot transfer:', error);
	}
}

export async function batchSend(
	api: ApiPromise,
	recipients: { address: string; amount: number }[]
) {
	const batchSize = 1000;

	let signer = await getSigner();

	for (let i = 0; i < recipients.length; i += batchSize) {
		const batchRecipients = recipients.slice(i, i + batchSize);

		let nonce = await api.rpc.system.accountNextIndex(signer.address);

		let transactions = batchRecipients.map(recipient => {
			return api.tx.balances.transferAllowDeath(
				recipient.address,
				recipient.amount
			);
		});

		const batch = api.tx.utility.batch(transactions);
		const hash = await batch.signAndSend(signer, { nonce });

		return hash.toString();
	}
}
