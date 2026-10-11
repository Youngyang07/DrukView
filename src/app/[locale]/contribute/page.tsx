import { issueUrl, REPO } from '@/lib/modules';
export const metadata = { title: 'Contribute' };
export default function Contribute() {
  const repo = `https://github.com/${REPO}`;
  return (<div className="wrap page prose"><h1 className="pagetitle">Contribute</h1>
    <p>DrukView is open source under the MIT licence, and open to anyone. The most valuable contribution is a <b>correct, cited number</b>. Government budget documents are published as PDFs; turning them into rows lets everyone see where the money goes.</p>
    <p>The full rules — what we accept, what we reject, and why — are in <a href={`${repo}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noopener noreferrer">CONTRIBUTING.md</a>. In short:</p>
    <ol>
      <li><b>Never invent a number.</b> If it is not in a public document, it does not ship; where data is missing, the site says so.</li>
      <li><b>Cite every row</b> — publisher, document, an https link, and the table or page for a PDF.</li>
      <li><b>Never mix currencies.</b> Nu. and US$ are never added or converted.</li>
      <li><b>Never guess an identity or a place.</b> A name comes only from the body that appointed the person; a dzongkhag from the source&apos;s own fields, never from a place name in a title.</li>
      <li><b>Reject the batch, not the row.</b> If any record in a refresh is invalid, nothing loads — the previous data stays and the source is marked stale.</li>
      <li><b>Say what you do not know</b>, on the page: confidence grades, &ldquo;not reported&rdquo;, known quirks in a source.</li>
      <li><b>Keep the date</b> — when it was published, and when we read it.</li>
    </ol>
    <h2>Found a mistake?</h2>
    <p><a href={issueUrl('Data correction', 'Page / module:\nWhat DrukView shows:\nWhat it should be:\nLink to the public document:\nTable / annexure / page:')} target="_blank" rel="noopener noreferrer">Open a data-correction issue</a> with the page, the figure as shown, the figure you believe is right, and a link to the document that proves it. We change a published figure only on the strength of a document — which is also why this is the most useful report we get.</p>
    <h2>Add budget or allocation rows</h2>
    <p>Some ministries publish PDFs only. Those are transcribed into the CSVs in <code>data/manual/</code> — edit them on <a href={repo} target="_blank" rel="noopener noreferrer">GitHub</a> and open a pull request:</p>
    <ul>
      <li><code>budget_by_agency.csv</code> — ministry / agency budgets by fiscal year</li>
      <li><code>allocations_by_location.csv</code> — allocations by dzongkhag, gewog or village, with funding source</li>
      <li><code>tenders.csv</code> — tender notices that are <b>not</b> on e-GP (e-GP notices are collected automatically, every day)</li>
      <li><code>offices.csv</code> — office contacts and leadership</li>
    </ul>
    <p><b>Every row must cite its public source:</b> <code>source_name</code>, <code>source_url</code> (https) and <code>document</code> (plus <code>page</code> where possible). Rows without a citation are rejected automatically, and the whole file is rejected if any row is invalid.</p>
    <h2>Add a data source or a collector</h2>
    <p>Know a public source DrukView should carry? <a href={issueUrl('Source', 'Publisher:\nWhere it is published (https):\nWhat form is it in (API / CSV / feed / HTML / PDF):\nWhat it would add, and down to what level:\nKnown caveats:')} target="_blank" rel="noopener noreferrer">Propose it</a>. Collectors are one file in <code>pipeline/</code> with a tested parser and an all-or-nothing validator; CONTRIBUTING.md has the pattern.</p>
    <h2>Translate</h2><p>Dzongkha is planned. We will only ship a translation reviewed by a native speaker; if you can help, open an issue first so the work is not duplicated.</p>
    <h2>Reporting something private</h2>
    <p>Found a security problem? Report it privately through <a href={`${repo}/security/advisories/new`} target="_blank" rel="noopener noreferrer">GitHub&apos;s private advisories</a> — never in a public issue. Never put a secret in an issue, a pull request or a commit. Everyone taking part follows the <a href={`${repo}/blob/main/CODE_OF_CONDUCT.md`} target="_blank" rel="noopener noreferrer">Code of Conduct</a>: argue with documents, not with people.</p>
  </div>);
}
