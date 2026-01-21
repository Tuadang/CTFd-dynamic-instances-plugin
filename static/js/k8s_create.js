CTFd.plugin.run((_CTFd) => {
    const $ = _CTFd.lib.$
    const md = _CTFd.lib.markdown()

    // Trigger the post-creation popup (flags, files, hints, etc.)
    window.challenge.postCreate = function (result) {
        $('#challenge-options-modal').modal('show')
    }
})
