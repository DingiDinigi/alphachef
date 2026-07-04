import React from 'react';
import ReactDOM from 'react-dom/client';
import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { defineChain } from 'viem';
import App from './App';
import './index.css';

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc-node.thecanteenapp.com/v1/swrm_578bf7fde9925d48337b288bdc6075a1d7345bb327b9b66dea1fec84915a3219'],
    },
  },
  testnet: true,
});

const wagmiConfig = getDefaultConfig({
  appName: 'AlphaChef',
  // Register a free project ID at https://cloud.walletconnect.com
  projectId: 'c4f79cc821944d9680842e34466bfb',
  chains: [arcTestnet],
  ssr: false,
});

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#c9a227',
            accentColorForeground: '#0a0a08',
            borderRadius: 'medium',
          })}
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
