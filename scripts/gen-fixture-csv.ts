/**
 * Generate a synthetic contacts CSV for load rehearsal.
 *
 *   npx tsx scripts/gen-fixture-csv.ts 100000 fixtures/contacts_100k.csv
 *
 * Emails are prefixed "loadtest+" and use a domain we own for the rehearsal
 * so bounces don't hit real inboxes. Colleges and branches rotate through a
 * small fixture set so segment queries have meaningful cardinality.
 */
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const COLLEGES = ["ABES", "IIIT Delhi", "NIT Trichy", "IIT Roorkee", "BITS Pilani", "VIT Vellore"];
const BRANCHES = ["CSE", "ECE", "ME", "IT", "EE", "CE"];
const YEARS = ["1st", "2nd", "3rd", "4th"];
const STATUS = ["REGISTERED", "NOT_REGISTERED"];

async function main() {
  const rows = Number(process.argv[2] ?? "10000");
  const outArg = process.argv[3] ?? `fixtures/contacts_${rows}.csv`;
  const outPath = path.resolve(outArg);
  await mkdir(path.dirname(outPath), { recursive: true });

  const stream = createWriteStream(outPath, "utf8");
  stream.write("email,first_name,last_name,college,branch,year,graduation_year,registration_status\n");

  const start = Date.now();
  for (let i = 0; i < rows; i++) {
    const email = `loadtest+${i}@rehearsal.abtalks.in`;
    const first = `First${i % 999}`;
    const last = `Last${i % 899}`;
    const college = COLLEGES[i % COLLEGES.length];
    const branch = BRANCHES[i % BRANCHES.length];
    const year = YEARS[i % YEARS.length];
    const grad = 2024 + (i % 5);
    const status = STATUS[i % STATUS.length];
    stream.write(`${email},${first},${last},${college},${branch},${year},${grad},${status}\n`);
    if (i % 10000 === 0 && i > 0) console.warn(`… wrote ${i.toLocaleString()} rows`);
  }
  await new Promise<void>((resolve, reject) => stream.end((err?: Error | null) => (err ? reject(err) : resolve())));
  console.warn(`Wrote ${rows.toLocaleString()} rows to ${outPath} in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
