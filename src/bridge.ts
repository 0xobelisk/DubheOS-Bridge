import { Dubhe, IndexerEvent, SubscriptionKind } from '@0xobelisk/sui-client';
import { NETWORK, PACKAGE_ID } from './config';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { isHex } from '@polkadot/util';
import { BridgeQueue } from './queue/BridgeQueue';

const RECONNECT_CONFIG = {
	maxRetries: 5,
	retryInterval: 5000, // 5 seconds
	currentRetries: 0,
};

// Add address validation function
function isValidDubheAddress(address: string): boolean {
	try {
		// Check address format
		if (isHex(address)) {
			// If hex format, convert to ss58 format
			address = encodeAddress(address);
		}

		// Try to decode address, if successful then address is valid
		const decoded = decodeAddress(address);

		// Ensure address length is correct (32 bytes public key)
		return decoded.length === 32;
	} catch (error) {
		console.error('Invalid address format:', error);
		return false;
	}
}

const subscribeToEvents = async (dubhe: Dubhe, bridgeQueue: BridgeQueue) => {
	try {
		await dubhe.subscribe({
			types: [
				{
					kind: SubscriptionKind.Event,
					name: 'bridge_withdraw',
				},
			],
			handleData: async (data: IndexerEvent) => {
				console.log('Received real-time data:', data);
				const { sender, value } = data;
				const fromAddress = value.from;
				const toAddress = value.to;
				const bridgeCoinAmount = value.amount;
				console.log(`fromAddress: ${fromAddress}`);
				console.log(`toAddress: ${toAddress}`);
				console.log(`bridgeCoinAmount: ${bridgeCoinAmount}`);

				// Validate address format
				if (!isValidDubheAddress(fromAddress)) {
					console.error(
						'Invalid Dubhe Chain address format:',
						fromAddress
					);
					return;
				}

				// Validate amount
				if (
					isNaN(Number(bridgeCoinAmount)) ||
					Number(bridgeCoinAmount) <= 0
				) {
					console.error('Invalid amount:', bridgeCoinAmount);
					return;
				}

				// After address and amount validation, call Polkadot transfer handler
				await bridgeQueue.addTask(
					sender,
					fromAddress,
					toAddress,
					bridgeCoinAmount
				);
			},

			onOpen: () => {
				RECONNECT_CONFIG.currentRetries = 0;
				console.log('Connected to DubheOS Indexer');
			},
			onClose: async () => {
				await handleReconnect(dubhe, bridgeQueue);
			},
		});
	} catch (error) {
		console.error('Failed to subscribe to events:', error);
		console.log('Retrying in 5 seconds...');

		await new Promise(resolve =>
			setTimeout(resolve, RECONNECT_CONFIG.retryInterval)
		);
		await subscribeToEvents(dubhe, bridgeQueue);
	}
};

async function handleReconnect(dubhe: Dubhe, bridgeQueue: BridgeQueue) {
	if (RECONNECT_CONFIG.currentRetries >= RECONNECT_CONFIG.maxRetries) {
		console.error(
			`Failed to reconnect after ${RECONNECT_CONFIG.maxRetries} attempts. Exiting service...`
		);
		process.exit(1);
	}

	RECONNECT_CONFIG.currentRetries++;
	console.log(
		`Attempting to reconnect (${RECONNECT_CONFIG.currentRetries}/${RECONNECT_CONFIG.maxRetries})...`
	);

	await new Promise(resolve =>
		setTimeout(resolve, RECONNECT_CONFIG.retryInterval)
	);
	await subscribeToEvents(dubhe, bridgeQueue);
}

export async function startBridgeProcess() {
	console.log('====================================');
	console.log('DubheOS Bridge Service');
	console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
	console.log(`Network Type: ${NETWORK}`);
	console.log(`Package ID: ${PACKAGE_ID}`);
	console.log(`Starting bridge service at ${new Date().toISOString()}`);
	console.log('====================================');

	const bridgeQueue = new BridgeQueue();
	await bridgeQueue.initializeApi();

	const dubhe = new Dubhe({
		networkType: NETWORK,
		indexerUrl: process.env.DUBHEOS_INDEXER_URL,
		indexerWsUrl: process.env.DUBHEOS_INDEXER_WS_URL,
	});

	await subscribeToEvents(dubhe, bridgeQueue);
}
