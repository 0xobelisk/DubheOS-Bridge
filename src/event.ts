import { getFullnodeUrl, SuiClient, SuiEvent } from '@0xobelisk/sui-client';

async function pollEvents() {
	const client = new SuiClient({
		url: getFullnodeUrl('testnet'),
	});

	console.log('Starting to poll Sui events...');

	const pollInterval = 1000; // Increase polling interval to 1 second to reduce network pressure
	let MoveEventType =
		'0xe2a38ae55a486bcaf79658cde76894207cada4d64d3cb1b2b06c6c12c10d5d5b::storage_event::SetRecord<u256, address, 0xe2a38ae55a486bcaf79658cde76894207cada4d64d3cb1b2b06c6c12c10d5d5b::dubhe_account::Account>';

	// To track processed events, using unique event IDs
	const processedEvents = new Set<string>();
	let consecutiveErrors = 0;
	const maxConsecutiveErrors = 5;

	const poll = async () => {
		try {
			console.log('Querying latest events...');

			// Query latest events, reduce query quantity
			const eventPage = await client.queryEvents({
				query: {
					MoveEventType,
				},
				limit: 10, // Reduce query quantity to improve stability
				order: 'descending',
			});

			// Reset error counter
			consecutiveErrors = 0;

			if (eventPage.data.length > 0) {
				// Filter new events (unprocessed)
				const newEvents = eventPage.data.filter((event: SuiEvent) => {
					// Use txDigest + eventSeq as unique identifier
					const eventId = `${event.id.txDigest}-${event.id.eventSeq}`;
					return !processedEvents.has(eventId);
				});

				if (newEvents.length > 0) {
					console.log(`Found ${newEvents.length} new events:`);

					// Add new events to the processed set
					newEvents.forEach((event: SuiEvent) => {
						const eventId = `${event.id.txDigest}-${event.id.eventSeq}`;
						processedEvents.add(eventId);
					});

					// Display new events in chronological order (newest first)
					newEvents.forEach((event: SuiEvent, index: number) => {
						console.log(
							`New event ${index + 1}:`,
							event.id.txDigest,
							event.id.eventSeq
						);
						// console.log(`New event ${index + 1}:`, {
						//   id: event.id,
						//   packageId: event.packageId,
						//   transactionModule: event.transactionModule,
						//   sender: event.sender,
						//   type: event.type,
						//   parsedJson: event.parsedJson,
						//   timestampMs: event.timestampMs,
						// });
						console.log('---');
					});
				} else {
					console.log('No new events found');
				}

				// Periodically clean old event IDs to prevent memory leaks (keep latest 1000)
				if (processedEvents.size > 1000) {
					const eventsArray = Array.from(processedEvents);
					processedEvents.clear();
					// Keep the latest 500
					eventsArray
						.slice(-500)
						.forEach(id => processedEvents.add(id));
					console.log(
						'Cleaned old event records, current tracked events:',
						processedEvents.size
					);
				}
			} else {
				console.log('No events found');
			}
		} catch (error: any) {
			consecutiveErrors++;
			console.error(
				`Error polling events (consecutive errors: ${consecutiveErrors}):`,
				error.message || error
			);

			// If it's a specific transaction digest error, provide more detailed handling
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
			if (consecutiveErrors >= maxConsecutiveErrors) {
				console.log(
					`${maxConsecutiveErrors} consecutive errors occurred, pausing polling for 30 seconds...`
				);
				await new Promise(resolve => setTimeout(resolve, 30000));
				consecutiveErrors = 0; // Reset counter
			} else {
				// Brief wait before retry
				await new Promise(resolve => setTimeout(resolve, 2000));
			}
		}
	};

	// Execute immediately once
	await poll();

	// Set up periodic polling
	const intervalId = setInterval(poll, pollInterval);

	// Return function to stop polling
	return () => {
		clearInterval(intervalId);
		console.log('Event polling stopped');
		console.log(`Total tracked ${processedEvents.size} unique events`);
	};
}

async function main() {
	console.log(
		'Note: Sui WebSocket API is deprecated, using polling method instead'
	);
	console.log('====================================================');

	try {
		await pollEvents();
	} catch (error) {
		console.error('Main program error:', error);
		console.log('Program will restart in 5 seconds...');
		setTimeout(() => {
			main().catch(console.error);
		}, 5000);
	}
}

main().catch(console.error);
