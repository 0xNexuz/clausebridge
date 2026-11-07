import Collage from '../art/Collage';
import { ConfirmIcon, ReportIcon, TrackIcon, UploadIcon } from '../art/PaperIcons';
import Pixel from '../art/Pixel';
import { READER } from '../art/pixel-maps';
import VintageBox, { PENS } from '../art/VintageBox';

const STEPS = [
  { title: 'Upload the contract', text: 'PDF, Word or text. It opens in Univer Docs with every clause numbered, exactly as written.', Icon: UploadIcon, tone: 'tan' },
  { title: 'Confirm what it promises', text: 'Ling 3.2 Flash suggests deadlines, deliverables, parties and payments, each with the sentence it came from. Nothing is tracked until you confirm it.', Icon: ConfirmIcon, tone: 'sky' },
  { title: 'Track owners, evidence and money', text: 'Every obligation gets an owner, a status and proof. Payments live in a Univer Sheets schedule whose totals are checked to the cent.', Icon: TrackIcon, tone: 'sage' },
  { title: 'Report with clause references', text: 'Progress reports open in Univer Docs. Each figure and date links back to its clause and is checked again before anyone approves it.', Icon: ReportIcon, tone: 'sand' },
];

const KIND_TEXT: Record<string, string> = {
  Deliverable: 'Something to produce or hand over, like design mockups by 11 December.',
  Payment: 'Money one party owes, with the amount read straight from the clause.',
  Deadline: 'A dated action that isn’t a delivery or payment, like giving notice.',
  Responsibility: 'An ongoing duty with no single date, like keeping insurance in force.',
};

export default function Landing() {
  return (
    <div className="landing">
      <header className="top">
        <a className="wordmark" href="/">ClauseBridge</a>
        <nav aria-label="Site">
          <a href="#how">How it works</a>
          <a href="#markers">The four markers</a>
          <a href="#univer">Univer</a>
          <a href="https://github.com/0xNexuz/clausebridge">GitHub</a>
          <a className="pill" href="/app">Open the app</a>
        </nav>
      </header>

      <section className="hero">
        <Collage />
        <div className="hero-card torn">
          <h1>Every promise, tracked to the clause.</h1>
          <p>Turn contracts into confirmed deadlines, deliverables and payment schedules. The AI suggests, your team decides, and every item keeps the exact words it came from.</p>
          <a className="ask" href="/app">
            <span aria-hidden className="spark">✦</span>
            <span>Try it with a sample contract</span>
            <span className="go" aria-hidden>→</span>
          </a>
          <p className="fine">Supports contract administration. Not legal advice.</p>
        </div>
      </section>

      <section className="how" id="how">
        <h2 className="section-title">From signed PDF to a plan your team can run</h2>
        <ol className="steps">
          {STEPS.map(({ title, text, Icon, tone }, index) => (
            <li key={title} className={`step torn tone-${tone}`} style={{ '--tilt': `${index % 2 ? 0.6 : -0.5}deg` } as React.CSSProperties}>
              <span className="tape" aria-hidden />
              <Icon />
              <div>
                <span className="step-n">{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="markers" id="markers">
        <div className="box-wrap"><VintageBox id="section-box" className="big-box" /></div>
        <div>
          <h2 className="section-title">Four markers for four kinds of promise</h2>
          <p className="lede">Every term ClauseBridge suggests is one of four kinds. The same colours run through the contract view, the register and the reports, so a glance tells you what you’re looking at.</p>
          <ul className="pens">
            {PENS.map(pen => (
              <li key={pen.label}><span className="swatch" style={{ background: pen.color }} /><b>{pen.label}</b><span>{KIND_TEXT[pen.label]}</span></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="univer" id="univer">
        <div className="univer-copy torn">
          <span className="tape" aria-hidden />
          <h2 className="section-title">Built on Univer, checked by ClauseBridge</h2>
          <ul>
            <li><b>Univer Docs</b> shows the contract read-only, so every clause reference stays exact. Click any suggestion and its sentence is selected in the document.</li>
            <li><b>Univer Sheets tables</b> hold the register of confirmed obligations, with filters for status, owner and due date.</li>
            <li><b>Univer formulas</b> total the payment schedule. ClauseBridge recomputes scheduled, paid, outstanding and overdue amounts in whole cents and shows whether they match.</li>
            <li><b>Ling 3.2 Flash</b> suggests terms and drafts report wording. Dates and amounts are read from the contract by ClauseBridge’s own parsers, never taken from the model.</li>
          </ul>
        </div>
        <div className="reader-stage" aria-hidden>
          <Pixel art={READER} scale={9} className="reader-big" />
          <span className="reader-ledge" />
        </div>
      </section>

      <footer className="kraft">
        <nav aria-label="Footer">
          <a href="/app">App</a><span>•</span><a href="#how">How it works</a><span>•</span><a href="#univer">Univer</a><span>•</span><a href="https://github.com/0xNexuz/clausebridge">GitHub</a>
        </nav>
        <a className="stamp" href="/">ClauseBridge</a>
        <p>Built by 0xNexuz with Univer and Ling 3.2 Flash. Sample contracts are fictional. ClauseBridge supports contract administration and does not give legal advice.</p>
      </footer>
    </div>
  );
}
