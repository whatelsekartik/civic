import { handleCallback } from "@vercel/queue";
import { Sandbox } from "@vercel/sandbox";
import { PYTHON_WORKER_SOURCE } from "../lib/worker-source";
import { readJson, saveJson, signedBlobUrl } from "../lib/storage";
import { JOB_PREFIX, type Job, type Zone } from "../lib/models";

export const maxDuration = 300;

type QueueMessage = { jobId?: string };

export const POST = handleCallback(async (message: QueueMessage) => {
  const jobId = message?.jobId;
  if (!jobId || !/^[a-zA-Z0-9_-]{1,100}$/.test(jobId)) {
    throw new Error("Queue message did not contain a valid CivicWatch job ID.");
  }

  const jobPath = JOB_PREFIX + jobId + ".json";
  const job = await readJson<Job>(jobPath);
  if (!job) throw new Error("Queued CivicWatch job was not found: " + jobId);
  if (job.status === "completed" || job.status === "failed" || job.status === "processing") return;
  if (job.status === "provisioning") {
    const age = job.startedAt ? Date.now() - Date.parse(job.startedAt) : 0;
    if (age < 5 * 60 * 1000) return;
    job.status = "failed";
    job.error = "Cloud worker provisioning timed out before the Sandbox could start.";
    job.message = job.error;
    job.updatedAt = new Date().toISOString();
    await saveJson(jobPath, job);
    return;
  }

  const internalSecret = process.env.CIVICWATCH_INTERNAL_SECRET;
  const deploymentHost = process.env.VERCEL_URL;
  if (!internalSecret || !deploymentHost) {
    throw new Error("CIVICWATCH_INTERNAL_SECRET and VERCEL_URL are required to start cloud inference.");
  }

  job.status = "provisioning";
  job.startedAt = new Date().toISOString();
  job.updatedAt = job.startedAt;
  job.message = "Provisioning an isolated Vercel Python Sandbox…";
  await saveJson(jobPath, job);

  try {
    const zoneRecords = await Promise.all(job.zoneIds.map((id) => readJson<Zone>("civicwatch/zones/" + id + ".json")));
    const zones = zoneRecords.filter((zone): zone is Zone => zone !== null);
    const sandboxTimeout = Math.min(
      Math.max(Number(process.env.CIVICWATCH_SANDBOX_TIMEOUT_MS || 45 * 60 * 1000), 5 * 60 * 1000),
      24 * 60 * 60 * 1000,
    );
    const requestedVcpus = Math.floor(Number(process.env.CIVICWATCH_SANDBOX_VCPUS || 2));
    const vcpus = requestedVcpus >= 4 ? 4 : requestedVcpus >= 2 ? 2 : 1;
    const callbackUrl = "https://" + deploymentHost;

    const [inputUrl, outputPutUrl] = await Promise.all([
      signedBlobUrl(job.sourcePath, "get", sandboxTimeout + 10 * 60 * 1000),
      signedBlobUrl(job.outputPath, "put", sandboxTimeout + 10 * 60 * 1000),
    ]);

    const sandbox = await Sandbox.create({
      name: "civicwatch-" + job.id,
      runtime: "python3.13",
      resources: { vcpus },
      timeout: sandboxTimeout,
      persistent: false,
      env: {
        CW_JOB_ID: job.id,
        CW_INPUT_URL: inputUrl,
        CW_OUTPUT_PUT_URL: outputPutUrl,
        CW_CALLBACK_URL: callbackUrl,
        CW_INTERNAL_SECRET: internalSecret,
        CW_ZONES_JSON: JSON.stringify(zones),
      },
    });

    await sandbox.writeFiles([
      {
        path: "/vercel/sandbox/worker.py",
        content: Buffer.from(PYTHON_WORKER_SOURCE, "utf-8"),
      },
    ]);

    job.status = "processing";
    job.progress = 0;
    job.message = "Cloud worker started. Installing the vision stack and preparing footage…";
    job.sandboxName = sandbox.name;
    job.updatedAt = new Date().toISOString();
    await saveJson(jobPath, job);

    await sandbox.runCommand({
      cmd: "python3",
      args: ["/vercel/sandbox/worker.py"],
      detached: true,
    });
  } catch (error) {
    job.status = "queued";
    job.error = error instanceof Error ? error.message : "Could not start the Vercel Sandbox.";
    job.message = "Cloud worker could not start. Queue delivery will retry.";
    job.updatedAt = new Date().toISOString();
    await saveJson(jobPath, job);
    throw error;
  }
}, {
  visibilityTimeoutSeconds: 300,
  retry: (_error, metadata) => {
    if (metadata.deliveryCount > 8) return { acknowledge: true };
    return { afterSeconds: Math.min(300, 10 * 2 ** Math.max(0, metadata.deliveryCount - 1)) };
  },
});
