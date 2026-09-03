import './App.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/bricolage-grotesque/700.css'

function App() {
  return (
    <main className="app-shell">
      <section className="hero">

        <div className="brand-wrap">
          <img
            src="/brand/the-pot-logo.png"
            alt="THE POT"
            className="brand-logo"
          />

          <p className="eyebrow">GOLF SIDE GAMES</p>

          <h1>
            Play for pride.
            <br />
            Settle the pot.
          </h1>

          <p className="intro">
            Wolf, Skins and 3-Putt Poker in one live round.
          </p>

          <div className="actions">
            <button className="primary-button">
              Create Round
            </button>

            <button className="secondary-button">
              Join Round
            </button>
          </div>
        </div>

        <div className="game-strip">

          <div className="game-card">
            <img
              src="/brand/icon-wolf.png"
              alt="Wolf"
            />
            <div>
              <span>Wolf</span>
              <small>Pick your partner. Or don't.</small>
            </div>
          </div>

          <div className="game-card">
            <img
              src="/brand/icon-skins.png"
              alt="Skins"
            />
            <div>
              <span>Skins</span>
              <small>Every hole has a price.</small>
            </div>
          </div>

          <div className="game-card">
            <img
              src="/brand/icon-3-putt-poker.png"
              alt="3-Putt Poker"
            />
            <div>
              <span>3-Putt Poker</span>
              <small>Good golf earns cards.</small>
            </div>
          </div>

        </div>

      </section>
    </main>
  )
}

export default App