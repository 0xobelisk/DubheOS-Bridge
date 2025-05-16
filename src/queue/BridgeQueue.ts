import { EventEmitter } from 'events';
import { DatabaseService } from '../services/database';
import { batchSend } from './tx';
import { ApiPromise, WsProvider } from '@polkadot/api';

export interface BridgeTask {
	id: string;
	sender: string;
	dubheChainAddress: string;
	amount: string;
	checkpoint: string;
	timestamp: number;
	status: 'pending' | 'processing' | 'completed' | 'failed';
	result?: any;
	error?: string;
}

interface BatchExecuteResult {
	transactionHash?: string;
	error?: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class BridgeQueue {
	private static instance: BridgeQueue;
	private eventEmitter: EventEmitter;
	private processing: boolean;
	private db: DatabaseService;
	private wsProvider: WsProvider;
	private api?: ApiPromise;

	public constructor() {
		this.eventEmitter = new EventEmitter();
		this.processing = false;
		this.db = DatabaseService.getInstance();
		this.startProcessing();

		// Connect to Dubhe node
		// const wsProvider = new WsProvider('ws://43.154.98.251:9944');
		this.wsProvider = new WsProvider(process.env.DUBHEOS_WS_URL);
	}

	public async initializeApi() {
		this.api = await ApiPromise.create({
			provider: this.wsProvider,
			noInitWarn: true,
		});
	}

	public static getInstance(): BridgeQueue {
		if (!BridgeQueue.instance) {
			BridgeQueue.instance = new BridgeQueue();
		}
		return BridgeQueue.instance;
	}

	public async addTask(
		sender: string,
		dubheChainAddress: string,
		amount: string,
		checkpoint: string
	): Promise<string> {
		const id = `${sender}-${checkpoint}-${dubheChainAddress}`;

		const existingTask = await this.db.getTask(id);
		if (existingTask) {
			if (existingTask.status !== 'failed') {
				return id;
			}
			await this.db.updateTask({
				id,
				sender,
				dubheChainAddress,
				amount,
				checkpoint,
				timestamp: Date.now(),
				status: 'pending',
			});
			return id;
		}

		const task: BridgeTask = {
			id,
			sender,
			dubheChainAddress,
			amount,
			checkpoint,
			timestamp: Date.now(),
			status: 'pending',
		};
		await this.db.addTask(task);
		return id;
	}

	public async getTaskStatus(id: string): Promise<BridgeTask | null> {
		return await this.db.getTask(id);
	}

	public async getTaskList(): Promise<BridgeTask[]> {
		return await this.db.getAllTasks();
	}

	private async startProcessing() {
		setInterval(async () => {
			if (this.processing) return;

			try {
				this.processing = true;
				const pendingTasks = await this.db.getPendingTasks();

				if (pendingTasks.length > 0) {
					for (const task of pendingTasks) {
						await this.db.updateTaskStatus(task.id, 'processing');
						this.eventEmitter.emit('taskStatusChanged', task);
					}

					try {
						const result = await this.executeBridgeTransfer(
							pendingTasks
						);
						for (const task of pendingTasks) {
							if (result.error) {
								await this.db.updateTaskStatus(
									task.id,
									'failed',
									null,
									result.error
								);
							} else {
								await this.db.updateTaskStatus(
									task.id,
									'completed',
									{
										transactionHash: result.transactionHash,
									}
								);
							}
							this.eventEmitter.emit(
								'taskStatusChanged',
								await this.db.getTask(task.id)
							);
						}
					} catch (error) {
						for (const task of pendingTasks) {
							const errorMessage =
								error instanceof Error
									? error.message
									: String(error);
							await this.db.updateTaskStatus(
								task.id,
								'failed',
								null,
								errorMessage
							);
							this.eventEmitter.emit(
								'taskStatusChanged',
								await this.db.getTask(task.id)
							);
						}
					}
				}
			} finally {
				this.processing = false;
			}
		}, 12000);
	}

	private async executeBridgeTransfer(
		tasks: BridgeTask[]
	): Promise<BatchExecuteResult> {
		if (!this.api) {
			await this.initializeApi();
		}

		const batchRecipients: { address: string; amount: number }[] = [];

		for (let i = 0; i < tasks.length; i += 1) {
			batchRecipients.push({
				address: tasks[i].dubheChainAddress,
				amount: Number(tasks[i].amount),
			});
		}

		console.log('batchRecipients', batchRecipients);

		try {
			const batchHash = await batchSend(this.api, batchRecipients);
			return { transactionHash: batchHash };
		} catch (err) {
			return { error: String(err) };
		}
	}

	public onTaskStatusChanged(callback: (task: BridgeTask) => void) {
		this.eventEmitter.on('taskStatusChanged', callback);
	}
}
