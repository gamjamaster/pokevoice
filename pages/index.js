import Head from 'next/head';
import Script from 'next/script';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>PokéVoice</title>
      </Head>

      <div className="app">
        <header>
          <h1>PokéVoice</h1>
          <p className="subtitle">Say a Pokémon name to get its info</p>
          <Link href="/scan" className="scan-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            PokéScan — Camera Mode
          </Link>
        </header>

        <main>
          {/* Language Toggle */}
          <div className="lang-toggle">
            <button className="lang-btn active" data-lang="en">EN</button>
            <button className="lang-btn" data-lang="ko">한국어</button>
          </div>

          {/* Voice Input Section */}
          <section className="voice-section">
            <button id="mic-btn" className="mic-btn" title="Click to speak">
              <svg id="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </button>
            <p id="status-text" className="status-text">Click the mic and say a Pokémon name</p>
            <div className="manual-input">
              <input type="text" id="pokemon-input" placeholder="Or type a Pokémon name..." />
              <button id="search-btn">Search</button>
            </div>
            <p id="ko-hint" className="ko-hint hidden">한국어 포켓몬 이름을 말하거나 입력하세요</p>
            <div id="suggestions" className="suggestions hidden"></div>
          </section>

          {/* Result Section */}
          <section id="result" className="result hidden">
            <div className="card">
              <div className="card-header">
                <div className="pokemon-types" id="types"></div>
                <img id="pokemon-sprite" alt="" />
                <h2 id="pokemon-name"></h2>
                <span id="pokemon-id" className="pokemon-id"></span>
              </div>
              <div className="card-body">
                <div className="matchup-section">
                  <div className="matchup-group" id="matchup-weak"></div>
                  <div className="matchup-group" id="matchup-resist"></div>
                  <div className="matchup-group" id="matchup-immune"></div>
                </div>
              </div>
            </div>
          </section>

          {/* Error Section */}
          <section id="error-msg" className="error-msg hidden">
            <p id="error-text"></p>
          </section>
        </main>
      </div>

      <Script src="/voice.js" strategy="afterInteractive" />
    </>
  );
}
