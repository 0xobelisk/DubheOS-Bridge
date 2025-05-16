import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { KeyringPair$Json } from '@polkadot/keyring/types';
import { waitReady } from '@polkadot/wasm-crypto';

import fs from 'fs';

import * as dotenv from 'dotenv';
dotenv.config();

export const delay = (ms: number) =>
	new Promise(resolve => setTimeout(resolve, ms));

export async function getSigner() {
	// const keyring = new Keyring({ type: 'sr25519' });
	// const bridgeManager = keyring.addFromJson(
	// 	JSON.parse(
	// 		fs.readFileSync('./keys/bridge-manager.json', 'utf8')
	// 	) as KeyringPair$Json
	// );
	// return bridgeManager;

	try {
		const keyStr = fs.readFileSync('./keys/bridge-manager.json', 'utf8');
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
		const bridgeManager = getSigner();

		// Connect to Dubhe node
		// const wsProvider = new WsProvider('ws://43.154.98.251:9944');
		const wsProvider = new WsProvider(process.env.DUBHEOS_WS_URL);
		const api = await ApiPromise.create({
			provider: wsProvider,
			noInitWarn: true,
		});

		// Create and send transaction
		const transfer = api.tx.balances.transferKeepAlive(
			targetAddress,
			amount
		);

		// Sign and send transaction
		const hash = await transfer.signAndSend(
			bridgeManager,
			({ status, events }) => {
				if (status.isInBlock) {
					console.log(
						'Transfer included in block:',
						status.asInBlock.toHex()
					);

					events.forEach(({ event }) => {
						if (event.section === 'balances') {
							console.log('Transfer event:', event.method);
							console.log('Event data:', event.data.toString());
						}
					});
				} else if (status.isFinalized) {
					console.log(
						'Transfer finalized in block:',
						status.asFinalized.toHex()
					);
					// Optional: Close connection
					api.disconnect();
				}
			}
		);

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

	let signer = getSigner();

	// const httpProvider = new HttpProvider(
	// 	'https://fraa-flashbox-2958-rpc.a.stagenet.tanssi.network'
	// );
	// const api = await ApiPromise.create({
	// 	provider: httpProvider,
	// 	noInitWarn: true,
	// });

	for (let i = 0; i < recipients.length; i += batchSize) {
		const batchRecipients = recipients.slice(i, i + batchSize);

		let transactions = batchRecipients.map(recipient => {
			return api.tx.balances.transferAllowDeath(
				recipient.address,
				recipient.amount
			);
		});

		const batch = api.tx.utility.batch(transactions);
		const hash = await new Promise((resolve, reject) => {
			batch
				.signAndSend(signer, ({ events = [], status }) => {
					// console.log('Transaction status:', status.type);
					if (status.isInBlock) {
						// console.log(
						// 	'Included at block hash',
						// 	status.asInBlock.toHex()
						// );
					} else if (status.isFinalized) {
						// console.log(
						// 	'Finalized block hash',
						// 	status.asFinalized.toHex()
						// );
						resolve(status.asFinalized.toHex());
					}
				})
				.catch(error => reject(error));
		});

		// console.log(`Faucet Hash: ${hash}`);
		// await delay(3000);
		return hash.toString();
	}
}
