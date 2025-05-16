CREATE TABLE bridge_tasks (
    id VARCHAR(255) PRIMARY KEY,
    sender VARCHAR(255) NOT NULL,
    dubhe_chain_address VARCHAR(255) NOT NULL,
    amount VARCHAR(255) NOT NULL,
    checkpoint VARCHAR(255) NOT NULL,
    timestamp BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL,
    result JSONB,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_bridge_tasks_status ON bridge_tasks(status);
CREATE INDEX idx_bridge_tasks_sender ON bridge_tasks(sender);
CREATE INDEX idx_bridge_tasks_dubhe_chain_address ON bridge_tasks(dubhe_chain_address);
CREATE INDEX idx_bridge_tasks_checkpoint ON bridge_tasks(checkpoint);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_bridge_tasks_updated_at
    BEFORE UPDATE ON bridge_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 