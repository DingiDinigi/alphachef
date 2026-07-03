require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config({ path: '../.env' });

module.exports = {
  solidity: '0.8.24',
  networks: {
    arc: {
      url: process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.fun',
      chainId: 5042002,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
