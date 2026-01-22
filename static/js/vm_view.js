(function () {
    // Ensure CTFd challenge system exists
    if (!CTFd || !CTFd._internal || !CTFd._internal.challenge) {
        console.error("CTFd challenge system not found");
        return;
    }

    // Extend the existing challenge handler (DO NOT overwrite)
    CTFd._internal.challenge = {
        ...CTFd._internal.challenge,

        data: {},

        /**
         * Called before the modal is rendered
         */
        preRender: function () {
            return Promise.resolve();
        },

        /**
         * Called with challenge data from API
         */
        render: function (challenge) {
            this.data = challenge;
            return Promise.resolve();
        },

        /**
         * Called after modal HTML is in the DOM
         */
        postRender: function () {
            const bind = (id, handler) => {
                const el = document.getElementById(id);
                if (el) {
                    el.addEventListener("click", handler.bind(this));
                }
            };

            bind("start-instance", this.startInstance);
            bind("stop-instance", this.stopInstance);
            bind("status-instance", this.statusInstance);

            return Promise.resolve();
        },

        /**
         * Start a per-user instance
         */
        startInstance: function () {
            if (!this.data?.id) return;

            fetch(`/plugins/dynamic_instances/${this.data.id}/start`, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                }
            })
                .then(r => r.json())
                .then(data => {
                    const info = document.getElementById("instance-info");
                    if (info) {
                        info.textContent = JSON.stringify(data, null, 2);
                    }
                })
                .catch(err => {
                    console.error(err);
                });
        },

        /**
         * Stop the user instance
         */
        stopInstance: function () {
            if (!this.data?.id) return;

            fetch(`/plugins/dynamic_instances/${this.data.id}/stop`, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json"
                }
            })
                .then(r => r.json())
                .then(data => {
                    const info = document.getElementById("instance-info");
                    if (info) {
                        info.textContent = JSON.stringify(data, null, 2);
                    }
                })
                .catch(err => {
                    console.error(err);
                });
        },

        /**
         * Get instance status
         */
        statusInstance: function () {
            if (!this.data?.id) return;

            fetch(`/plugins/dynamic_instances/${this.data.id}/status`, {
                method: "GET",
                credentials: "same-origin"
            })
                .then(r => r.json())
                .then(data => {
                    const info = document.getElementById("instance-info");
                    if (info) {
                        info.textContent = JSON.stringify(data, null, 2);
                    }
                })
                .catch(err => {
                    console.error(err);
                });
        }
    };
})();
