import { getFullnodeUrl, SuiClient, SuiEvent } from '@0xobelisk/sui-client';
import { NETWORK, PACKAGE_ID } from './config';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { isHex } from '@polkadot/util';
import { BridgeQueue } from './queue/BridgeQueue';

const RECONNECT_CONFIG = {
	maxRetries: 5,
	retryInterval: 1000, // 1 seconds
	currentRetries: 0,
	pollInterval: 200,
	maxConsecutiveErrors: 5,
};

const MoveEventType =
	'0xe2a38ae55a486bcaf79658cde76894207cada4d64d3cb1b2b06c6c12c10d5d5b::storage_event::SetRecord<0xe2a38ae55a486bcaf79658cde76894207cada4d64d3cb1b2b06c6c12c10d5d5b::dubhe_bridge_withdraw_event::BridgeWithdrawEvent, 0xe2a38ae55a486bcaf79658cde76894207cada4d64d3cb1b2b06c6c12c10d5d5b::dubhe_bridge_withdraw_event::BridgeWithdrawEvent, 0xe2a38ae55a486bcaf79658cde76894207cada4d64d3cb1b2b06c6c12c10d5d5b::dubhe_bridge_withdraw_event::BridgeWithdrawEvent>';

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

async function pollBridgeEvents(bridgeQueue: BridgeQueue) {
	const client = new SuiClient({
		url: getFullnodeUrl(NETWORK),
	});

	console.log('Starting to poll Bridge events...');

	// Track processed events using unique event IDs
	const processedEvents = new Set<string>();
	let consecutiveErrors = 0;

	const poll = async () => {
		try {
			// Query latest events
			const eventPage = await client.queryEvents({
				query: {
					MoveEventType,
				},
				limit: 10,
				order: 'descending',
			});

			// Reset error counter
			consecutiveErrors = 0;

			if (eventPage.data.length > 0) {
				// Filter new events (not processed yet)
				const newEvents = eventPage.data.filter((event: SuiEvent) => {
					// Use txDigest + eventSeq as unique identifier
					const eventId = `${event.id.txDigest}-${event.id.eventSeq}`;
					return !processedEvents.has(eventId);
				});

				if (newEvents.length > 0) {
					console.log(`Found ${newEvents.length} new Bridge events:`);

					// Add new events to the processed set
					newEvents.forEach((event: SuiEvent) => {
						const eventId = `${event.id.txDigest}-${event.id.eventSeq}`;
						processedEvents.add(eventId);
					});

					// Process new events in chronological order (newest first)
					for (const event of newEvents) {
						try {
							// Parse event data
							const eventData = event.parsedJson as any;
							const sender = event.sender;
							const fromAddress = eventData.value.fields.from;
							const toAddress = eventData.value.fields.to;
							const bridgeCoinAmount =
								eventData.value.fields.amount;

							// Validate address format
							if (!isValidDubheAddress(fromAddress)) {
								console.error(
									'Invalid Dubhe Chain address format:',
									fromAddress
								);
								continue;
							}

							// Validate amount
							if (
								isNaN(Number(bridgeCoinAmount)) ||
								Number(bridgeCoinAmount) <= 0
							) {
								console.error(
									'Invalid amount:',
									bridgeCoinAmount
								);
								continue;
							}

							const eventId = `${event.id.txDigest}-${event.id.eventSeq}`;

							// After address and amount validation, call Polkadot transfer handler
							await bridgeQueue.addTask(
								eventId,
								sender,
								fromAddress,
								toAddress,
								bridgeCoinAmount
							);
						} catch (eventError) {
							console.error(
								'Error processing individual event:',
								eventError
							);
						}
					}
				}

				// Periodically clean old event IDs to prevent memory leaks (keep latest 1000)
				if (processedEvents.size > 1000) {
					const eventsArray = Array.from(processedEvents);
					processedEvents.clear();
					// Keep latest 500
					eventsArray
						.slice(-500)
						.forEach(id => processedEvents.add(id));
					console.log(
						'Cleaned old event records, current tracked events:',
						processedEvents.size
					);
				}
			} else {
				console.log('No Bridge events found');
			}
		} catch (error: any) {
			consecutiveErrors++;
			console.error(
				`Error polling Bridge events (consecutive errors: ${consecutiveErrors}):`,
				error.message || error
			);

			// If specific transaction digest error, provide more detailed handling
			if (
				error.message &&
				error.message.includes(
					'Could not find the referenced transaction'
				)
			) {
				console.log(
					'Detected transaction digest reference error, usually caused by network sync issues'
				);
				console.log('Suggestions:');
				console.log('1. Check network connection');
				console.log('2. Wait for node synchronization to complete');
				console.log('3. Reduce query frequency');
			}

			// If too many consecutive errors, increase wait time
			if (consecutiveErrors >= RECONNECT_CONFIG.maxConsecutiveErrors) {
				console.log(
					`${
						RECONNECT_CONFIG.maxConsecutiveErrors
					} consecutive errors occurred, pausing polling for ${
						RECONNECT_CONFIG.retryInterval / 1000
					} seconds...`
				);
				await new Promise(resolve =>
					setTimeout(resolve, RECONNECT_CONFIG.retryInterval)
				);
				consecutiveErrors = 0; // Reset counter
			} else {
				// Brief wait before retry
				await new Promise(resolve =>
					setTimeout(resolve, RECONNECT_CONFIG.retryInterval)
				);
			}
		}
	};

	// Execute immediately once
	await poll();

	// Set up periodic polling
	const intervalId = setInterval(poll, RECONNECT_CONFIG.pollInterval);

	// Return function to stop polling
	return () => {
		clearInterval(intervalId);
		console.log('Bridge event polling stopped');
		console.log(`Total tracked ${processedEvents.size} unique events`);
	};
}

export async function startBridgeProcess() {
	console.log('====================================');
	console.log('DubheOS Bridge Service');
	console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
	console.log(`Network Type: ${NETWORK}`);
	console.log(`Package ID: ${PACKAGE_ID}`);
	console.log(`Starting bridge service at ${new Date().toISOString()}`);
	console.log('Note: Using polling method instead of WebSocket subscription');
	console.log('====================================');

	const bridgeQueue = new BridgeQueue();
	await bridgeQueue.initializeApi();

	try {
		await pollBridgeEvents(bridgeQueue);
	} catch (error) {
		console.error('Bridge service error:', error);
		console.log(
			`Program will restart in ${
				RECONNECT_CONFIG.retryInterval / 1000
			} seconds...`
		);
		setTimeout(() => {
			startBridgeProcess().catch(console.error);
		}, RECONNECT_CONFIG.retryInterval);
	}
}
