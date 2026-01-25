Safely Commit and Push Changes

- run `bun run check` to make sure everything is working. if not, fix it.

- make sure that everything in the working copy is committed

- git pull --rebase from remote main branch

- resolve any rebase conflicts

- run `bun run check` again if any new commits came from remote or if you rebased.
  - if its not working, fix it until `bun run check` passes, and then commit working copy again.

- push to remote