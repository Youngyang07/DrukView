export const metadata = { title: 'About' };
export default function About() {
  return (<div className="wrap page prose"><h1 className="pagetitle">About DrukView</h1>
    <p><b>Track projects. Follow funds. Build trust. Every Ngultrum accounted for.</b></p>
    <p>DrukView is a free, open-source civic-transparency platform for Bhutan. It gathers publicly available information about development projects, public budgets and allocations — by dzongkhag, and by gewog and village wherever the published documents go that deep — and shows who is funding what, with a link to the original source behind every figure.</p>
    <h2>Principles</h2>
    <ul><li><b>Sourced or absent.</b> If there is no public source, DrukView shows nothing rather than an estimate.</li><li><b>Honest about freshness.</b> Every module shows when its data was last refreshed; failures are visible.</li><li><b>No spin.</b> Commitments are not spending; currencies are never mixed; inferred locations are labelled.</li><li><b>Open.</b> Code and data pipelines are public; anyone can check or correct a figure.</li></ul>
    <h2>Independence</h2><p>DrukView is not affiliated with the Royal Government of Bhutan, the World Bank or the Asian Development Bank. Inspired by the district-level civic dashboards of <a href="https://github.com/jayanthmb14/forthepeople" target="_blank" rel="noopener noreferrer">ForThePeople.in</a> (MIT licensed).</p>
  </div>);
}
