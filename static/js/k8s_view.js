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
    activeChallengeId = null;
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
  const instanceByChallenge = new Map();
  let pollTimer = null;
  let globalClickBound = false;
  let modalCloseBound = false;
  let startBtn = null;
  let stopBtn = null;
  let extendBtn = null;
  let activeChallengeId = null;
  let currentSession = 0;
  let modalRoot = null;
  let startInFlight = false;

  // Resolve challenge id from the modal markup (CTFd sets it in x-init).
  function challengeId(rootOverride) {
    const root = rootOverride || modalRoot || document;
    const fromInit = initChallengeId(root);
    if (!Number.isNaN(fromInit)) return fromInit;
    return null;
  }

  // Prefer the currently visible modal to avoid stale ids.
  function visibleChallengeId() {
    const visibleDialog =
      document.querySelector(".modal.show .modal-dialog[x-init]") ||
      document.querySelector(".modal.in .modal-dialog[x-init]") ||
      document.querySelector(".modal-dialog[x-init]");
    if (visibleDialog) {
      const fromInit = initChallengeId(visibleDialog);
      if (!Number.isNaN(fromInit)) return fromInit;
    }
    return null;
  }

  // Parse `id = <number>` from Alpine x-init.
  function initChallengeId(root) {
    if (!(root instanceof HTMLElement)) return null;
    const el = root.hasAttribute("x-init") ? root : root.querySelector("[x-init]");
    const init = el?.getAttribute("x-init") || "";
    if (!init) return null;
    const match = init.match(/\bid\s*=\s*(\d+)\b/);
    if (!match) return null;
    const value = parseInt(match[1]);
    return Number.isNaN(value) ? null : value;
  }

  // Map a clicked element to its owning modal.
  function challengeIdForElement(el) {
    if (!(el instanceof HTMLElement)) return getActiveChallengeId();
    const root =
      el.closest(".modal-dialog") ||
      el.closest(".modal") ||
      el.closest(".modal-content") ||
      modalRoot ||
      document;
    const fromInit = initChallengeId(root);
    if (!Number.isNaN(fromInit)) return fromInit;
    return getActiveChallengeId();
  }

  // Fallback chain for current challenge id.
  function getActiveChallengeId() {
    return visibleChallengeId() ?? activeChallengeId ?? challengeId();
  }

  // Track instance id per challenge on the client.
  function loadInstanceId() {
    const id = getActiveChallengeId();
    if (!id) return null;
    if (instanceByChallenge.has(id)) return instanceByChallenge.get(id);
    return null;
  }

  function saveInstanceId(value) {
    const id = getActiveChallengeId();
    if (!id) return;
    if (value) {
      instanceByChallenge.set(id, value);
    } else {
      instanceByChallenge.delete(id);
    }
  }

  // Small wrapper for plugin API calls.
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

  // Render status, connection info, and TTL.
  function updateStatus(data) {
    const el = document.getElementById("instance-status-badge");
    if (!el) return;

    const connBadge = document.getElementById("instance-connection-status");
    const connInfo = document.getElementById("instance-connection-info");
    const ttlEl = document.getElementById("instance-ttl");

    const status = data.status || data.pod_phase || "unknown";
    const isRunning = status === "running" || status === "Running";
    const isCreating = status === "starting" || status === "pending" || status === "Pending" || status === "creating";
    const ttlRemaining = typeof data.ttl_remaining === "number" ? data.ttl_remaining : null;
    const ttlMax = typeof data.ttl_max === "number" ? data.ttl_max : null;

    if (isRunning) {
      el.innerHTML = "";
      setButtons(true);
      if (connBadge) {
        connBadge.textContent = "Available";
        connBadge.classList.remove("text-danger", "text-warning");
        connBadge.classList.add("text-success");
      }
      if (connInfo) {
        const target = data.connection || data.url || data.ip || "";
        const port = data.port || data.service_port || data.container_port;
        const host = target || "Available";
        const display = port ? `${host}:${port}` : host || "Available";
        const href = host && host !== "Available" ? buildLink(host, port) : null;
        connInfo.classList.remove("text-muted", "text-success", "text-danger", "text-warning");
        if (href) {
          connInfo.innerHTML = `<a href="${href}" target="_blank" rel="noopener noreferrer">${display}</a>`;
        } else {
          connInfo.textContent = display || "Available";
        }
      }
      if (ttlEl) {
        renderTtl(ttlEl, data);
      }
      if (extendBtn) {
        extendBtn.disabled = ttlMax !== null && ttlRemaining !== null && ttlRemaining >= ttlMax;
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
      if (extendBtn) {
        extendBtn.disabled = ttlMax !== null && ttlRemaining !== null && ttlRemaining >= ttlMax;
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
      if (extendBtn) {
        extendBtn.disabled = true;
      }
    }
  }

  function buildLink(host, port) {
    if (!host) return null;
    const hasScheme = /^https?:\/\//i.test(host);
    const base = hasScheme ? host : `http://${host}`;
    if (!port) return base;
    return base.includes("://") ? `${base.replace(/\/$/, "")}:${port}` : `${base}:${port}`;
  }

  // Convert TTL into a short display string.
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

  // Poll control for the active modal.
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

  // Start lifecycle actions.
  async function startInstance(challengeIdOverride) {
    const challengeId = challengeIdOverride ?? getActiveChallengeId();
    if (startInFlight || !challengeId) return;
    if (instanceByChallenge.get(challengeId)) return;
    startInFlight = true;
    if (startBtn) startBtn.disabled = true;
    try {
      const data = await api("start", "POST", {
        challenge_id: challengeId,
      });
      if (data.instance_id) {
        instanceId = data.instance_id;
        instanceByChallenge.set(challengeId, data.instance_id);
        saveInstanceId(data.instance_id);
      }
      setButtons(true);
      updateStatus({ ...data, status: data.status || "creating" });
      startPolling();
    } finally {
      startInFlight = false;
      if (startBtn) startBtn.disabled = false;
    }
  }

  async function stopInstance(challengeIdOverride) {
    const challengeId = challengeIdOverride ?? getActiveChallengeId();
    if (!challengeId) return;
    const currentInstance = instanceByChallenge.get(challengeId) || instanceId;
    if (!currentInstance) return;
    startInFlight = false;
    if (startBtn) startBtn.disabled = true;
    try {
      await api("stop", "POST", {
        challenge_id: challengeId,
        instance_id: currentInstance,
      });
      if (instanceId === currentInstance) instanceId = null;
      instanceByChallenge.delete(challengeId);
      saveInstanceId(null);
      setButtons(false);
      clearPolling();
      updateStatus({ status: "stopped" });
    } finally {
      if (startBtn) startBtn.disabled = false;
    }
  }

  // Bind UI elements and bootstrap status.
  function initK8sInstanceUI() {
    modalRoot =
      document.querySelector(".modal.show .modal-dialog[x-init]") ||
      document.querySelector(".modal.in .modal-dialog[x-init]") ||
      document.querySelector(".modal-dialog[x-init]") ||
      null;
    const scope = modalRoot || document;
    startBtn = scope.querySelector("#start-instance");
    stopBtn = scope.querySelector("#stop-instance");
    extendBtn = scope.querySelector("#extend-instance");
    if (!modalRoot && startBtn) {
      modalRoot =
        startBtn.closest(".modal-dialog") ||
        startBtn.closest(".modal") ||
        startBtn.closest(".modal-content") ||
        null;
    }
    activeChallengeId = visibleChallengeId() ?? challengeId(modalRoot);
    if (startBtn && activeChallengeId) startBtn.dataset.challengeId = String(activeChallengeId);
    if (stopBtn) stopBtn.style.display = "none";
    setButtons(false);
    bindGlobalClickHandler();
    bindModalCloseHandler();
    instanceId = loadInstanceId();
    const session = currentSession;
    const runStatusCheck = () => {
      if (session !== currentSession) return;
      const challengeId = getActiveChallengeId();
      if (!challengeId) {
        setTimeout(runStatusCheck, 150);
        return;
      }
      const statusPayload = { challenge_id: challengeId };
      const currentInstance = instanceByChallenge.get(challengeId) || instanceId;
      if (currentInstance) statusPayload.instance_id = currentInstance;
      api("status", "GET", statusPayload)
        .then((data) => {
          if (session !== currentSession) return;
          if (data.instance_id) {
            instanceId = data.instance_id;
            instanceByChallenge.set(challengeId, data.instance_id);
            saveInstanceId(data.instance_id);
            setButtons(true);
            updateStatus(data);
            startPolling();
          } else {
            instanceId = null;
            instanceByChallenge.delete(challengeId);
            saveInstanceId(null);
            setButtons(false);
            updateStatus({ status: "stopped" });
          }
          const status = data.status || data.pod_phase;
          if (status === "expired" || status === "stopped") {
            instanceByChallenge.delete(challengeId);
            if (instanceId === data.instance_id) instanceId = null;
            saveInstanceId(null);
          }
        })
        .catch(() => {
          if (session === currentSession) {
            instanceId = null;
            saveInstanceId(null);
            setButtons(false);
          }
        });
    };
    setTimeout(runStatusCheck, 150);
  }

  // Toggle start/extend button states.
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
      startBtn.disabled = false;
      if (extendBtn) extendBtn.disabled = false;
    } else {
      startBtn.dataset.mode = "stopped";
      startBtn.classList.remove("btn-danger");
      startBtn.classList.add("btn-success");
      startBtn.innerHTML = '<i class="fas fa-play"></i> Start Instance';
      startBtn.disabled = false;
      if (extendBtn) extendBtn.disabled = true;
    }
  }

  // One global click handler (guards against duplicate script loads).
  function bindGlobalClickHandler() {
    const existingHandler = window.__k8sInstanceClickHandler;
    if (existingHandler) {
      document.removeEventListener("click", existingHandler);
    }
    if (globalClickBound && existingHandler) return;
    const handler = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("#start-instance, #stop-instance, #extend-instance");
      if (!button) return;

      if (button.id === "start-instance") {
        const mode = button.dataset.mode || "stopped";
        if (mode === "running") {
          const challengeId = challengeIdForElement(button);
          activeChallengeId = challengeId;
          stopInstance(challengeId).catch(() => {});
        } else {
          const challengeId = challengeIdForElement(button);
          const currentInstance = instanceByChallenge.get(challengeId);
          if (startInFlight || currentInstance) return;
          activeChallengeId = challengeId;
          button.dataset.mode = "starting";
          button.disabled = true;
          startInstance(challengeId).catch(() => {});
        }
      } else if (button.id === "stop-instance") {
        const challengeId = challengeIdForElement(button);
        activeChallengeId = challengeId;
        stopInstance(challengeId).catch(() => {});
      } else if (button.id === "extend-instance") {
        const challengeId = challengeIdForElement(button);
        activeChallengeId = challengeId;
        const currentInstance = instanceByChallenge.get(challengeId) || instanceId;
        if (!currentInstance) return;
        const extendSeconds = parseInt(button.dataset.extendSeconds || "300");
        api("extend", "POST", {
          challenge_id: challengeId,
          instance_id: currentInstance,
          extend_seconds: Number.isNaN(extendSeconds) ? 300 : extendSeconds,
        })
          .then(() => api("status", "GET", { challenge_id: challengeId, instance_id: currentInstance }))
          .then(updateStatus)
          .catch(() => {});
      }
    };
    document.addEventListener("click", handler);
    window.__k8sInstanceClickHandler = handler;
    window.__k8sInstanceClickBound = true;
    globalClickBound = true;
  }

  // Clear polling when the modal closes.
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
