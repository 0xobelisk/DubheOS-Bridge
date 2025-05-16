import { getSigner, batchSend, transferDubhe } from '../src/queue/tx';
import { ApiPromise, HttpProvider } from '@polkadot/api';

async function main() {
	// Connect to Dubhe node
	const httpProvider = new HttpProvider('http://43.154.98.251:9944');
	// const httpProvider = new HttpProvider('http://127.0.0.1:9944');
	const api = await ApiPromise.create({
		provider: httpProvider,
		noInitWarn: true,
	});

	const tx = await batchSend(api, [
		{
			address:
				'0x1cbd2d43530a44705ad088af313e18f80b53ef16b36177cd4b77b846f2a5f07c',
			amount: 100000000,
		},
	]);

	// const tx = await transferDubhe(
	// 	api,
	// 	'0x1cbd2d43530a44705ad088af313e18f80b53ef16b36177cd4b77b846f2a5f07c',
	// 	100000000
	// );

	console.log(tx);
}

main();
