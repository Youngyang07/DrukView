import { fetchIati } from './iati.mjs';

// ADB publishes its portfolio as IATI. The URL is configurable because ADB may relocate the file;
// if it cannot be fetched the update run records an error and keeps the previous ADB data.
export const ADB_IATI_URL = process.env.ADB_IATI_URL || 'https://www.adb.org/iati/iati-activities-bt.xml';

export const SOURCE = {
  id: 'adb',
  name: 'Asian Development Bank – IATI activity file (Bhutan)',
  url: 'https://www.adb.org/projects/country/bhutan',
  kind: 'iati',
  notes: 'Commitments/disbursements are summed from IATI transactions, in the currency ADB reports (normally USD). Activities shared across several countries are shown without an amount rather than guessing a Bhutan share.',
};

export const fetchAdb = (matcher) => fetchIati(ADB_IATI_URL, {
  sourceId: 'adb', funder: 'Asian Development Bank', matcher, fetchedAt: new Date().toISOString(),
  projectUrl: id => `https://www.adb.org/projects/${encodeURIComponent(String(id).split('-').pop())}/main`,
});
