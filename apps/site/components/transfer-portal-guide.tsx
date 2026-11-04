export function TransferPortalGuide() {
  return (
    <>
      <section className="apex-container db-section" id="portal-guide" aria-labelledby="portal-guide-title">
        <div className="db-section-heading">
          <div>
            <span className="db-eyebrow">CFB transfers, explained</span>
            <h2 id="portal-guide-title" className="font-display">
              What is the college football transfer portal?
            </h2>
          </div>
          <p>The process behind a player’s move from one college program to another.</p>
        </div>
        <p>
          The college football transfer portal is the roster-movement process behind a player changing programs.
          On CFB Apex, each transfer row records the player, position, origin, destination, status, event date and
          source confidence. The board covers verified FBS-to-FBS movement in the current 2026-cycle dataset rather
          than rumors or inferred destinations.
        </p>
      </section>

      <section className="apex-container db-section db-section--table" aria-labelledby="portal-window-title">
        <div className="db-section-heading">
          <div>
            <span className="db-eyebrow">Current dataset cycle</span>
            <h2 id="portal-window-title" className="font-display">
              2026 transfer portal window dates
            </h2>
          </div>
          <p>Dates stated by the existing 2026-cycle transfer compilation.</p>
        </div>
        <section className="db-table-wrap" tabIndex={0} aria-label="2026 transfer portal cycle dates">
          <table className="db-table">
            <caption>
              Cycle and timing facts from the CFB Apex transfer dataset, compiled September 7, 2026.
            </caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Date or scope</th>
                <th scope="col">What it means on this board</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Current dataset cycle</th>
                <td>2026 cycle</td>
                <td>The current ledger is the site’s 2026-cycle FBS-to-FBS compilation.</td>
              </tr>
              <tr>
                <th scope="row">Winter entry window</th>
                <td><time dateTime="2026-01-02">January 2</time>–<time dateTime="2026-01-16">January 16, 2026</time></td>
                <td>The winter window identified in the dataset’s recorded scope.</td>
              </tr>
              <tr>
                <th scope="row">Championship extra window</th>
                <td>Not separately dated in the dataset</td>
                <td>The compilation notes this additional window without supplying dates, so none are inferred.</td>
              </tr>
              <tr>
                <th scope="row">Season context</th>
                <td><time dateTime="2026-09-05">September 5, 2026</time></td>
                <td>The dataset identifies this as the start of Week 1 of the 2026 season.</td>
              </tr>
              <tr>
                <th scope="row">Dataset compiled</th>
                <td><time dateTime="2026-09-07">September 7, 2026</time></td>
                <td>The compilation date attached to the current transfer records.</td>
              </tr>
            </tbody>
          </table>
        </section>
        <p>
          These are the dates for the current CFB Apex dataset, not a claim about a future cycle. The repository does
          not supply 2027 portal-window dates, so this page does not guess or extrapolate them.
        </p>
      </section>

      <section className="apex-container db-section" aria-labelledby="portal-inclusion-title">
        <div className="db-section-heading">
          <div>
            <span className="db-eyebrow">Who appears in the ledger</span>
            <h2 id="portal-inclusion-title" className="font-display">
              Which CFB transfers are included?
            </h2>
          </div>
          <p>A verified working subset, with explicit inclusion and exclusion rules.</p>
        </div>
        <ul>
          <li>Players who entered during the recorded 2025–26 winter window and announced or completed an FBS destination.</li>
          <li>Publicly reported graduate and summer or fall 2026 FBS-to-FBS completions included in the compilation.</li>
          <li>Player, position, origin, destination, status, event date and confidence fields retained for review.</li>
        </ul>
        <p>
          FCS, Division II, Division III, NAIA, junior-college and high-school origins are outside this dataset’s scope.
          Available or unsigned portal players are omitted unless a destination was announced. A blank or open destination
          is never filled by inference.
        </p>
      </section>

      <section className="apex-container db-section" aria-labelledby="portal-board-guide-title">
        <div className="db-section-heading">
          <div>
            <span className="db-eyebrow">Use the board</span>
            <h2 id="portal-board-guide-title" className="font-display">
              How to read CFB Apex transfer records
            </h2>
          </div>
          <p>Filter first, then inspect the movement and its source context.</p>
        </div>
        <ol>
          <li><strong>Filter by position or status.</strong> The result count shows how many verified records remain.</li>
          <li><strong>Read origin and destination together.</strong> Team names link to program pages; an open destination stays open.</li>
          <li><strong>Check status and event date.</strong> They describe the recorded move at that point in the compilation, not a new update today.</li>
          <li><strong>Review confidence and notes.</strong> Expand a note where present for the source context attached to the row.</li>
        </ol>
        <p><a href="#portal-table-title">Go to the complete player-movement ledger</a></p>
      </section>

      <section className="apex-container db-section" aria-labelledby="portal-limits-title">
        <div className="db-section-heading">
          <div>
            <span className="db-eyebrow">Coverage limits</span>
            <h2 id="portal-limits-title" className="font-display">
              What this transfer board does not claim
            </h2>
          </div>
          <p>Known boundaries are part of the record.</p>
        </div>
        <p>
          The ledger is not a full census of every college football transfer. It is a verified working subset emphasizing
          Power 4 incoming classes plus selected Group of 5 and late-cycle additions. It does not infer destinations,
          include NIL speculation, or describe its September 7 compilation as live present-day movement.
        </p>
      </section>

      <section className="apex-container db-section" aria-labelledby="portal-faq-title">
        <div className="db-section-heading">
          <div>
            <span className="db-eyebrow">Quick answers</span>
            <h2 id="portal-faq-title" className="font-display">
              Transfer portal FAQ
            </h2>
          </div>
        </div>
        <details>
          <summary><strong>What does “CFB transfers” mean on this page?</strong></summary>
          <p>Verified FBS-to-FBS player movement included in the current CFB Apex 2026-cycle compilation.</p>
        </details>
        <details>
          <summary><strong>What were the current dataset’s winter portal dates?</strong></summary>
          <p>January 2–16, 2026. The dataset also notes a championship extra window without giving separate dates.</p>
        </details>
        <details>
          <summary><strong>Does the board list every player in the portal?</strong></summary>
          <p>No. It is a verified working subset, and available or unsigned players are omitted unless a destination was announced.</p>
        </details>
        <details>
          <summary><strong>Are 2027 transfer portal dates published here?</strong></summary>
          <p>No. The current repository supplies 2026-cycle dates only, so no 2027 dates are asserted.</p>
        </details>
      </section>
    </>
  );
}
