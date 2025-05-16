import { Dubhe, IndexerEvent, SubscriptionKind } from '@0xobelisk/sui-client';
import { NETWORK, PACKAGE_ID } from './config';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { isHex } from '@polkadot/util';
import { BridgeQueue } from './queue/BridgeQueue';

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
		await dubhe.subscribe(
			[
				{
					kind: SubscriptionKind.Event,
					name: 'asset_moved',
				},
			],
			async (data: IndexerEvent) => {
				console.log('Received real-time data:', data);
				const { sender, checkpoint, value } = data;
				const userDubheAddress = value.chain_address;
				const bridgeCoinAmount = value.amount;
				console.log(`userDubheAddress: ${userDubheAddress}`);
				console.log(`bridgeCoinAmount: ${bridgeCoinAmount}`);
				console.log(`checkpoint: ${checkpoint}`);

				// Validate address format
				if (!isValidDubheAddress(userDubheAddress)) {
					console.error(
						'Invalid Dubhe Chain address format:',
						userDubheAddress
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
					userDubheAddress,
					bridgeCoinAmount,
					checkpoint
				);
			}
		);
	} catch (error) {
		console.error('Failed to subscribe to events:', error);
	}
};

export async function bridge_process() {
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
		indexerUrl: 'http://43.154.98.251:3001',
		indexerWsUrl: 'ws://43.154.98.251:3001',
	});

	subscribeToEvents(dubhe, bridgeQueue);
}
