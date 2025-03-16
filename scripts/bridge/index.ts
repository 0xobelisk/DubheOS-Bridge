import { ApiPromise, WsProvider } from '@polkadot/api';
import { Keyring } from '@polkadot/keyring';
import { Dubhe } from "@0xobelisk/sui-client";
import { NETWORK, PACKAGE_ID } from "./config";
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { isHex } from '@polkadot/util';

const initDubheClient = () => {
    const dubhe = new Dubhe({
      networkType: NETWORK,
      packageId: PACKAGE_ID,
      indexerUrl: "http://127.0.0.1:3001", // Custom HTTP endpoint
      indexerWsUrl: "ws://127.0.0.1:3001", // Custom WebSocket endpoint
    });
    return dubhe;
  };

// 添加 Dubhe转账处理函数
async function handleDubheTransfer(targetAddress: string, amount: number) {
    try {
        // 创建 Keyring 实例，使用默认的 sr25519
        const keyring = new Keyring({ type: 'sr25519' });

        // 使用 Alice 测试账户
        const alice = keyring.addFromUri('//Alice');

        // 连接到 Dubhe 节点
        const wsProvider = new WsProvider('ws://localhost:9944');
        const api = await ApiPromise.create({ 
            provider: wsProvider,
            noInitWarn: true 
        });

        // 创建并发送交易
        const transfer = api.tx.balances.transferKeepAlive(
            targetAddress,
            amount
        );

        // 签名并发送交易
        const hash = await transfer.signAndSend(alice, ({ status, events }) => {
            if (status.isInBlock) {
                console.log('Transfer included in block:', status.asInBlock.toHex());
                
                events.forEach(({ event }) => {
                    if (event.section === 'balances') {
                        console.log('Transfer event:', event.method);
                        console.log('Event data:', event.data.toString());
                    }
                });
            } else if (status.isFinalized) {
                console.log('Transfer finalized in block:', status.asFinalized.toHex());
                // 可选：关闭连接
                api.disconnect();
            }
        });

        console.log('Transfer initiated with hash:', hash.toString());
    } catch (error) {
        console.error('Failed to process Polkadot transfer:', error);
    }
}

// 添加地址校验函数
function isValidDubheAddress(address: string): boolean {
    try {
        // 检查地址格式
        if (isHex(address)) {
            // 如果是十六进制格式，先转换为 ss58 格式
            address = encodeAddress(address);
        }
        
        // 尝试解码地址，如果成功则地址有效
        const decoded = decodeAddress(address);
        
        // 确保地址长度正确（32字节的公钥）
        return decoded.length === 32;
    } catch (error) {
        console.error('Invalid address format:', error);
        return false;
    }
}

const subscribeToEvents = async (dubhe: Dubhe) => {
    try {
      await dubhe.subscribe(['asset_moved_event'], async data => {
        console.log('Received real-time data:', data);
        const dubhe_chain_address = data.value.chain_address
        const dubhe_coin_amount = data.value.amount
        console.log(`dubhe_chain_address: ${dubhe_chain_address}`)
        console.log(`dubhe_coin_amount: ${dubhe_coin_amount}`)

        // 验证地址格式
        if (!isValidDubheAddress(dubhe_chain_address)) {
            console.error('Invalid Polkadot address format:', dubhe_chain_address);
            return;
        }

        // 验证金额
        if (isNaN(Number(dubhe_coin_amount)) || Number(dubhe_coin_amount) <= 0) {
            console.error('Invalid amount:', dubhe_coin_amount);
            return;
        }

        // 地址和金额验证通过后，调用 Polkadot 转账处理
        await handleDubheTransfer(dubhe_chain_address, Number(dubhe_coin_amount));
      });
    } catch (error) {
      console.error('Failed to subscribe to events:', error);
    }
};

const bridge_process = async () => {
    const dubhe = initDubheClient();
    subscribeToEvents(dubhe);
}

bridge_process();