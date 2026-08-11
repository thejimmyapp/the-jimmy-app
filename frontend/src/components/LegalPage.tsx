import { LegalLinks } from "./LegalLinks";

const CONTACT_EMAIL = "hello@thejimmyapp.com";

export function LegalPage({ page }: { page: "privacy" | "terms" | "notices" }) {
  return (
    <main className="legal-shell">
      <header className="legal-header">
        <a className="brand legal-brand" href="/"><span className="brand-mark">J</span><span><strong>THE JIMMY APP</strong><small>POST-GAME BUGHOUSE REVIEW</small></span></a>
        <LegalLinks />
      </header>
      {page === "privacy" ? <PrivacyPolicy /> : page === "terms" ? <TermsOfService /> : <ThirdPartyNotices />}
    </main>
  );
}

function ThirdPartyNotices() {
  return (
    <article className="legal-document">
      <h1>Third-Party Notices</h1>
      <p>This page provides factual attribution for third-party projects referenced or used by The Jimmy App. It does not reproduce license text.</p>

      <h2>Fairy-Stockfish</h2>
      <p><a href="https://github.com/fairy-stockfish/Fairy-Stockfish">Fairy-Stockfish</a> is licensed under <strong>GPL-3.0-or-later</strong>. It runs server-side and is not conveyed to users as a binary or bundled in an artifact produced by this repository.</p>

      <h2>Stockfish</h2>
      <p><a href="https://github.com/official-stockfish/Stockfish">Stockfish</a> is licensed under <strong>GPL-3.0-or-later</strong>. Fairy-Stockfish derives from the Stockfish engine lineage.</p>

      <h2>lichess / lila</h2>
      <p><a href="https://github.com/lichess-org/lila">lila</a> is licensed under <strong>AGPL-3.0</strong>. It was used only as a pattern reference; no lila code was copied, and this service does not run lila.</p>

      <h2>Chess.com acknowledgment</h2>
      <p><a href="https://www.chess.com/">Chess.com</a> trademarks, game records, and assets belong to Chess.com and their respective rights holders. The Jimmy App is unaffiliated with Chess.com and copies no Chess.com assets. This is an acknowledgment, not a software-license entry.</p>

      <h2>Direct software dependencies</h2>
      <p>The complete attribution list for production frontend dependencies and direct backend requirements is maintained in <a href="https://github.com/thejimmyapp/the-jimmy-app/blob/main/THIRD-PARTY-NOTICES.md">THIRD-PARTY-NOTICES.md</a>.</p>
    </article>
  );
}

function PrivacyPolicy() {
  return (
    <article className="legal-document">
      <p className="legal-eyebrow">Effective August 6, 2026</p>
      <h1>Privacy Policy</h1>
      <p>The Jimmy App is a collaborative, post-game Bughouse review and educational application. This policy describes the current public application. It does not describe a future Chess.com OAuth integration that has not yet been implemented.</p>

      <h2>Information we process</h2>
      <ul>
        <li><strong>Chess.com username and public profile data.</strong> When you enter a username, our server requests that player’s public profile and completed public game archives from Chess.com.</li>
        <li><strong>Completed game records.</strong> We may store game IDs, source URLs, player usernames and ratings, results, timestamps, PGN or paired PGN, move streams, and the public JSON returned with a completed game.</li>
        <li><strong>Manual imports.</strong> If you paste paired PGNs, we store those completed game records and the username you associate with them.</li>
        <li><strong>Review and collaboration data.</strong> Review-room identifiers, display names, chat messages, and shared notes are stored when those features are used. Board annotations and transient room presence may be held in server memory.</li>
        <li><strong>Derived analysis.</strong> Fairy-Stockfish results and replay-derived positions may be cached or stored to provide post-game analysis, puzzles, and coaching features.</li>
        <li><strong>Browser storage.</strong> The site stores the selected username, board-display preferences, versioned onboarding progress, analysis acknowledgement, map position, and compact saved learning-moment references in your browser’s local storage. Saved moments contain a game and mistake reference, move location, evidence summary, and saved date—not full PGNs, raw game payloads, cookies, or credentials. The application does not use browser storage as a Chess.com login.</li>
        <li><strong>Service logs.</strong> Our hosting provider and web server may process IP addresses and basic request metadata in operational and security logs. The application does not intentionally write IP addresses into its game or collaboration database.</li>
      </ul>

      <h2>Information we do not request</h2>
      <p>The public application does not request or accept Chess.com passwords, cookies, CSRF tokens, copied cURL requests, or reusable Chess.com session credentials. It does not submit chess moves to Chess.com or request active-game data.</p>

      <h2>How information is used</h2>
      <p>We use this information to retrieve a requested player’s completed public games, reconstruct synchronized Bughouse boards, provide post-game review and engine-assisted education, support shared review rooms, troubleshoot the service, and protect its reliability. Chess.com game records are not used to train a machine-learning model.</p>

      <h2>Storage, retention, and deletion</h2>
      <p>Game records and collaboration content are stored in application databases operated with our hosting infrastructure. Browser preferences, guest progress, and saved learning moments remain in your browser until you use the map’s “Clear guest progress” action or clear the site’s browser storage. That local reset does not delete imported games or shared rooms. The service does not currently offer user accounts or an automated deletion dashboard, and it does not currently apply a guaranteed automatic deletion period. Records are retained until they are deleted in response to a verified request, removed during service maintenance, or no longer needed to operate the prototype.</p>
      <p>To request deletion, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and identify the Chess.com username, manual import, or review room involved. We may ask for enough information to locate the record and avoid deleting another person’s data.</p>

      <h2>Service providers and external services</h2>
      <p>The application is hosted on Railway, which may process infrastructure logs and application data on our behalf. When a username is submitted, our server sends it to Chess.com’s public API. Fairy-Stockfish analysis runs within our application environment. External services have their own terms and privacy practices.</p>

      <h2>Sharing and public sources</h2>
      <p>Chess.com usernames and completed game activity retrieved by the application come from public Chess.com sources. Content added to a shared review room is available to people who possess that room link. We do not sell personal information.</p>

      <h2>Security and changes</h2>
      <p>We use reasonable technical and operational safeguards appropriate to an experimental service, but no online system can guarantee absolute security. We may update this policy as the product changes; the effective date above will be updated when material changes are published.</p>

      <h2>Contact</h2>
      <p>Privacy and data questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </article>
  );
}

