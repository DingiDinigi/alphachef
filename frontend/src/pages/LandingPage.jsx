import Nav from '../components/Nav';
import Hero from '../components/Hero';
import HowItWorks from '../components/HowItWorks';
import GettingStarted from '../components/GettingStarted';
import LiveFeed from '../components/LiveFeed';
import AgentSection from '../components/AgentSection';
import Roadmap from '../components/Roadmap';
import Stats from '../components/Stats';
import FAQ from '../components/FAQ';
import Footer from '../components/Footer';

export default function LandingPage({ wallet, signals, stats, onWalletOpen, onDisconnect, onUnlock, onOpen }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      <Nav onWalletOpen={onWalletOpen} onDisconnect={onDisconnect} wallet={wallet} />
      <Hero
        onBrowse={() => document.getElementById('signal-preview')?.scrollIntoView({ behavior: 'smooth' })}
        stats={stats}
      />
      <HowItWorks />
      <GettingStarted onConnect={onWalletOpen} />
      <LiveFeed
        signals={signals.slice(0, 3)}
        onUnlock={onUnlock}
        onOpen={onOpen}
        wallet={wallet}
        id="signal-preview"
        preview
      />
      <AgentSection logs={stats.agent_logs} />
      <Roadmap />
      <Stats stats={stats} />
      <FAQ />
      <Footer />
    </div>
  );
}
