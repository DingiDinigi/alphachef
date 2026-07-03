const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  const PLATFORM_WALLET = process.env.PLATFORM_WALLET || deployer.address;
  // Arc testnet USDC address (use a mock or the real one)
  const USDC_ADDRESS = process.env.USDC_ADDRESS || '0x0000000000000000000000000000000000000001';

  const AlphaChef = await hre.ethers.getContractFactory('AlphaChef');
  const contract = await AlphaChef.deploy(PLATFORM_WALLET, USDC_ADDRESS);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('AlphaChef deployed to:', address);
  console.log('Add to .env: CONTRACT_ADDRESS=' + address);
}

main().catch((e) => { console.error(e); process.exit(1); });
