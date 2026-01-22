"use strict";

/**
 * This runs every time a challenge modal is opened
 * (CTFd guarantees DOM is ready here)
 */
CTFd._internal.challenge.onLoad(() => {
  const challengeId = document.getElementById("challenge-id")?.value;
  const output = document.getElementById("instance-info");

  const startBtn = document.getElementById("start-instance");
  const stopBtn = document.getElementById("stop-instance");
  const statusBtn = document.getElementById("status-instance");

  if (!challengeId || !output) {
    console.warn("[k8s] Required elements not found");
    return;
  }

  function log(msg) {
    output.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    output.scrollTop = output.scrollHeight;
  }

  async function api(endpoint, method = "POST") {
    const res = await fetch(`/api/v1/k8s/${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "CSRF-Token": CTFd.config.csrfNonce,
      },
      body: method === "GET"
        ? null
        : JSON.stringify({ challenge_id: challengeId }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  }

  startBtn?.addEventListener("click", async () => {
    output.textContent = "";
    log("Starting instance...");
    try {
      const data = await api("start");
      log("Instance started");
      if (data.ip) log(`IP: ${data.ip}`);
      if (data.port) log(`Port: ${data.port}`);
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  statusBtn?.addEventListener("click", async () => {
    log("Checking status...");
    try {
      const data = await api("status", "GET");
      log(`Status: ${data.status}`);
      if (data.ip) log(`IP: ${data.ip}`);
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });

  stopBtn?.addEventListener("click", async () => {
    log("Stopping instance...");
    try {
      await api("stop");
      log("Instance stopped");
    } catch (e) {
      log(`Error: ${e.message}`);
    }
  });
});
