(function () {
  "use strict";

  // REQUIRED: challenge metadata object. Preserve any existing data from CTFd.
  const existing = CTFd._internal.challenge.data || {};
  CTFd._internal.challenge.data = { ...existing, instance_info: existing.instance_info ?? null };
  CTFd._internal.challenge.renderer = "k8s";

  // REQUIRED: must exist or CTFd crashes
  CTFd._internal.challenge.preRender = function () {
  };

  // REQUIRED: legacy, still must exist
  CTFd._internal.challenge.render = function () {
  };

  // Called AFTER modal HTML is injected
  CTFd._internal.challenge.postRender = function () {
    initK8s();
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

  async function loadCurrentUser() {
    const internalUser = (window.CTFd && window.CTFd._internal && window.CTFd._internal.user) ? window.CTFd._internal.user : null;
    if (internalUser && internalUser.id) {
      return internalUser;
    }

    try {
      const res = await fetch("/api/v1/users/me", { credentials: "same-origin" });
      if (!res.ok) return {};
      const body = await res.json();
      return body && body.data ? body.data : {};
    } catch (e) {
      return {};
    }
  }

  async function initK8s() {

    try {
      await waitForElement("#challenge");
    } catch {
      return;
    }

    const challengeId = document.getElementById("challenge-id")?.value;
      const startBtn = document.getElementById("start-instance");
      const stopBtn = document.getElementById("stop-instance");
      const statusBtn = document.getElementById("status-instance");
      const output = document.getElementById("instance-log");
      const k8sBase = ("https://api.banaantje.be").replace(/\/$/, "");
      const defaultImage = window.DYNAMIC_INSTANCES_K8S_IMAGE;
      const defaultTag = window.DYNAMIC_INSTANCES_K8S_TAG;
      const defaultPort = window.DYNAMIC_INSTANCES_K8S_PORT;
      const userInfo = await loadCurrentUser();
      const userIdentifier = userInfo.name || userInfo.username || userInfo.email || userInfo.id || "user";
      const userId = userInfo.id || null;
      const teamId = userInfo.team_id || null;
      const keySuffix = `${challengeId}-${userId || "anon"}`;
      const instanceKey = `k8s-instance-${keySuffix}`;
      const stateKey = `k8s-state-${keySuffix}`;
      const logKey = `k8s-log-${keySuffix}`;
      let instanceId = localStorage.getItem(instanceKey) || null;
      let readyPollTimer = null;
      let heartbeatTimer = null;
      let busy = false;

    if (!challengeId || !output) {
      return;
    }

    if (!k8sBase) {
      output.textContent = "[error] API base URL not configured (set window.DYNAMIC_INSTANCES_K8S_API_BASE or DYNAMIC_INSTANCES_API_BASE)";
      return;
    }

    function log(msg) {
      output.textContent += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
      output.scrollTop = output.scrollHeight;
      localStorage.setItem(logKey, output.textContent);
    }

    function syncButtons(running = false) {
      if (startBtn) startBtn.disabled = busy || running;
      if (stopBtn) stopBtn.disabled = busy || !instanceId;
      if (statusBtn) statusBtn.disabled = busy;
    }

    function resolveValue(key) {
      // priority: explicit input value -> data attr -> challenge data -> global default
      const input = document.getElementById(`challenge-${key}`);

      if (input && input.value) return input.value;

      const dataEl = document.querySelector(`[data-challenge-${key}]`);

      if (dataEl && dataEl.dataset && dataEl.dataset[`challenge${key.charAt(0).toUpperCase()}${key.slice(1)}`]) {
        return dataEl.dataset[`challenge${key.charAt(0).toUpperCase()}${key.slice(1)}`];
      }

      const challengeData = window.CTFd && window.CTFd._internal && window.CTFd._internal.challenge && window.CTFd._internal.challenge.data;
      
      if (challengeData && challengeData[key]) return challengeData[key];

      return key === "image" ? defaultImage : key === "tag" ? defaultTag : defaultPort;
    }

    function buildStartPayload() {
      const image = resolveValue("image");
      const tag = resolveValue("tag");
      const portVal = resolveValue("port");

      const port = portVal ? parseInt(portVal, 10) : undefined;
      const user = userIdentifier;

      return { image, tag, port, user };
    }

    async function api(endpoint, payload = {}) {
      const res = await fetch(`${k8sBase}/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CSRF-Token": CTFd.config.csrfNonce,
        },
        body: JSON.stringify({
          challenge_id: challengeId,
          instance_id: instanceId,
          user_id: userId,
          user_name: userIdentifier,
          ...payload,
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        // If no JSON, keep generic message
      }

      if (!res.ok) {
        const msg = data.message || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      return data;
    }

    function updateUI(data) {
      const connInput = document.getElementById("instance-connection");
      const statusBadge = document.getElementById("instance-status-badge");
      const connection = data.connection_string || (data.ip && data.port ? `nc ${data.ip} ${data.port}` : data.ip) || "Instance not started...";

      if (data.instance_id) {
        instanceId = data.instance_id;
        localStorage.setItem(instanceKey, instanceId);
      }

      if (data.status === "running") {
        connInput.value = connection;
        statusBadge.innerHTML = '<span class="badge bg-success">Online</span>';
      } else {
        connInput.value = connection || "Instance not started...";
        statusBadge.innerHTML = '<span class="badge bg-danger">Offline</span>';
      }

      localStorage.setItem(stateKey, JSON.stringify({
        instanceId,
        status: data.status,
        connection,
        timestamp: Date.now(),
      }));

      const hasConnection = Boolean(data.connection_string || data.ip);
      syncButtons(data.status === "running");
      return hasConnection;
    }

    function clearTimers() {
      if (readyPollTimer) {
        clearInterval(readyPollTimer);
        readyPollTimer = null;
      }
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }

    // Restore saved log on load per challenge/user
    const savedLog = localStorage.getItem(logKey);
    if (savedLog) {
      output.textContent = savedLog;
      output.scrollTop = output.scrollHeight;
    }

    // Restore saved UI state on load per challenge/user
    const savedStateRaw = localStorage.getItem(stateKey);
    let initialRunning = false;
    if (savedStateRaw) {
      try {
        const saved = JSON.parse(savedStateRaw);
        if (saved) {
          const connInput = document.getElementById("instance-connection");
          const statusBadge = document.getElementById("instance-status-badge");
          if (saved.instanceId) instanceId = saved.instanceId;
          if (saved.connection) connInput.value = saved.connection;
          if (saved.status === "running") {
            statusBadge.innerHTML = '<span class="badge bg-success">Online</span>';
            initialRunning = true;
          } else if (saved.status) {
            statusBadge.innerHTML = '<span class="badge bg-danger">Offline</span>';
          }
        }
      } catch (e) {
        // ignore malformed state
      }
    }

    syncButtons(initialRunning);

    function startHeartbeat() {
      if (heartbeatTimer) return;
      heartbeatTimer = setInterval(() => {
        statusBtn?.click();
      }, 180000); // every 3 minutes
    }

    function startReadyPoll() {
      clearTimers();
      readyPollTimer = setInterval(async () => {
        try {
          const data = await api("status");
          const ready = updateUI(data);
          if (ready) {
            clearInterval(readyPollTimer);
            readyPollTimer = null;
            startHeartbeat();
          }
        } catch (e) {
          log(`Error: ${e.message}`);
        }
      }, 5000);
    }

    // Try to attach to an existing instance on load
    (async () => {
      try {
        if (!instanceId) return;
        const data = await api("status");
        const ready = updateUI(data);
        if (data.instance_id) instanceId = data.instance_id;
        if (ready) {
          startHeartbeat();
        }
      } catch (e) {
        // Status may 404 if no instance; ignore
      }
    })();

    startBtn?.addEventListener("click", async () => {
      log("Starting instance...");
      busy = true;
      syncButtons(true);
      const startPayload = buildStartPayload();

      if (!startPayload.image) {
        log("Error: image not configured for this challenge");
        return;
      }

      // Check if an instance already exists before starting a new one
      try {
        if (instanceId) {
          const existing = await api("status");
          const ready = updateUI(existing);
          if (existing.instance_id) instanceId = existing.instance_id;
          if (ready) {
            startHeartbeat();
            busy = false;
            syncButtons(existing.status === "running");
            return;
          }
        }
      } catch (e) {
        // If status fails, proceed to start
      }
      
      try {
        const data = await api("start", startPayload);
        updateUI(data);
        log(`Instance ${data.instance_id || ""} started`);
        if (data.ip) log(`IP: ${data.ip}`);
        if (data.port) log(`Port: ${data.port}`);
        startReadyPoll();
      } catch (e) {
        log(`Error: ${e.message}`);
      } finally {
        busy = false;
        syncButtons(false);
      }
    });

    stopBtn?.addEventListener("click", async () => {
      if (!instanceId) {
        log("No instance to stop yet.");
        return;
      }

      log("Stopping instance...");
      busy = true;
      syncButtons(false);
      clearTimers();
      const currentId = instanceId;

      try {
        const data = await api("stop", { instance_id: currentId });
        updateUI({ ...data, status: "stopped", connection_string: "Instance not started..." });
        log("Instance stopped");
        if (data.errors) log(`Warnings: ${JSON.stringify(data.errors)}`);
        instanceId = null;
        localStorage.removeItem(instanceKey);
        localStorage.removeItem(stateKey);
      } catch (e) {
        log(`Error: ${e.message}`);
      } finally {
        busy = false;
        syncButtons(false);
      }
    });

    statusBtn?.addEventListener("click", async () => {
      log("Checking status...");
      busy = true;
      syncButtons(false);
      try {
        if (!instanceId) {
          log("No instance to check yet.");
          return;
        }
        const data = await api("status");
        const ready = updateUI(data);
        log(`Status: ${data.status}`);
        if (data.ip) log(`IP: ${data.ip}`);
        if (ready && !heartbeatTimer) startHeartbeat();
      } catch (e) {
        log(`Error: ${e.message}`);
      } finally {
        busy = false;
        syncButtons(false);
      }
    });
  }
})();