function TermsOfService() {
  return (
    <article className="legal-document">
      <p className="legal-eyebrow">Effective July 27, 2026</p>
      <h1>Terms of Service</h1>
      <p>These terms govern use of The Jimmy App. By using the service, you agree to use it only for lawful post-game review, education, and collaboration.</p>

      <h2>Post-game educational use</h2>
      <p>The Jimmy App is designed for completed games. Public Chess.com imports are limited to completed archive records, manual PGN imports must contain a terminal result, and engine analysis is tied to positions reconstructed from a stored completed game. The service does not submit moves to Chess.com and is not a connected-board application.</p>

      <h2>No live assistance or cheating</h2>
      <p>You may not use the service to obtain assistance during an active game, evade fair-play controls, automate play, or otherwise violate the rules of Chess.com, a tournament organizer, or another chess platform. You may not mislabel an active game as completed to obtain analysis.</p>

      <h2>Third-party platforms</h2>
      <p>You are responsible for complying with third-party terms and for having the right to provide any data you manually import. The Jimmy App is independent and is not affiliated with, sponsored by, or endorsed by Chess.com. Chess.com names, game records, links, and trademarks remain subject to the rights and policies of their respective owners.</p>

      <h2>Acceptable use</h2>
      <p>You may not probe or disrupt the service, overwhelm it with automated requests, upload malicious or unlawful material, impersonate another person, expose another person’s credentials, or use shared rooms to harass others or violate their privacy. Do not submit passwords, cookies, tokens, copied authenticated requests, or other reusable credentials.</p>

      <h2>Your content and application materials</h2>
      <p>You retain any rights you hold in notes, chat messages, and manually supplied material. You give us permission to host and process that material only as needed to provide and maintain the service. The application, interface, and original materials are owned by their respective authors and licensors. No ownership of third-party game records or trademarks is transferred by these terms.</p>

      <h2>Experimental availability</h2>
      <p>The service is an evolving prototype and is provided on an “as available” basis. Features, stored data, and third-party integrations may be changed, interrupted, or discontinued. Analysis can be incomplete or inaccurate and should be independently reviewed.</p>

      <h2>Removal and termination</h2>
      <p>We may restrict use, remove unlawful or unsafe content, close review rooms, or discontinue the service when reasonably necessary. Because the current service has no user accounts, there is no account-termination workflow. Data-deletion requests are handled as described in the Privacy Policy.</p>

      <h2>Disclaimer and limitation of liability</h2>
      <p>To the extent permitted by law, the service is provided without warranties, and The Jimmy App’s operators will not be liable for indirect, incidental, special, consequential, or lost-profit damages arising from its use. Nothing in these terms excludes liability that cannot legally be excluded.</p>

      <h2>Changes and contact</h2>
      <p>We may update these terms as the service changes. Continued use after updated terms are published constitutes acceptance of the revised terms. Questions may be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </article>
  );
}
