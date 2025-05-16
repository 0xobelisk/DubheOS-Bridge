import { Pool } from 'pg';
import { BridgeTask } from '../queue/BridgeQueue';

export class DatabaseService {
	private static instance: DatabaseService;
	private pool: Pool;

	private constructor() {
		this.pool = new Pool({
			connectionString: process.env.DATABASE_URL,
		});
	}

	public static getInstance(): DatabaseService {
		if (!DatabaseService.instance) {
			DatabaseService.instance = new DatabaseService();
		}
		return DatabaseService.instance;
	}

	async addTask(task: BridgeTask): Promise<void> {
		const query = `
      INSERT INTO bridge_tasks (id, sender, from_address, to_address, amount, timestamp, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
		await this.pool.query(query, [
			task.id,
			task.sender,
			task.fromAddress,
			task.toAddress,
			task.amount,
			task.timestamp,
			task.status,
		]);
	}

	async updateTaskStatus(
		id: string,
		status: string,
		result?: any,
		error?: string
	): Promise<void> {
		const query = `
      UPDATE bridge_tasks
      SET status = $2, result = $3, error = $4
      WHERE id = $1
    `;
		await this.pool.query(query, [id, status, result, error]);
	}

	async getTask(id: string): Promise<BridgeTask | null> {
		const query = `
      SELECT * FROM bridge_tasks WHERE id = $1
    `;
		const { rows } = await this.pool.query(query, [id]);
		return rows[0] ? this.mapToBridgeTask(rows[0]) : null;
	}

	async getPendingTasks(): Promise<BridgeTask[]> {
		const query = `
      SELECT * FROM bridge_tasks
      WHERE status = 'pending'
      ORDER BY timestamp ASC
    `;
		const { rows } = await this.pool.query(query);
		return rows.map(this.mapToBridgeTask);
	}

	async getAllTasks(
		limit: number = 100,
		offset: number = 0
	): Promise<BridgeTask[]> {
		const query = `
      SELECT * FROM bridge_tasks
      ORDER BY timestamp DESC
      LIMIT $1 OFFSET $2
    `;
		const { rows } = await this.pool.query(query, [limit, offset]);
		return rows.map(this.mapToBridgeTask);
	}

	async updateTask(task: BridgeTask): Promise<void> {
		const query = `
			UPDATE bridge_tasks
			SET sender = $2,
				from_address = $3,
				to_address = $4,
				amount = $5,
				timestamp = $6,
				status = $7,
				result = null,
				error = null
			WHERE id = $1
		`;
		await this.pool.query(query, [
			task.id,
			task.sender,
			task.fromAddress,
			task.toAddress,
			task.amount,
			task.timestamp,
			task.status,
		]);
	}

	private mapToBridgeTask(row: any): BridgeTask {
		return {
			id: row.id,
			sender: row.sender,
			fromAddress: row.from_address,
			toAddress: row.to_address,
			amount: row.amount,
			timestamp: row.timestamp,
			status: row.status,
			result: row.result,
			error: row.error,
		};
	}
}
