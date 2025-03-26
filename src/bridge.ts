import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { Dubhe, SubscriptionKind } from '@0xobelisk/sui-client';
import { NETWORK, PACKAGE_ID } from './config';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { isHex } from '@polkadot/util';

// Add Dubhe deposit handling function
async function handleDubheDeposit(fromChain: string, fromAddress: string, targetAddress: string, amount: number) {
	try {
		// Create Keyring instance using default sr25519
		const keyring = new Keyring({ type: 'sr25519' });

		// Use Alice test account
		const alice = keyring.addFromUri('//Alice');

		// Connect to Dubhe node
		const wsProvider = new WsProvider('ws://43.154.98.251:9944');
		const api = await ApiPromise.create({
			provider: wsProvider,
			noInitWarn: true,
		});

		// Convert address to H256 format
		const addressH256 = isHex(fromAddress) ? fromAddress : "0x" + Buffer.from(fromAddress).toString('hex');
		
		// Create chain parameter based on the source chain
		let chainParam = {
			Sui: addressH256
		}
		

		// Create and send transaction using the deposit extrinsic
		const transfer = api.tx.bridge.deposit(
			chainParam,
			targetAddress,
			amount
		);

		// Sign and send transaction
		const hash = await transfer.signAndSend(alice, ({ status, events }) => {
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
		});

		console.log('Transfer initiated with hash:', hash.toString());
	} catch (error) {
		console.error('Failed to process Polkadot transfer:', error);
	}
}

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

const subscribeToEvents = async (dubhe: Dubhe) => {
	try {
		console.log("1");
		
		await dubhe.subscribe([
			{
			  kind: SubscriptionKind.Event,
			  name: 'bridge_withdraw',
			},
		  ], async data => {
			console.log('Received real-time data:', data);
			const fromChain = data.value.to_chain;
			const fromAddress = data.value.from;
			const dubhe_coin_amount = data.value.amount;
			const to_address = data.value.to;
		
			console.log("11");
			// Validate address format
			if (!isValidDubheAddress(to_address)) {
				console.error(
					'Invalid Polkadot address format:',
					to_address
				);
				return;
			}

			// Validate amount
			if (
				isNaN(Number(dubhe_coin_amount)) ||
				Number(dubhe_coin_amount) <= 0
			) {
				console.error('Invalid amount:', dubhe_coin_amount);
				return;
			}
			console.log("111");
			// After address and amount validation, call Polkadot transfer handler
			await handleDubheDeposit(
				fromChain,
				fromAddress,
				to_address,
				Number(dubhe_coin_amount)
			);
			console.log("1111");
		});
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

	const dubhe = new Dubhe({
		networkType: NETWORK,
		packageId: PACKAGE_ID,
		indexerUrl: 'http://43.154.98.251:3001',
		indexerWsUrl: 'ws://43.154.98.251:3001',
	});
	await subscribeToEvents(dubhe);
}
