// k8s_view.js
// CTFd challenge renderer for Kubernetes-backed dynamic instances

(() => {
  "use strict";

  /* ------------------------------------------------------------------
   * REQUIRED CTFd CHALLENGE INTERFACE
   * ------------------------------------------------------------------ */

  // Preserve existing challenge data if present
  const existing = CTFd._internal.challenge.data || {};
  CTFd._internal.challenge.data = existing;

  // Renderer name (optional but correct)
  CTFd._internal.challenge.renderer = "k8s";

  // MUST exist or CTFd throws
  CTFd._internal.challenge.preRender = function () {};

  // Legacy hook — must exist
  CTFd._internal.challenge.render = function () {};

  // Called AFTER modal HTML is injected
  CTFd._internal.challenge.postRender = function () {
    clearPolling();
    instanceId = null;
    activeChallengeId = challengeId();
    currentSession += 1;
    initK8sInstanceUI();
  };

  // Required even if unused
  CTFd._internal.challenge.submit = function () {
    return Promise.resolve();
  };

  /* ------------------------------------------------------------------
   * IMPLEMENTATION
   * ------------------------------------------------------------------ */

  let instanceId = null;
  let pollTimer = null;
  let globalClickBound = false;
  let modalCloseBound = false;
  let startBtn = null;
  let stopBtn = null;
  let extendBtn = null;
  let activeChallengeId = null;
  let currentSession = 0;
  let modalRoot = null;

  function challengeId() {
    const root = modalRoot || document;
    const fromInput = parseInt(root.querySelector("#challenge-id")?.value);
    if (!Number.isNaN(fromInput)) return fromInput;
    const fromData = parseInt(CTFd?._internal?.challenge?.data?.id);
    if (!Number.isNaN(fromData)) return fromData;
    const fromWindow = parseInt(window?.CHALLENGE_ID);
    if (!Number.isNaN(fromWindow)) return fromWindow;
    return null;
  }

  function getActiveChallengeId() {
    return activeChallengeId ?? challengeId();
  }

  function instanceKey() {
    const id = getActiveChallengeId();
    return id ? `dynamic_instances:${id}` : null;
  }

  function loadInstanceId() {
    const key = instanceKey();
    if (!key) return null;
    return localStorage.getItem(key);
  }

  function saveInstanceId(value) {
    const key = instanceKey();
    if (!key) return;
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  }

  async function api(endpoint, method = "POST", payload = {}) {
    let url = `/plugins/dynamic_instances/dynamic/${endpoint}`;
    if (method === "GET" && payload && Object.keys(payload).length) {
      const params = new URLSearchParams(payload);
      url = `${url}?${params.toString()}`;
    }
    const res = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "CSRF-Token": CTFd.config.csrfNonce,
      },
      body: method === "GET" ? null : JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    return data;
  }

  function updateStatus(data) {
    const el = document.getElementById("instance-status-badge");
    if (!el) return;

    const connBadge = document.getElementById("instance-connection-status");
    const connInfo = document.getElementById("instance-connection-info");
    const ttlEl = document.getElementById("instance-ttl");

    const status = data.status || data.pod_phase || "unknown";
    const isRunning = status === "running" || status === "Running";
    const isCreating = status === "starting" || status === "pending" || status === "Pending" || status === "creating";

    if (isRunning) {
      el.innerHTML = "";
      setButtons(true);
      if (connBadge) {
        connBadge.textContent = "Available";
        connBadge.classList.remove("text-danger", "text-warning");
        connBadge.classList.add("text-success");
      }
      if (connInfo) {
        connInfo.textContent = data.connection || data.url || data.ip || "Available";
        connInfo.classList.remove("text-muted", "text-success", "text-danger", "text-warning");
      }
      if (ttlEl) {
        renderTtl(ttlEl, data);
      }
    } else if (isCreating) {
      el.innerHTML = "";
      setButtons(true);
      if (connBadge) {
        connBadge.textContent = "Creating";
        connBadge.classList.remove("text-success", "text-danger");
        connBadge.classList.add("text-warning");
      }
      if (connInfo) {
        connInfo.textContent = "Starting...";
        connInfo.classList.remove("text-success", "text-danger", "text-warning");
        connInfo.classList.add("text-muted");
      }
      if (ttlEl) {
        renderTtl(ttlEl, data);
      }
    } else {
      el.innerHTML = "";
      setButtons(false);
      if (connBadge) {
        connBadge.textContent = "Unavailable";
        connBadge.classList.remove("text-success", "text-warning");
        connBadge.classList.add("text-danger");
      }
      if (connInfo) {
        connInfo.textContent = "Not available";
        connInfo.classList.remove("text-success", "text-warning");
        connInfo.classList.add("text-muted");
      }
      if (ttlEl) {
        ttlEl.textContent = "";
      }
    }
  }

  function renderTtl(el, data) {
    const ttlRemaining = data.ttl_remaining;
    const expiresAt = data.expires_at;
    if (typeof ttlRemaining === "number") {
        const mins = Math.ceil(ttlRemaining / 60);
        el.textContent = `Time remaining: ${mins} min`;
        return;
    }
    if (typeof expiresAt === "number") {
        const now = Math.floor(Date.now() / 1000);
        const remaining = Math.max(expiresAt - now, 0);
        const mins = Math.ceil(remaining / 60);
        el.textContent = `Time remaining: ${mins} min`;
        return;
    }
    el.textContent = "";
  }

  function clearPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    clearPolling();
    const session = currentSession;
    pollTimer = setInterval(async () => {
      if (session !== currentSession) return;
      if (!instanceId) return;
      try {
        const data = await api("status", "GET", {
          challenge_id: getActiveChallengeId(),
          instance_id: instanceId,
        });
        if (session === currentSession) updateStatus(data);
      } catch (_) {}
    }, 5000);
  }

  async function startInstance() {
    const data = await api("start", "POST", {
      challenge_id: getActiveChallengeId(),
    });
    instanceId = data.instance_id;
    saveInstanceId(instanceId);
    setButtons(true);
    updateStatus({ ...data, status: data.status || "creating" });
    startPolling();
  }

  async function stopInstance() {
    if (!instanceId) return;
    await api("stop", "POST", {
      challenge_id: getActiveChallengeId(),
      instance_id: instanceId,
    });
    instanceId = null;
    saveInstanceId(null);
    setButtons(false);
    clearPolling();
    updateStatus({ status: "stopped" });
  }

  function initK8sInstanceUI() {
    startBtn = document.getElementById("start-instance");
    stopBtn = document.getElementById("stop-instance");
    extendBtn = document.getElementById("extend-instance");
    modalRoot = startBtn?.closest(".modal") || startBtn?.closest(".modal-content") || null;
    if (stopBtn) stopBtn.style.display = "none";
    setButtons(false);
    bindGlobalClickHandler();
    bindModalCloseHandler();
    instanceId = loadInstanceId();
    if (instanceId) {
      const session = currentSession;
      setButtons(true);
      api("status", "GET", { challenge_id: getActiveChallengeId(), instance_id: instanceId })
        .then((data) => {
          if (session === currentSession) updateStatus(data);
        })
        .catch(() => {
          if (session === currentSession) {
            instanceId = null;
            saveInstanceId(null);
            setButtons(false);
          }
        });
      startPolling();
    }
  }

  function setButtons(isRunning) {
    if (!startBtn || !document.contains(startBtn)) {
      startBtn = document.getElementById("start-instance");
    }
    if (!extendBtn || !document.contains(extendBtn)) {
      extendBtn = document.getElementById("extend-instance");
    }
    if (!startBtn) return;
    if (isRunning) {
      startBtn.dataset.mode = "running";
      startBtn.classList.remove("btn-success");
      startBtn.classList.add("btn-danger");
      startBtn.innerHTML = '<i class="fas fa-stop"></i> Stop Instance';
      if (extendBtn) extendBtn.disabled = false;
    } else {
      startBtn.dataset.mode = "stopped";
      startBtn.classList.remove("btn-danger");
      startBtn.classList.add("btn-success");
      startBtn.innerHTML = '<i class="fas fa-play"></i> Start Instance';
      if (extendBtn) extendBtn.disabled = true;
    }
  }

  function bindGlobalClickHandler() {
    if (globalClickBound) return;
    globalClickBound = true;
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("#start-instance, #stop-instance, #extend-instance");
      if (!button) return;

      if (button.id === "start-instance") {
        const mode = button.dataset.mode || "stopped";
        if (mode === "running") {
          stopInstance().catch(() => {});
        } else {
          startInstance().catch(() => {});
        }
      } else if (button.id === "stop-instance") {
        stopInstance().catch(() => {});
      } else if (button.id === "extend-instance") {
        if (!instanceId) return;
        const extendSeconds = parseInt(button.dataset.extendSeconds || "300");
        api("extend", "POST", {
          challenge_id: getActiveChallengeId(),
          instance_id: instanceId,
          extend_seconds: Number.isNaN(extendSeconds) ? 300 : extendSeconds,
        })
          .then(() => api("status", "GET", { challenge_id: getActiveChallengeId(), instance_id: instanceId }))
          .then(updateStatus)
          .catch(() => {});
      }
    });
  }

  function bindModalCloseHandler() {
    if (modalCloseBound) return;
    modalCloseBound = true;
    document.addEventListener("hidden.bs.modal", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!startBtn || !target.contains(startBtn)) return;
      clearPolling();
      instanceId = null;
      activeChallengeId = null;
    });
  }
})();
