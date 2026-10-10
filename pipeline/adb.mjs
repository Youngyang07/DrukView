import { fetchIati } from './iati.mjs';

// ADB publishes its portfolio as IATI. Verified live on 2026-10-10: valid IATI 2.03, 62 Bhutan activities (= 38 projects).
// Override with ADB_IATI_URL if ADB relocates the file; on failure the update run keeps the previous ADB data and flags it stale.
export const ADB_IATI_URL = process.env.ADB_IATI_URL || 'https://www.adb.org/iati/iati-activities-bt.xml';

export const SOURCE = {
  id: 'adb',
  name: 'Asian Development Bank – IATI activity file (Bhutan)',
  url: 'https://www.adb.org/projects/country/bhutan',
  kind: 'iati',
  notes: 'Loans/grants of one ADB project are merged into a single project (summed in the currency ADB reports, normally US$). IATI "Finalisation" counts as completed. Activities shared across countries are shown without an amount rather than guessing a Bhutan share.',
};

/** "XM-DAC-46004-39221-022-GRNT0088" → ADB project number "39221-022" (the id used on adb.org/projects/<n>/main) */
export const adbProjectKey = id => (String(id).match(/^XM-DAC-46004-(\d+-\d+)/) || [])[1] ?? null;
export const adbProjectUrl = key => /^\d+-\d+$/.test(key) ? `https://www.adb.org/projects/${key}/main` : null;

export const fetchAdb = (matcher, sectorNames = {}) => fetchIati(ADB_IATI_URL, {
  sourceId: 'adb', funder: 'Asian Development Bank', matcher, fetchedAt: new Date().toISOString(),
  projectKey: adbProjectKey, projectUrl: adbProjectUrl, sectorNames,
});
