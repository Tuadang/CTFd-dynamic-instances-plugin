console.log("[k8s] k8s_view.js loaded");

(function () {
  "use strict";

  // REQUIRED: challenge metadata object
  CTFd._internal.challenge.data = { instance_info: null };
  CTFd._internal.challenge.renderer = "vm";

  // REQUIRED: must exist or CTFd crashes
  CTFd._internal.challenge.preRender = function () {
  };

  // REQUIRED: legacy, still must exist
  CTFd._internal.challenge.render = function () {
  };

  // Called AFTER modal HTML is injected
  CTFd._internal.challenge.postRender = function () {
    initVMs();
  };

  // We don’t submit flags for k8s
  CTFd._internal.challenge.submit = function () {
    return Promise.resolve();
  };

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        const el = document.querySelector(selector);
        if (el) {
          clearInterval(timer);
          resolve(el);
        } else if (Date.now() - start > timeout) {
          clearInterval(timer);
          reject();
        }
      }, 100);
    });
  }

  async function initVMs() {

    try {
      await waitForElement("#challenge");
    } catch {
      console.warn("[vm] .challenge-view not found");
      return;
    }

    const challengeId = document.getElementById("challenge-id")?.value;
    const output = document.getElementById("instance-log");
    const startBtn = document.getElementById("start-instance");
    const stopBtn = document.getElementById("stop-instance");
    const statusBtn = document.getElementById("status-instance");
    let instanceId = null;

    if (!challengeId || !output) {
      console.warn("[vm] missing elements");
      return;
    }

    function log(msg) {
      output.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
      output.scrollTop = output.scrollHeight;
    }

    async function api(endpoint, payload = {}) {
      const res = await fetch(`/plugins/dynamic_instances/vm/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": CTFd.config.csrfNonce,
        },
        body: JSON.stringify({
          challenge_id: challengeId,
          instance_id: instanceId,
          ...payload,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return res.json();
    }

    function updateUI(data) {
      const connInput = document.getElementById("instance-connection");
      const statusBadge = document.getElementById("instance-status-badge");
      const connection = data.connection_string || (data.ip && data.port ? `nc ${data.ip} ${data.port}` : data.ip) || "Instance not started...";

      if (data.instance_id) instanceId = data.instance_id;

      if (data.status === "running") {
        connInput.value = connection;
        statusBadge.innerHTML = '<span class="badge bg-success">Online</span>';
      } else {
        connInput.value = connection || "Instance not started...";
        statusBadge.innerHTML = '<span class="badge bg-danger">Offline</span>';
      }
    }

    startBtn?.addEventListener("click", async () => {
      console.log("[VM] Start clicked");
      output.textContent = "";
      log("Starting instance...");
      try {
        const data = await api("start");
        updateUI(data);
        log(`Instance ${data.instance_id || ""} started`);
        if (data.ip) log(`IP: ${data.ip}`);
        if (data.port) log(`Port: ${data.port}`);
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });

    stopBtn?.addEventListener("click", async () => {
      log("Stopping instance...");
      try {
        const data = await api("stop");
        updateUI({ ...data, status: "stopped", connection_string: "Instance not started..." });
        log("Instance stopped");
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });

    statusBtn?.addEventListener("click", async () => {
      log("Checking status...");
      try {
        const data = await api("status");
        updateUI(data);
        log(`Status: ${data.status}`);
        if (data.ip) log(`IP: ${data.ip}`);
      } catch (e) {
        log(`Error: ${e.message}`);
      }
    });
  }
})();
