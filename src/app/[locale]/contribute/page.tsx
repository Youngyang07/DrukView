import { issueUrl, REPO } from '@/lib/modules';
export const metadata = { title: 'Contribute' };
export default function Contribute() {
  return (<div className="wrap page prose"><h1 className="pagetitle">Contribute</h1>
    <p>The most valuable contribution is a <b>correct, cited number</b>. Government budget documents are published as PDFs; turning them into rows lets everyone see where the money goes.</p>
    <h2>Add budget or allocation rows</h2>
    <p>Edit the CSVs in <code>data/manual/</code> on <a href={`https://github.com/${REPO}`} target="_blank" rel="noopener noreferrer">GitHub</a> and open a pull request:</p>
    <ul><li><code>budget_by_agency.csv</code> — ministry / agency budgets by fiscal year</li><li><code>allocations_by_location.csv</code> — allocations by dzongkhag, gewog or village, with funding source</li><li><code>tenders.csv</code> — public tender notices</li><li><code>offices.csv</code> — leadership and office contacts</li></ul>
    <p><b>Every row must cite its public source:</b> <code>source_name</code>, <code>source_url</code> (https) and <code>document</code> (plus <code>page</code> where possible). Rows without a citation are rejected automatically, and the whole file is rejected if any row is invalid.</p>
    <h2>Found a mistake?</h2>
    <p><a href={issueUrl('Data issue', 'Module / page:\nWhat is wrong:\nCorrect source (link):')} target="_blank" rel="noopener noreferrer">Open an issue</a> with the page, what is wrong and a link to the correct source.</p>
    <h2>Translate</h2><p>Dzongkha is planned. We will only ship a translation reviewed by a native speaker; if you can help, open an issue.</p>
  </div>);
}
