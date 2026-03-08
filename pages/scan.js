import Head from 'next/head';
import Script from 'next/script';
import Link from 'next/link';

export default function Scan() {
  return (
    <>
      <Head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>PokéScan — Camera Pokémon Scanner</title>
      </Head>

      <div className="app">
        <header>
          <nav className="top-nav">
            <Link href="/" className="nav-link">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              PokéVoice
            </Link>
            <span className="nav-divider">/</span>
            <span className="nav-current">PokéScan</span>
          </nav>
          <h1>PokéScan</h1>
          <p className="subtitle">Point your camera at a Pokémon to identify it</p>
        </header>

        <main>
          {/* Camera Section */}
          <section className="camera-section">
            <div className="camera-wrapper">
              <video id="camera" autoPlay playsInline muted></video>
              <canvas id="snap-canvas" className="snap-canvas"></canvas>
              <div id="camera-placeholder" className="camera-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <p>Camera will appear here</p>
              </div>
              <div id="scanning-indicator" className="scanning-indicator hidden">
                <div className="scan-line"></div>
              </div>
            </div>

            {/* Controls */}
            <div className="controls">
              <button id="start-btn" className="btn-primary btn-large">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Start Camera
              </button>
              <button id="snap-btn" className="btn-accent btn-large hidden">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="4" />
                </svg>
                Scan Now
              </button>
              <button id="stop-btn" className="btn-secondary btn-large hidden">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                Stop
              </button>
            </div>

            {/* Prediction Bar */}
            <div id="prediction-bar" className="prediction-bar hidden">
              <div className="prediction-label">
                <span id="pred-name">—</span>
                <span id="pred-confidence"></span>
              </div>
              <div className="prediction-meter">
                <div id="pred-fill" className="prediction-fill"></div>
              </div>
            </div>
            <p id="scan-status" className="scan-status">Ready! Start the camera to scan Pokémon.</p>
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

      <Script src="/scanner.js" strategy="afterInteractive" />
    </>
  );
}
