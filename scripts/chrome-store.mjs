import { readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";

const itemId = "okieeoellfjeaoppljeooohndgffiojd";
const item = `/v2/publishers/77c5d75d-0cb9-4310-9f24-cda4b510b670/items/${itemId}`;
const origin = "https://chromewebstore.googleapis.com";
const version = process.argv[2];

async function request(path, options = {}) {
  const response = await fetch(origin + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${process.env.CWS_ACCESS_TOKEN}`,
      ...options.headers,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Store API ${response.status}: ${await response.text()}`);
  const result = await response.json();
  if (result.itemId !== itemId) throw new Error("Unexpected store item.");
  return result;
}

function versions(revision) {
  return (
    revision?.distributionChannels?.map((channel) => channel.crxVersion) ?? []
  );
}

const status = await request(item + ":fetchStatus");
const published = status.publishedItemRevisionStatus;
const submitted = status.submittedItemRevisionStatus;
console.log("Published:", published?.state, versions(published));
console.log("Submitted:", submitted?.state ?? "none", versions(submitted));

if (version) await submit(version);

async function submit(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("Invalid release version.");
  if (published?.state === "PUBLISHED" && versions(published).includes(version))
    return;
  if (submitted && ["PENDING_REVIEW", "STAGED"].includes(submitted.state)) {
    if (versions(submitted).includes(version)) return;
    throw new Error("Another version is awaiting review or publication.");
  }
  const archive = await readFile(`store-package/fontzie-${version}-chrome.zip`);
  const upload = await request("/upload" + item + ":upload", {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: archive,
  });
  if (upload.crxVersion && upload.crxVersion !== version)
    throw new Error(`Store received unexpected version ${upload.crxVersion}.`);
  let state = upload.uploadState;
  for (let attempt = 0; state === "IN_PROGRESS" && attempt < 24; attempt++) {
    await setTimeout(5000);
    state = (await request(item + ":fetchStatus")).lastAsyncUploadState;
  }
  if (state !== "SUCCEEDED") throw new Error(`Upload did not finish: ${state}`);
  const result = await request(item + ":publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publishType: "DEFAULT_PUBLISH" }),
  });
  console.log(`Version ${version}: ${result.state}`);
  if (!["PENDING_REVIEW", "PUBLISHED"].includes(result.state))
    throw new Error(
      "Unexpected publication state. Check the developer dashboard.",
    );
}
